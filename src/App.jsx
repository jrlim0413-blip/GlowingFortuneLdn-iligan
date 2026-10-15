import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LoginPage from './LoginPage'
import RbacManagementView from './RbacManagementView'
import CommissionManagementView from './CommissionManagementView'
import FacebookProfileDropdown from './FacebookProfileDropdown'
import DeficitInspectorModal from './DeficitInspectorModal'
import DrawDeficitsExcelStatement from './DrawDeficitsExcelStatement'
import AutoShrinkText from './AutoShrinkText'
import CustomPrintBrowserModal from './CustomPrintBrowserModal'
import './CustomPrintBrowserModal.css'
import { loadCommissionSettings, getAgentCommissionRate } from './commissions'
import {
  signOutFromSupabase,
  syncMatrixPermissionsFromSupabase,
  syncCommissionSettingsFromSupabase,
  subscribeToMatrixRealtime,
  isSupabaseConfigured,
  bootFromCloud,
  getCloudSession,
  updateCloudSession,
  revokeCloudSession,
  getSessionTokenFromUrl,
  setSessionTokenInUrl,
} from './supabase'
import {
  getRbacRoles,
  getRbacUsers,
  getUserEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  DEFAULT_ROLES,
  DEFAULT_USERS,
} from './rbac'
import './App.css'

const tellerApiUrl = import.meta.env.VITE_API_URL || 'https://stl-ldn-api.com/api/accountant/TellerGrossPerDay?id=5&from=2026-10-09&to=2026-10-10'
const drawApiUrl = import.meta.env.VITE_DRAW_API_URL || 'https://stl-ldn-api.com/api/accountant/GrossPerDraw?id=5&drawId=1463&from=2026-10-10&to=2026-10-11'
const drawIds = ((import.meta.env.VITE_DRAW_IDS ?? '248,249,250,251,252,253')).split(',').map((value) => value.trim()).filter(Boolean)
const overallApiUrl = import.meta.env.VITE_OVERALL_API_URL || 'https://stl-ldn-api.com/api/accountant/OverAllReports?id=5&from=2026-10-10&to=2026-10-11'
const supervisorApiUrl = import.meta.env.VITE_SUPERVISOR_API_URL || 'https://stl-ldn-api.com/api/accountant/AccountantSpvrWithGross?id=5&from=2026-10-09&to=2026-10-10'
const authorization = import.meta.env.VITE_AUTHORIZATION || '74242|PwJgY3Ia4jzsBUGsfyedB3BvpelUP0Sb9XxcYZmE'
const configuredBranch = import.meta.env.VITE_BRANCH_NAME || 'LDN'

function getCurrentDate() {
  return formatDate(new Date())
}

function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function getPreviousDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`)
  date.setDate(date.getDate() - 1)
  return formatDate(date)
}

function getNextDate(dateValue) {
  const nextDate = new Date(`${dateValue}T00:00:00`)
  nextDate.setDate(nextDate.getDate() + 1)
  return formatDate(nextDate)
}

function getYesterdayDate() {
  return getPreviousDate(getCurrentDate())
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '—'
  const today = getCurrentDate()
  const yesterday = getYesterdayDate()
  const date = new Date(`${dateValue}T00:00:00`)
  const options = { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' }
  const formatted = date.toLocaleDateString('en-US', options)

  if (dateValue === today) return `Today (${formatted})`
  if (dateValue === yesterday) return `Yesterday (${formatted})`
  return formatted
}

const defaultFromDate = getCurrentDate()

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return [{ value: payload }]

  const collection = payload.data ?? payload.results ?? payload.items ?? payload.rows
  if (Array.isArray(collection)) return collection
  return [payload]
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function formatAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function formatDrawTime(value) {
  const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/)
  if (!match) return formatValue(value)

  const hour = Number(match[1])
  const minutes = match[2] ?? '00'
  if (hour < 0 || hour > 23) return formatValue(value)

  const period = hour >= 12 ? 'PM' : 'AM'
  const twelveHour = hour % 12 || 12
  return `${twelveHour}:${minutes} ${period}`
}

function formatReportValue(value, column) {
  return column === 'drawTime' ? formatDrawTime(value) : formatValue(value)
}

export function Icon({ name, size = 18 }) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.75" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.75" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.75" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.75" />
      </>
    ),
    reports: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </>
    ),
    activity: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    ),
    money: (
      <>
        <rect width="20" height="12" x="2" y="6" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
      </>
    ),
    fields: (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    ),
    check: (
      <polyline points="20 6 9 17 4 12" />
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 21h5v-5" />
      </>
    ),
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    calendar: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2.5" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <polyline points="3 3 3 8 8 8" />
        <polyline points="12 7 12 12 15 15" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
    gauge: (
      <>
        <path d="m12 14 3-3" />
        <path d="M3.34 19a10 10 0 1 1 17.32 0" />
      </>
    ),
    trending: (
      <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </>
    ),
    print: (
      <>
        <polyline points="6 9 6 3 18 3 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect width="12" height="7" x="6" y="14" rx="1" />
      </>
    ),
    fileText: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7.5" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </>
    ),
    trophy: (
      <>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
        <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
      </>
    ),
    percent: (
      <>
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </>
    ),
    sparkles: (
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    ),
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2.5" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ),
    shieldCheck: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    logOut: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    ),
    check: <polyline points="20 6 9 17 4 12" />,
  }
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function getColumns(rows) {
  const columns = []
  rows.forEach((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => {
        if (!columns.includes(key)) columns.push(key)
      })
    }
  })
  return columns
}

const agentFieldNames = ['agentName', 'agent_name', 'agent', 'AgentName', 'agentCode', 'fullName', 'username']
const supervisorFieldNames = ['supervisorUsername', 'supervisorName', 'supervisor_name', 'SupervisorName', 'supervisorCode', 'supervisor', 'name']
const drawGroups = [
  { key: 'morning', label: '1st Draw', schedule: '10:30 AM + 2:00 PM', times: ['10:30 AM', '2:00 PM'] },
  { key: 'afternoon', label: '2nd Draw', schedule: '3:00 PM + 5:00 PM', times: ['3:00 PM', '5:00 PM'] },
  { key: 'evening', label: '3rd Draw', schedule: '7:00 PM + 9:00 PM', times: ['7:00 PM', '9:00 PM'] },
]

function getFirstField(row, fieldNames) {
  const fieldName = fieldNames.find((name) => row?.[name] !== undefined && row[name] !== null && row[name] !== '')
  return fieldName ? row[fieldName] : null
}

function getSupervisorReports(rows, supervisorRows = [], commissionSettings = null) {
  const supervisorNames = new Map(supervisorRows.map((row) => [String(row.username), row.fullName]))
  const supervisorNamesById = new Map(supervisorRows.map((row) => [String(row.id), row.fullName]))
  const grouped = new Map()
  rows.forEach((row) => {
    const supervisorUsername = String(row.supervisorUsername ?? '')
    const supervisor = formatValue(supervisorNamesById.get(String(row.supervisor)) ?? supervisorNames.get(supervisorUsername) ?? getFirstField(row, supervisorFieldNames)).toUpperCase()
    const gross = Number(row.TotalOverAllGross) || 0
    const hits = Number(row.TotalOverAllHits) || 0
    const teller = formatValue(row.fullName ?? row.username)
    const tellerKey = formatValue(row.username ?? row.fullName ?? teller)
    const current = grouped.get(supervisor) ?? { supervisor, agents: new Map(), totalGross: 0, totalHits: 0 }
    const drawTime = formatDrawTime(row.drawTime)
    const agent = current.agents.get(tellerKey) ?? { key: tellerKey, teller, draws: new Map(), totalGross: 0, totalHits: 0 }
    const draw = agent.draws.get(drawTime) ?? { gross: 0, hits: 0 }
    draw.gross += gross
    draw.hits += hits
    agent.draws.set(drawTime, draw)
    agent.totalGross += gross
    agent.totalHits += hits
    current.agents.set(tellerKey, agent)
    current.totalGross += gross
    current.totalHits += hits
    grouped.set(supervisor, current)
  })

  return Array.from(grouped.values()).map((group) => {
    let groupSalary = 0
    const agents = Array.from(group.agents.values()).map((agent) => {
      const rateInfo = getAgentCommissionRate(group.supervisor, agent.key, commissionSettings)
      const commissionRate = rateInfo.rate / 100
      const totalSalary = agent.totalGross * commissionRate
      const totalNet = agent.totalGross - agent.totalHits
      const totalKabig = totalNet - totalSalary
      groupSalary += totalSalary

      return {
        ...agent,
        commissionRate: rateInfo.rate,
        isCommissionOverride: rateInfo.isOverride,
        supervisorDefaultRate: rateInfo.supervisorDefault,
        totalNet,
        totalSalary,
        totalKabig,
      }
    })

    const totalNet = group.totalGross - group.totalHits
    const totalKabig = totalNet - groupSalary

    return {
      ...group,
      agents,
      totalNet,
      totalSalary: groupSalary,
      totalKabig,
    }
  })
}

function getGroupedDrawTotal(agent, group, field) {
  return group.times.reduce((total, time) => total + (agent.draws.get(time)?.[field] ?? 0), 0)
}

function getCarryoverTotal(agent) {
  const firstDrawNet = getGroupedDrawTotal(agent, drawGroups[0], 'gross') - getGroupedDrawTotal(agent, drawGroups[0], 'hits')
  const secondDrawGross = getGroupedDrawTotal(agent, drawGroups[1], 'gross')
  return Math.max(firstDrawNet, 0) + secondDrawGross
}

function getGroupedNet(agent, group) {
  const gross = getGroupedDrawTotal(agent, group, 'gross')
  const hits = getGroupedDrawTotal(agent, group, 'hits')
  if (group.key === 'afternoon') return getCarryoverTotal(agent) - hits
  if (group.key === 'evening') return getThirdDrawCarryover(agent) - hits
  return gross - hits
}

function getSupervisorCarryoverTotal(group) {
  return group.agents.reduce((total, agent) => total + getCarryoverTotal(agent), 0)
}

function getThirdDrawCarryover(agent) {
  const secondDrawNet = getGroupedNet(agent, drawGroups[1])
  const thirdDrawGross = getGroupedDrawTotal(agent, drawGroups[2], 'gross')
  return Math.max(secondDrawNet, 0) + thirdDrawGross
}

function getSupervisorThirdDrawCarryover(group) {
  return group.agents.reduce((total, agent) => total + getThirdDrawCarryover(agent), 0)
}

function DrawGrossSummary({ supervisorReports }) {
  const totals = drawGroups.map((group) => {
    let gross = 0
    let hits = 0
    supervisorReports.forEach((supervisorGroup) => {
      supervisorGroup.agents.forEach((agent) => {
        gross += getGroupedDrawTotal(agent, group, 'gross')
        hits += getGroupedDrawTotal(agent, group, 'hits')
      })
    })
    return {
      ...group,
      gross,
      hits,
    }
  })

  const overallGross = totals.reduce((total, group) => total + group.gross, 0)
  const overallHits = totals.reduce((total, group) => total + group.hits, 0)
  const overallCommission = supervisorReports.reduce(
    (total, group) => total + (group.totalSalary !== undefined ? group.totalSalary : group.agents.reduce((agentTotal, agent) => agentTotal + (agent.totalSalary !== undefined ? agent.totalSalary : (agent.totalGross * ((agent.commissionRate || 10) / 100))), 0)),
    0
  )
  const overallNetSales = overallGross - (overallHits + overallCommission)

  return (
    <section className="draw-summary" aria-label="Total gross and hits per draw summary">
      <div className="draw-summary-heading">
        <div>
          <strong>Total gross &amp; hits per draw</strong>
          <span>Consolidated from frontend supervisor rows</span>
        </div>
        <div className="draw-summary-heading-totals">
          <div className="summary-total-chip gross-chip">
            <small>Overall Gross</small>
            <strong>{formatAmount(overallGross)}</strong>
          </div>
          <div className="summary-total-chip hits-chip">
            <small>Overall Hits</small>
            <strong>{formatAmount(overallHits)}</strong>
          </div>
          <div className="summary-total-chip commission-chip">
            <small>Commission</small>
            <strong>{formatAmount(overallCommission)}</strong>
          </div>
          <div className={`summary-total-chip net-sales-chip ${overallNetSales < 0 ? 'negative-val' : ''}`}>
            <small>Net Sales</small>
            <strong>{formatAmount(overallNetSales)}</strong>
          </div>
        </div>
      </div>
      <div className="draw-summary-grid">
        {totals.map((group) => (
          <div className={`draw-summary-card draw-${group.key}`} key={group.key}>
            <div className="draw-card-header">
              <span className="draw-card-label">{group.label.toUpperCase()}</span>
              <small className="draw-card-schedule">{group.schedule}</small>
            </div>
            <div className="draw-card-values">
              <div className="draw-value-col">
                <small>Gross</small>
                <strong className="draw-gross-num">{formatAmount(group.gross)}</strong>
              </div>
              <div className="draw-value-col">
                <small>Hits</small>
                <strong className="draw-hits-num">{formatAmount(group.hits)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}



function MatrixTable({ group, showOverall = false }) {
  const supervisorTotalCommission = group.totalSalary !== undefined
    ? group.totalSalary
    : group.agents.reduce((total, a) => total + (a.totalSalary !== undefined ? a.totalSalary : a.totalGross * ((a.commissionRate || 10) / 100)), 0)

  const supervisorOverallNet = group.totalGross - group.totalHits
  const supervisorOverallNetSales = supervisorOverallNet - supervisorTotalCommission

  const supervisorPositiveThirdNetSales = group.agents.reduce((total, agent) => {
    const agentOverallCommission = agent.totalSalary !== undefined ? agent.totalSalary : agent.totalGross * ((agent.commissionRate || 10) / 100)
    const agentThirdNetSales = getGroupedNet(agent, drawGroups[2]) - agentOverallCommission
    return total + (agentThirdNetSales > 0 ? agentThirdNetSales : 0)
  }, 0)

  return (
    <div className="table-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="agent-header" rowSpan="2">Agent</th>
            {drawGroups.map((drawGroup) => <th className={`draw-group-heading draw-${drawGroup.key}`} colSpan={drawGroup.key === 'morning' ? 3 : 4} key={drawGroup.key}><span>{drawGroup.label}</span><small>{drawGroup.schedule}</small></th>)}
            <th className="draw-group-heading draw-commission" rowSpan="2"><span>Commission</span><small>Rates by Supervisor</small></th>
            <th className="draw-group-heading draw-net-sales" rowSpan="2"><span>Net Sales</span><small>3rd Net - Commission</small></th>
            {showOverall && (
              <>
                <th className="draw-separator-col" rowSpan="2" aria-hidden="true"></th>
                <th className="draw-group-heading draw-overall" colSpan="5"><span>Overall</span><small>All draws</small></th>
              </>
            )}
          </tr>
          <tr>
            {drawGroups.flatMap((drawGroup) => [
              <th className={`draw-subheading draw-${drawGroup.key}`} key={`${drawGroup.key}-gross`}><span className="draw-header-label">Gross</span></th>,
              <th className={`draw-subheading draw-${drawGroup.key}`} key={`${drawGroup.key}-hits`}><span className="draw-header-label">Hits</span></th>,
              ...(drawGroup.key === 'afternoon' ? [<th className="draw-subheading draw-afternoon carryover-header" key="afternoon-carryover" title="1st Draw Net + 2nd Draw Gross"><small>1st Net + 2nd Gross</small></th>] : []),
              ...(drawGroup.key === 'evening' ? [<th className="draw-subheading draw-evening carryover-header" key="evening-carryover" title="2nd Draw Net + 3rd Draw Gross"><small>2nd Net + 3rd Gross</small></th>] : []),
              <th className={`draw-subheading draw-${drawGroup.key}`} key={`${drawGroup.key}-net`}><span className="draw-header-label">Net</span></th>,
            ])}
            {showOverall && (
              <>
                <th className="draw-subheading draw-overall"><span className="draw-header-label">Gross</span></th>
                <th className="draw-subheading draw-overall"><span className="draw-header-label">Hits</span></th>
                <th className="draw-subheading draw-overall"><span className="draw-header-label">Commission</span></th>
                <th className="draw-subheading draw-overall"><span className="draw-header-label">Net</span></th>
                <th className="draw-subheading draw-overall"><span className="draw-header-label">Net Sales</span></th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {group.agents.map((agent) => {
            const agentOverallNet = agent.totalGross - agent.totalHits
            const agentOverallCommission = agent.totalSalary !== undefined ? agent.totalSalary : agent.totalGross * ((agent.commissionRate || 10) / 100)
            const agentOverallNetSales = agentOverallNet - agentOverallCommission
            const agentThirdNetSales = getGroupedNet(agent, drawGroups[2]) - agentOverallCommission
            return (
              <tr key={`${group.supervisor}-${agent.key}`}>
                <td className="agent-name-cell"><strong>{agent.teller}</strong></td>
                {drawGroups.flatMap((drawGroup) => {
                  const gross = getGroupedDrawTotal(agent, drawGroup, 'gross')
                  const hits = getGroupedDrawTotal(agent, drawGroup, 'hits')
                  const net = getGroupedNet(agent, drawGroup)
                  const carryover = getCarryoverTotal(agent)
                  const thirdCarryover = getThirdDrawCarryover(agent)
                  return [
                    <td className={`draw-cell draw-${drawGroup.key} ${gross < 0 ? 'negative-value' : ''}`} key={`${agent.key}-${drawGroup.key}-gross`}>{formatAmount(gross)}</td>,
                    <td className={`draw-cell draw-${drawGroup.key} ${hits < 0 ? 'negative-value' : ''}`} key={`${agent.key}-${drawGroup.key}-hits`}>{formatAmount(hits)}</td>,
                    ...(drawGroup.key === 'afternoon' ? [<td className={`draw-cell draw-afternoon carryover-cell ${carryover < 0 ? 'negative-value' : ''}`} key={`${agent.key}-carryover`}>{formatAmount(carryover)}</td>] : []),
                    ...(drawGroup.key === 'evening' ? [<td className={`draw-cell draw-evening carryover-cell ${thirdCarryover < 0 ? 'negative-value' : ''}`} key={`${agent.key}-third-carryover`}>{formatAmount(thirdCarryover)}</td>] : []),
                    <td className={`draw-cell draw-${drawGroup.key} net-cell ${net < 0 ? 'negative-value' : ''}`} key={`${agent.key}-${drawGroup.key}-net`}>{formatAmount(net)}</td>,
                  ]
                })}
                <td className="draw-cell draw-commission">
                  <strong>{formatAmount(agentOverallCommission)}</strong>
                  {agent.commissionRate && (
                    <small style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>({agent.commissionRate}%)</small>
                  )}
                </td>
                <td className={`draw-cell draw-net-sales ${agentThirdNetSales < 0 ? 'negative-value' : ''}`}><strong>{formatAmount(agentThirdNetSales)}</strong></td>
                {showOverall && (
                  <>
                    <td className="draw-separator-cell" aria-hidden="true" />
                    <td className="draw-cell draw-overall"><strong>{formatAmount(agent.totalGross)}</strong></td>
                    <td className="draw-cell draw-overall"><strong>{formatAmount(agent.totalHits)}</strong></td>
                    <td className="draw-cell draw-overall">
                      <strong>{formatAmount(agentOverallCommission)}</strong>
                      {agent.commissionRate && (
                        <small style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>({agent.commissionRate}%)</small>
                      )}
                    </td>
                    <td className="draw-cell draw-overall net-cell"><strong>{formatAmount(agentOverallNet)}</strong></td>
                    <td className={`draw-cell draw-overall draw-overall-net-sales ${agentOverallNetSales < 0 ? 'negative-value' : ''}`}><strong>{formatAmount(agentOverallNetSales)}</strong></td>
                  </>
                )}
              </tr>
            )
          })}
          <tr className="total-row">
            <td className="agent-name-cell total-agent-cell"><strong>Supervisor total</strong></td>
            {drawGroups.flatMap((drawGroup) => {
              const gross = group.agents.reduce((total, agent) => total + getGroupedDrawTotal(agent, drawGroup, 'gross'), 0)
              const hits = group.agents.reduce((total, agent) => total + getGroupedDrawTotal(agent, drawGroup, 'hits'), 0)
              const net = drawGroup.key === 'afternoon'
                ? getSupervisorCarryoverTotal(group) - hits
                : drawGroup.key === 'evening'
                  ? getSupervisorThirdDrawCarryover(group) - hits
                  : gross - hits
              const carryover = getSupervisorCarryoverTotal(group)
              const thirdCarryover = getSupervisorThirdDrawCarryover(group)
              return [
                <td className={`draw-cell draw-${drawGroup.key} ${gross < 0 ? 'negative-value' : ''}`} key={`total-${drawGroup.key}-gross`}><strong>{formatAmount(gross)}</strong></td>,
                <td className={`draw-cell draw-${drawGroup.key} ${hits < 0 ? 'negative-value' : ''}`} key={`total-${drawGroup.key}-hits`}><strong>{formatAmount(hits)}</strong></td>,
                ...(drawGroup.key === 'afternoon' ? [<td className={`draw-cell draw-afternoon carryover-cell ${carryover < 0 ? 'negative-value' : ''}`} key="total-carryover"><strong>{formatAmount(carryover)}</strong></td>] : []),
                ...(drawGroup.key === 'evening' ? [<td className={`draw-cell draw-evening carryover-cell ${thirdCarryover < 0 ? 'negative-value' : ''}`} key="total-third-carryover"><strong>{formatAmount(thirdCarryover)}</strong></td>] : []),
                <td className={`draw-cell draw-${drawGroup.key} net-cell ${net < 0 ? 'negative-value' : ''}`} key={`total-${drawGroup.key}-net`}><strong>{formatAmount(net)}</strong></td>,
              ]
            })}
            <td className="draw-cell draw-commission"><strong>{formatAmount(supervisorTotalCommission)}</strong></td>
            <td className="draw-cell draw-net-sales"><strong>{formatAmount(supervisorPositiveThirdNetSales)}</strong></td>
            {showOverall && (
              <>
                <td className="draw-separator-cell" aria-hidden="true" />
                <td className="draw-cell draw-overall"><strong>{formatAmount(group.totalGross)}</strong></td>
                <td className="draw-cell draw-overall"><strong>{formatAmount(group.totalHits)}</strong></td>
                <td className="draw-cell draw-overall"><strong>{formatAmount(supervisorTotalCommission)}</strong></td>
                <td className="draw-cell draw-overall net-cell"><strong>{formatAmount(supervisorOverallNet)}</strong></td>
                <td className={`draw-cell draw-overall draw-overall-net-sales ${supervisorOverallNetSales < 0 ? 'negative-value' : ''}`}><strong>{formatAmount(supervisorOverallNetSales)}</strong></td>
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function getAgentOverallMetrics(agent) {
  const gross = Number(agent.totalGross) || 0
  const hits = Number(agent.totalHits) || 0
  const commission = agent.totalSalary !== undefined ? Number(agent.totalSalary) : gross * 0.1
  const net = gross - hits
  const netSales = net - commission
  return { gross, hits, commission, net, netSales }
}

function splitAgentsByRemittance(agents = []) {
  const positive = []
  const negative = []

  agents.forEach((agent) => {
    const metrics = getAgentOverallMetrics(agent)
    if (metrics.netSales >= 0) {
      positive.push({ ...agent, ...metrics })
    } else {
      negative.push({ ...agent, ...metrics })
    }
  })

  return { positive, negative }
}

function calculateMetricsTotals(list = []) {
  return list.reduce(
    (acc, item) => ({
      gross: acc.gross + item.gross,
      hits: acc.hits + item.hits,
      commission: acc.commission + item.commission,
      net: acc.net + item.net,
      netSales: acc.netSales + item.netSales,
    }),
    { gross: 0, hits: 0, commission: 0, net: 0, netSales: 0 }
  )
}

const PAPER_BUDGETS = {
  longBond: { w: 756, h: 1188 }, 
  a4:       { w: 756, h: 1026 }, 
}

function calculateAutoFitScale(agentCount, paperType = 'a4') {
  const budget = PAPER_BUDGETS[paperType] || PAPER_BUDGETS.a4
  const fixedPx = 546
  const rowPx = 17 
  const estimatedHeight = fixedPx + agentCount * rowPx
  if (estimatedHeight <= budget.h) return 100
  const exact = Math.floor((budget.h / estimatedHeight) * 100)
  return Math.min(100, Math.max(55, exact))
}

function SupervisorStatementTable({
  group,
  allSupervisors = [],
  selectedDate,
  branchName = configuredBranch,
  isModal = false,
  fitOnePage = true,
  fontScale = 100,
  densityTier = 'density-standard',
}) {
  const { positive, negative } = splitAgentsByRemittance(group?.agents || [])
  const positiveTotals = calculateMetricsTotals(positive)
  const negativeTotals = calculateMetricsTotals(negative)
  const grandTotals = {
    gross: positiveTotals.gross + negativeTotals.gross,
    hits: positiveTotals.hits + negativeTotals.hits,
    commission: positiveTotals.commission + negativeTotals.commission,
    net: positiveTotals.net + negativeTotals.net,
    netSales: positiveTotals.netSales + negativeTotals.netSales,
  }

  const sheetRef = useRef(null)
  const wrapRef  = useRef(null)
  const [computedScale, setComputedScale] = useState(fitOnePage ? (fontScale || 100) : 100)

  useLayoutEffect(() => {
    if (!fitOnePage || !sheetRef.current || !wrapRef.current) return

    let raf = 0
    const measureFit = () => {
      cancelAnimationFrame(raf)
      sheetRef.current.style.transform = ''
      sheetRef.current.style.transformOrigin = ''
      sheetRef.current.style.width = ''

      raf = requestAnimationFrame(() => {
      const contentH = sheetRef.current?.scrollHeight || 0
      const contentW = sheetRef.current?.scrollWidth  || 0
      const wrapW    = wrapRef.current?.clientWidth   || 800

      const availH = PAPER_BUDGETS.a4.h
      const availW = wrapW

      const scaleH = availH / contentH
      const scaleW = availW / contentW
      const scale  = Math.min(scaleH, scaleW, 1) 

      const pct = Math.max(55, Math.floor(scale * 100))
      setComputedScale(pct)
      })
    }

    measureFit()
    const resizeObserver = new ResizeObserver(measureFit)
    resizeObserver.observe(wrapRef.current)
    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
    }
  }, [fitOnePage, group?.agents?.length, group?.supervisor])

  useLayoutEffect(() => {
    if (!fitOnePage || !sheetRef.current) return
    if (computedScale < 100) {
      const s = (computedScale / 100).toFixed(4)
      sheetRef.current.style.transformOrigin = 'top left'
      sheetRef.current.style.transform = `scale(${s})`
      sheetRef.current.style.width = `${(100 / (computedScale / 100)).toFixed(2)}%`
    } else {
      sheetRef.current.style.transform = ''
      sheetRef.current.style.transformOrigin = ''
      sheetRef.current.style.width = ''
    }
  }, [computedScale, fitOnePage])

  return (
    <div ref={wrapRef} style={{ overflow: 'hidden', width: '100%', position: 'relative' }}>
    <div
      ref={sheetRef}
      className={`statement-sheet ${isModal ? 'statement-sheet-modal' : 'statement-sheet-inline'} ${fitOnePage ? 'a4-single-page-fit' : ''}`}
      style={{ display: 'block', boxSizing: 'border-box' }}
    >
      {}
      <div className="statement-header-block">
        <h3 className="statement-company-title">GLOWING FORTUNE CORPORATION</h3>
        <h4 className="statement-report-title">CONDENSED SUPERVISOR AGENT REMITTANCE SUMMARY</h4>
        <p className="statement-report-subtitle">(Unaudited — Official Draw Performance &amp; Accounting Ledger)</p>
        <div className="statement-meta-row">
          <span className="statement-meta-pill"><strong>BRANCH:</strong> {branchName}</span>
          <span className="statement-meta-divider">•</span>
          <span className="statement-meta-pill"><strong>SUPERVISOR:</strong> {group?.supervisor || 'ALL'}</span>
          <span className="statement-meta-divider">•</span>
          <span className="statement-meta-pill"><strong>DATE:</strong> {formatDisplayDate(selectedDate)}</span>
          <span className="statement-meta-divider">•</span>
          <span className="statement-meta-pill"><strong>TOTAL AGENTS:</strong> {group?.agents?.length || 0}</span>
        </div>
      </div>

      {}
      <div className="statement-two-col-body">

        {}
        <div className="statement-left-col">
          <div className="statement-col-label">OFFICIAL REMITTANCE STATEMENT</div>
          <div className="statement-table-container">
            <table className="statement-balance-table">
              <thead>
                <tr className="statement-th-row">
                  <th className="statement-th statement-th-agent">AGENT / TELLER</th>
                  <th className="statement-th statement-th-num">GROSS</th>
                  <th className="statement-th statement-th-num">HITS</th>
                  <th className="statement-th statement-th-num">COMM</th>
                  <th className="statement-th statement-th-num">NET</th>
                  <th className="statement-th statement-th-num statement-th-remit">REMITTANCE</th>
                </tr>
              </thead>
              <tbody>
                <tr className="statement-section-divider-row">
                  <td colSpan={6} className="statement-section-heading-cell">
                    <strong>POSITIVE REMITTANCES (TO COLLECT):</strong>
                  </td>
                </tr>

                {positive.length === 0 ? (
                  <tr className="statement-empty-state-row">
                    <td colSpan={6} className="statement-empty-state-cell">
                      No positive remittance agents recorded for this period.
                    </td>
                  </tr>
                ) : (
                  positive.map((agent, index) => (
                    <tr key={`pos-${agent.key || index}`} className="statement-data-row statement-pos-row">
                      <td className="statement-td statement-agent-td">
                        <span className="statement-agent-name">{agent.teller}</span>
                      </td>
                      <td className="statement-td statement-num-td">
                        {index === 0 && <span className="accounting-currency-symbol">₱</span>}
                        {formatAmount(agent.gross)}
                      </td>
                      <td className="statement-td statement-num-td">{formatAmount(agent.hits)}</td>
                      <td className="statement-td statement-num-td">
                        {formatAmount(agent.commission)}
                        {agent.commissionRate && (
                          <small style={{ display: 'block', fontSize: '8px', color: '#64748b' }}>({agent.commissionRate}%)</small>
                        )}
                      </td>
                      <td className="statement-td statement-num-td">{formatAmount(agent.net)}</td>
                      <td className="statement-td statement-num-td statement-remit-td">
                        {index === 0 && <span className="accounting-currency-symbol">₱</span>}
                        <strong>{formatAmount(agent.netSales)}</strong>
                      </td>
                    </tr>
                  ))
                )}

                <tr className="statement-subtotal-data-row statement-pos-subtotal-row">
                  <td className="statement-td statement-subtotal-label-td">
                    <span className="statement-subtotal-indent">Total Positive (Subtotal)</span>
                  </td>
                  <td className="statement-td statement-subtotal-num-td">
                    <span className="accounting-currency-symbol">₱</span>
                    <strong>{formatAmount(positiveTotals.gross)}</strong>
                  </td>
                  <td className="statement-td statement-subtotal-num-td">
                    <strong>{formatAmount(positiveTotals.hits)}</strong>
                  </td>
                  <td className="statement-td statement-subtotal-num-td">
                    <strong>{formatAmount(positiveTotals.commission)}</strong>
                  </td>
                  <td className="statement-td statement-subtotal-num-td">
                    <strong>{formatAmount(positiveTotals.net)}</strong>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-remit-td">
                    <span className="accounting-currency-symbol">₱</span>
                    <strong>{formatAmount(positiveTotals.netSales)}</strong>
                  </td>
                </tr>

                <tr className="statement-spacer-divider-row" aria-hidden="true">
                  <td colSpan={6} />
                </tr>

                <tr className="statement-section-divider-row statement-negative-header-row">
                  <td colSpan={6} className="statement-section-heading-cell statement-negative-heading-cell">
                    <strong>NEGATIVE DEFICITS:</strong>
                  </td>
                </tr>

                {negative.length === 0 ? (
                  <tr className="statement-empty-state-row">
                    <td colSpan={6} className="statement-empty-state-cell statement-clean-indicator">
                      ✓ No negative deficit records — all {positive.length} agents have positive balances.
                    </td>
                  </tr>
                ) : (
                  negative.map((agent, index) => (
                    <tr key={`neg-${agent.key || index}`} className="statement-data-row statement-neg-row">
                      <td className="statement-td statement-agent-td">
                        <span className="statement-agent-name">{agent.teller}</span>
                      </td>
                      <td className="statement-td statement-num-td">
                        <AutoShrinkText align="right">
                          {index === 0 && <span className="accounting-currency-symbol">₱</span>}
                          {formatAmount(agent.gross)}
                        </AutoShrinkText>
                      </td>
                      <td className="statement-td statement-num-td accounting-deficit-text">
                        <AutoShrinkText align="right">{formatAmount(agent.hits)}</AutoShrinkText>
                      </td>
                      <td className="statement-td statement-num-td">
                        <AutoShrinkText align="right">
                          {formatAmount(agent.commission)}
                          {agent.commissionRate && (
                            <small style={{ display: 'inline-block', marginLeft: '3px', fontSize: '8px', color: '#64748b' }}>({agent.commissionRate}%)</small>
                          )}
                        </AutoShrinkText>
                      </td>
                      <td className="statement-td statement-num-td accounting-deficit-text">
                        <AutoShrinkText align="right">{formatAmount(agent.net)}</AutoShrinkText>
                      </td>
                      <td className="statement-td statement-num-td statement-remit-td accounting-deficit-text">
                        <AutoShrinkText align="right">
                          {index === 0 && <span className="accounting-currency-symbol">₱</span>}
                          <strong>({formatAmount(Math.abs(agent.netSales))})</strong>
                        </AutoShrinkText>
                      </td>
                    </tr>
                  ))
                )}

                <tr className="statement-subtotal-data-row statement-neg-subtotal-row">
                  <td className="statement-td statement-subtotal-label-td">
                    <span className="statement-subtotal-indent statement-neg-label-indent">Total Deficits (Subtotal)</span>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-neg-subtotal-cell">
                    <AutoShrinkText align="right">
                      <span className="accounting-currency-symbol">₱</span>
                      <strong>{formatAmount(negativeTotals.gross)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-neg-subtotal-cell accounting-deficit-text">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(negativeTotals.hits)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-neg-subtotal-cell">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(negativeTotals.commission)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-neg-subtotal-cell accounting-deficit-text">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(negativeTotals.net)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-subtotal-num-td statement-remit-td statement-neg-subtotal-cell accounting-deficit-text">
                    <AutoShrinkText align="right">
                      <span className="accounting-currency-symbol">₱</span>
                      <strong>({formatAmount(Math.abs(negativeTotals.netSales))})</strong>
                    </AutoShrinkText>
                  </td>
                </tr>

                <tr className="statement-spacer-divider-row" aria-hidden="true">
                  <td colSpan={6} />
                </tr>

                <tr className="statement-grand-total-row">
                  <td className="statement-td statement-grand-label-td">
                    <strong>CONSOLIDATED SUPERVISOR TOTAL</strong>
                  </td>
                  <td className="statement-td statement-grand-num-td">
                    <AutoShrinkText align="right">
                      <span className="accounting-currency-symbol">₱</span>
                      <strong>{formatAmount(grandTotals.gross)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-grand-num-td">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(grandTotals.hits)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-grand-num-td">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(grandTotals.commission)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className="statement-td statement-grand-num-td">
                    <AutoShrinkText align="right">
                      <strong>{formatAmount(grandTotals.net)}</strong>
                    </AutoShrinkText>
                  </td>
                  <td className={`statement-td statement-grand-num-td statement-remit-td ${grandTotals.netSales < 0 ? 'accounting-deficit-text' : ''}`}>
                    <AutoShrinkText align="right">
                      <span className="accounting-currency-symbol">₱</span>
                      <strong>{grandTotals.netSales < 0 ? `(${formatAmount(Math.abs(grandTotals.netSales))})` : formatAmount(grandTotals.netSales)}</strong>
                    </AutoShrinkText>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {}
        <div className="statement-right-col">
          <div className="statement-col-label">DRAW DEFICIT BREAKDOWN</div>
          <DrawDeficitsExcelStatement
            group={group}
            allSupervisors={allSupervisors}
            selectedDate={selectedDate}
            branchName={branchName}
          />
        </div>

      </div>{}

      {}
      <div className="statement-signatures-section">
        <div className="statement-sig-column">
          <div className="statement-sig-line" />
          <span className="statement-sig-title">SUPERVISOR - {branchName ? branchName.toUpperCase() : 'LDN'}</span>
          <strong className="statement-sig-name">{group?.supervisor || 'BRANCH SUPERVISOR'}</strong>
          <span className="statement-sig-date">Date Signed: _____________________</span>
        </div>
        <div className="statement-sig-column">
          <div className="statement-sig-line" />
          <span className="statement-sig-title">HEAD CASHIER / RECEIVER</span>
          <strong className="statement-sig-name">Authorized Head Cashier ({branchName})</strong>
          <span className="statement-sig-date">Date Received: _____________________</span>
        </div>
      </div>
      <div className="statement-print-footer-tag">
        GLOWING FORTUNE CORPORATION • OFFICIAL REMITTANCE STATEMENT &amp; DRAW DEFICIT AUDIT • {formatDisplayDate(selectedDate)}
      </div>
    </div>
    </div>
  )
}

function downloadCsv(filename, rows) {

  if (!rows || rows.length === 0) return
  const keys = Object.keys(rows[0])
  const header = keys.map((k) => `"${String(k).replace(/"/g, '""')}"`).join(',')
  const lines = rows.map((row) =>
    keys.map((k) => {
      const val = row[k] === null || row[k] === undefined ? '' : String(row[k])
      return `"${val.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [header, ...lines].join('\r\n')
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement('a')
  link.setAttribute('href', encodedUri)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function AccessRestrictedNotice({
  requiredPermKey,
  viewName,
  currentUser,
  userPermissions = [],
  onSwitchView,
}) {
  const permMeta = PERMISSIONS.find((p) => p.key === requiredPermKey) || {
    label: requiredPermKey,
    group: 'Security',
  }

  return (
    <div className="access-restricted-container">
      <div className="access-restricted-card">
        <div className="restricted-icon-shield">
          <Icon name="lock" size={32} />
        </div>
        <div className="restricted-badge">PERMISSION ENFORCED &bull; ACCESS RESTRICTED</div>
        <h2>{viewName || 'Workspace'} Access Restricted</h2>
        <p className="restricted-desc">
          Your current active account <strong>@{currentUser?.username}</strong> ({currentUser?.roleLabel || currentUser?.role || 'Staff'}) does not currently have the <strong>{permMeta.label}</strong> permission enabled.
        </p>

        <div className="restricted-perm-box">
          <div className="perm-box-row">
            <span className="perm-box-label">Required Capability:</span>
            <span className="perm-box-value required-highlight">
              <code>{requiredPermKey}</code> &bull; {permMeta.label}
            </span>
          </div>
          <div className="perm-box-row">
            <span className="perm-box-label">Active Account Tier:</span>
            <span className="perm-box-value">
              {currentUser?.roleBadge || currentUser?.role || 'User'} ({userPermissions.length}/{PERMISSIONS.length} Capabilities Enabled)
            </span>
          </div>
          <div className="perm-box-row">
            <span className="perm-box-label">Enabled Privileges:</span>
            <div className="perm-box-pills">
              {userPermissions.length === 0 ? (
                <span className="perm-pill none">No permissions enabled for this account</span>
              ) : (
                userPermissions.map((k) => {
                  const p = PERMISSIONS.find((item) => item.key === k)
                  return (
                    <span key={k} className="perm-pill active">
                      ✓ {p?.label || k}
                    </span>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="restricted-help-text">
          <Icon name="alert" size={15} />
          <span>
            To grant access, toggle <strong>{permMeta.label}</strong> for <strong>@{currentUser?.username}</strong> or the <strong>{currentUser?.role}</strong> role in the <strong>Role Permission Matrix</strong> under Users &amp; RBAC.
          </span>
        </div>

        <div className="restricted-actions-bar">
          {userPermissions.includes('view_overview') && (
            <button
              type="button"
              className="restricted-action-btn primary"
              onClick={() => onSwitchView('overview')}
            >
              <Icon name="overview" size={14} />
              <span>Go to Overview</span>
            </button>
          )}
          {userPermissions.includes('view_reports') && (
            <button
              type="button"
              className="restricted-action-btn"
              onClick={() => onSwitchView('reports')}
            >
              <Icon name="reports" size={14} />
              <span>Go to Draw Reports</span>
            </button>
          )}
          {userPermissions.includes('manage_users') && (
            <button
              type="button"
              className="restricted-action-btn"
              onClick={() => onSwitchView('rbac')}
            >
              <Icon name="shieldCheck" size={14} />
              <span>Open Role Permission Matrix</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SupervisorStatementModal({
  group,
  selectedDate,
  allSupervisors = [],
  branchName = configuredBranch,
  onClose,
  onSelectSupervisor,
  canPrint = true,
  currentUser = null,
}) {
  if (!group) return null

  return (
    <CustomPrintBrowserModal
      isOpen={!!group}
      onClose={onClose}
      group={group}
      allSupervisors={allSupervisors}
      selectedDate={selectedDate}
      branchName={branchName}
      canPrint={canPrint}
      currentUser={currentUser}
      onSelectSupervisor={onSelectSupervisor}
    >
      <SupervisorStatementTable
        group={group}
        allSupervisors={allSupervisors}
        selectedDate={selectedDate}
        branchName={branchName}
        isModal={true}
        fitOnePage={true}
      />
    </CustomPrintBrowserModal>
  )
}


function OverviewDashboard({
  overallDraws = [],
  supervisorReports = [],
  selectedDate,
  branchName,
  loading,
  error,
  onViewStatement,
  onInspectDeficits,
  rawRows = [],
  rawColumns = [],
  endpointLabel,
  onRefresh,
  canPrint = true,
  canExport = true,
  canRawFeed = true,
  currentUser = null,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showRawFeed, setShowRawFeed] = useState(false)

  const hasOverallData = overallDraws.length > 0
  const totalGross = hasOverallData
    ? overallDraws.reduce((sum, d) => sum + (Number(d.TotalOveAllGross ?? d.TotalOverAllGross) || 0), 0)
    : supervisorReports.reduce((sum, s) => sum + s.totalGross, 0)

  const totalHits = hasOverallData
    ? overallDraws.reduce((sum, d) => sum + (Number(d.TotalOveAllHits ?? d.TotalOverAllHits) || 0), 0)
    : supervisorReports.reduce((sum, s) => sum + s.totalHits, 0)

  const totalKabig = hasOverallData
    ? overallDraws.reduce((sum, d) => sum + (Number(d.TotalOveAllKabig ?? d.TotalOverAllKabig) || 0), 0)
    : (totalGross - totalHits)

  const totalCommission = supervisorReports.reduce((sum, s) => sum + (s.totalSalary !== undefined ? s.totalSalary : (s.totalGross * 0.1)), 0)
  const netRemittance = totalGross - totalHits - totalCommission
  const payoutRate = totalGross > 0 ? ((totalHits / totalGross) * 100) : 0
  const retentionRate = totalGross > 0 ? ((totalKabig / totalGross) * 100) : 0

  const allAgents = useMemo(() => {
    return supervisorReports.flatMap((s) =>
      s.agents.map((a) => {
        const comm = a.totalSalary !== undefined ? a.totalSalary : (a.totalGross * ((a.commissionRate || 10) / 100))
        const netSales = a.totalNet - comm
        return {
          ...a,
          supervisor: s.supervisor,
          commission: comm,
          netSales,
          isDeficit: netSales < 0,
        }
      })
    )
  }, [supervisorReports])

  const totalTellers = allAgents.length
  const deficitTellers = allAgents.filter((a) => a.isDeficit)

  const filteredSupervisors = useMemo(() => {
    const list = supervisorReports.map((s) => {
      const commission = s.totalSalary !== undefined ? s.totalSalary : s.agents.reduce((sum, a) => sum + (a.totalSalary !== undefined ? a.totalSalary : a.totalGross * 0.1), 0)
      const netRemittance = s.totalNet - commission
      const positiveCount = s.agents.filter((a) => {
        const comm = a.totalSalary !== undefined ? a.totalSalary : (a.totalGross * ((a.commissionRate || 10) / 100))
        return (a.totalNet - comm) >= 0
      }).length
      const deficitCount = s.agents.filter((a) => {
        const comm = a.totalSalary !== undefined ? a.totalSalary : (a.totalGross * ((a.commissionRate || 10) / 100))
        return (a.totalNet - comm) < 0
      }).length
      const payoutRate = s.totalGross > 0 ? ((s.totalHits / s.totalGross) * 100).toFixed(1) : '0.0'
      return {
        ...s,
        positiveCount,
        deficitCount,
        commission,
        netRemittance,
        payoutRate,
        agentCount: s.agents.length,
      }
    }).sort((a, b) => b.totalGross - a.totalGross)

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((s) => s.supervisor.toLowerCase().includes(q))
  }, [supervisorReports, searchQuery])

  const getDrawScheduleMeta = (rawTime) => {
    const time = String(rawTime ?? '').trim()
    if (time === '10:30' || time === '10:30 AM') return { time: '10:30 AM', type: 'Local STL', isLocal: true, code: '10:30' }
    if (time === '14' || time === '14:00' || time === '2:00 PM' || time === '2:00') return { time: '2:00 PM', type: 'PCSO National', isLocal: false, code: '14' }
    if (time === '15' || time === '15:00' || time === '3:00 PM' || time === '3:00') return { time: '3:00 PM', type: 'Local STL', isLocal: true, code: '15' }
    if (time === '17' || time === '17:00' || time === '5:00 PM' || time === '5:00') return { time: '5:00 PM', type: 'PCSO National', isLocal: false, code: '17' }
    if (time === '19' || time === '19:00' || time === '7:00 PM' || time === '7:00') return { time: '7:00 PM', type: 'Local STL', isLocal: true, code: '19' }
    if (time === '21' || time === '21:00' || time === '9:00 PM' || time === '9:00') return { time: '9:00 PM', type: 'PCSO National', isLocal: false, code: '21' }
    return { time: formatDrawTime(time), type: 'Regular Draw', isLocal: true, code: time }
  }

  return (
    <div className="overview-dashboard-wrap">
      <div className="overview-hero-banner">
        <div className="overview-hero-text">
          <h2>
            <Icon name="gauge" size={22} />
            Consolidated Operations Overview
          </h2>
          <p>
            Executive Daily Sales, Winning Results, Payout Audits &amp; Remittance Summary for {formatDisplayDate(selectedDate)}
          </p>
        </div>
        <div className="overview-hero-badges">
          <span className="hero-pill-badge live-dot-badge">{branchName} Branch</span>
          <span className="hero-pill-badge">{overallDraws.length > 0 ? `${overallDraws.length} Draws Completed` : 'Live Draws'}</span>
          <span className="hero-pill-badge">{supervisorReports.length} Supervisors</span>
          <span className="hero-pill-badge">{totalTellers} Active Tellers</span>
        </div>
      </div>

      {error && !loading && (
        <div className="state-message error-state">
          <strong>Unable to load overview data</strong>
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>Try again</button>
        </div>
      )}

      {loading && (
        <div className="state-message">
          <span className="spinner" /> Loading consolidated analytics for {formatDisplayDate(selectedDate)}...
        </div>
      )}

      <div className="overview-kpi-grid">
        <article className="overview-kpi-card kpi-card-gross">
          <div className="kpi-header">
            <span className="kpi-title">Total Gross Sales</span>
            <div className="kpi-icon-wrap"><Icon name="money" size={16} /></div>
          </div>
          <strong className="kpi-value-main">{loading ? '...' : formatCurrency(totalGross)}</strong>
          <div className="kpi-subtext">
            <span>Consolidated sales</span>
            <span className="kpi-trend-pill pill-blue">All draws</span>
          </div>
        </article>

        <article className="overview-kpi-card kpi-card-hits">
          <div className="kpi-header">
            <span className="kpi-title">Total Hits (Payouts)</span>
            <div className="kpi-icon-wrap"><Icon name="alert" size={16} /></div>
          </div>
          <strong className="kpi-value-main accounting-deficit-text">{loading ? '...' : formatCurrency(totalHits)}</strong>
          <div className="kpi-subtext">
            <span>Payout Ratio</span>
            <span className={`kpi-trend-pill ${payoutRate > 50 ? 'pill-amber' : 'pill-green'}`}>
              {payoutRate.toFixed(1)}% of gross
            </span>
          </div>
        </article>

        <article className="overview-kpi-card kpi-card-kabig">
          <div className="kpi-header">
            <span className="kpi-title">House Kabig (Gross Margin)</span>
            <div className="kpi-icon-wrap"><Icon name="trending" size={16} /></div>
          </div>
          <strong className="kpi-value-main" style={{ color: '#059669' }}>{loading ? '...' : formatCurrency(totalKabig)}</strong>
          <div className="kpi-subtext">
            <span>Gross less hits</span>
            <span className="kpi-trend-pill pill-green">{retentionRate.toFixed(1)}% retained</span>
          </div>
        </article>

        <article className="overview-kpi-card kpi-card-comm">
          <div className="kpi-header">
            <span className="kpi-title">Agent Commission</span>
            <div className="kpi-icon-wrap"><Icon name="percent" size={16} /></div>
          </div>
          <strong className="kpi-value-main">{loading ? '...' : formatCurrency(totalCommission)}</strong>
          <div className="kpi-subtext">
            <span>10% of total gross</span>
            <span className="kpi-trend-pill pill-blue">Standard rate</span>
          </div>
        </article>

        <article className="overview-kpi-card kpi-card-remit">
          <div className="kpi-header">
            <span className="kpi-title">Net Remittance Due</span>
            <div className="kpi-icon-wrap"><Icon name="check" size={16} /></div>
          </div>
          <strong className={`kpi-value-main ${netRemittance < 0 ? 'accounting-deficit-text' : ''}`}>
            {loading ? '...' : (netRemittance < 0 ? `(${formatCurrency(Math.abs(netRemittance))})` : formatCurrency(netRemittance))}
          </strong>
          <div className="kpi-subtext">
            <span>Due for settlement</span>
            <span className="kpi-trend-pill pill-blue">Final net</span>
          </div>
        </article>
      </div>

      {!loading && overallDraws.length > 0 && (
        <section className="overview-draws-section">
          <div className="overview-section-header">
            <div className="overview-section-title-wrap">
              <h3><Icon name="sparkles" size={16} /> Draw Results &amp; Winnings Snapshot</h3>
              <p>Official 3D &amp; 4D winning numbers with gross and payout margins per draw schedule</p>
            </div>
          </div>

          <div className="overview-draws-grid">
            {overallDraws.map((row, idx) => {
              const meta = getDrawScheduleMeta(row.drawTime)
              const gross = Number(row.TotalOveAllGross ?? row.TotalOverAllGross) || 0
              const hits = Number(row.TotalOveAllHits ?? row.TotalOverAllHits) || 0
              const kabig = Number(row.TotalOveAllKabig ?? row.TotalOverAllKabig) || (gross - hits)
              const ratio = gross > 0 ? (hits / gross) * 100 : 0
              const s3Digits = String(row.s3_result || '').split('')

              return (
                <div key={row.id || idx} className="draw-result-card">
                  <div className="draw-card-top-bar">
                    <span className="draw-time-tag">Draw {meta.time}</span>
                    <span className={`draw-type-badge ${meta.isLocal ? 'type-local' : 'type-pcso'}`}>{meta.type}</span>
                  </div>

                  <div className="lotto-balls-row">
                    {s3Digits.length > 0 && row.s3_result ? (
                      s3Digits.map((d, dIdx) => (
                        <span key={dIdx} className="lotto-ball">{d}</span>
                      ))
                    ) : (
                      <span className="lotto-ball lotto-ball-empty">No S3</span>
                    )}
                    {row.s4_result && (
                      <span className="lotto-ball-4d" title="4D Result">4D: {row.s4_result}</span>
                    )}
                  </div>

                  <div className="draw-card-metrics">
                    <div className="draw-metric-line">
                      <span className="label">Gross:</span>
                      <span className="val">{formatCurrency(gross)}</span>
                    </div>
                    <div className="draw-metric-line">
                      <span className="label">Hits:</span>
                      <span className="val val-hits">{formatCurrency(hits)}</span>
                    </div>
                    <div className="draw-metric-line">
                      <span className="label">Kabig:</span>
                      <span className="val val-kabig">{formatCurrency(kabig)}</span>
                    </div>
                    <div className="draw-ratio-bar-wrap" title={`Payout: ${ratio.toFixed(1)}%`}>
                      <div
                        className={`draw-ratio-bar-fill ${ratio > 50 ? 'bar-high-hits' : ''}`}
                        style={{ width: `${Math.min(ratio, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {!loading && overallDraws.length > 0 && (
        <div className="overview-table-card">
          <div className="overview-table-card-header">
            <div className="overview-table-title-group">
              <h3>Draw-by-Draw Consolidated Performance</h3>
              <p>Official sales volume, winning claims, payout rates, and house retention per draw</p>
            </div>
            <span className="record-count">{overallDraws.length} Scheduled Draws</span>
          </div>

          <div className="table-wrap">
            <table className="modern-draw-table">
              <thead>
                <tr>
                  <th>DRAW &amp; SCHEDULE</th>
                  <th>TYPE</th>
                  <th>WINNING NUMBER</th>
                  <th className="num-col">GROSS SALES</th>
                  <th className="num-col">HITS (PAYOUT)</th>
                  <th className="num-col">PAYOUT RATIO</th>
                  <th className="num-col">HOUSE KABIG</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {overallDraws.map((row, idx) => {
                  const meta = getDrawScheduleMeta(row.drawTime)
                  const gross = Number(row.TotalOveAllGross ?? row.TotalOverAllGross) || 0
                  const hits = Number(row.TotalOveAllHits ?? row.TotalOverAllHits) || 0
                  const kabig = Number(row.TotalOveAllKabig ?? row.TotalOverAllKabig) || (gross - hits)
                  const ratio = gross > 0 ? (hits / gross) * 100 : 0
                  const s3Digits = String(row.s3_result || '').split('')

                  return (
                    <tr key={row.id || idx}>
                      <td>
                        <div className="draw-schedule-cell">
                          <span>Draw {meta.time}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`draw-type-badge ${meta.isLocal ? 'type-local' : 'type-pcso'}`}>
                          {meta.type}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {s3Digits.length > 0 && row.s3_result ? (
                            s3Digits.map((d, dIdx) => (
                              <span key={dIdx} className="lotto-ball" style={{ width: '22px', height: '22px', fontSize: '11px', lineHeight: '22px' }}>{d}</span>
                            ))
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                          {row.s4_result && <span className="lotto-ball-4d">{row.s4_result}</span>}
                        </div>
                      </td>
                      <td className="num-col">₱ {formatAmount(gross)}</td>
                      <td className={`num-col ${hits > 0 ? 'accounting-deficit-text' : ''}`}>
                        {hits > 0 ? `₱ ${formatAmount(hits)}` : '₱ 0.00'}
                      </td>
                      <td className="num-col">
                        <span className={`payout-rate-badge ${ratio > 50 ? 'rate-high' : ratio > 35 ? 'rate-med' : 'rate-low'}`}>
                          {ratio.toFixed(1)}%
                        </span>
                      </td>
                      <td className="num-col" style={{ color: '#059669', fontWeight: '700' }}>
                        ₱ {formatAmount(kabig)}
                      </td>
                      <td>
                        <span className="status-beacon-live">
                          {row.status === 2 ? 'Completed' : 'Recorded'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="modern-table-total-row">
                  <td colSpan={3}>
                    <strong>CONSOLIDATED DAILY DRAWS TOTAL</strong>
                  </td>
                  <td className="num-col">₱ {formatAmount(totalGross)}</td>
                  <td className="num-col accounting-deficit-text">₱ {formatAmount(totalHits)}</td>
                  <td className="num-col">
                    <span className={`payout-rate-badge ${payoutRate > 50 ? 'rate-high' : payoutRate > 35 ? 'rate-med' : 'rate-low'}`}>
                      {payoutRate.toFixed(1)}% Overall
                    </span>
                  </td>
                  <td className="num-col" style={{ color: '#059669' }}>₱ {formatAmount(totalKabig)}</td>
                  <td><strong>6/6 Draws</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && supervisorReports.length > 0 && (
        <div className="overview-table-card">
          <div className="overview-table-card-header">
            <div className="overview-table-title-group">
              <h3>Supervisor Remittance &amp; Performance Leaderboard</h3>
              <p>Consolidated supervisor sales ranking, agent roster balance status, and net remittance due</p>
            </div>
            <div className="table-header-controls">
              <div className="overview-search-box">
                <Icon name="search" size={13} />
                <input
                  type="text"
                  placeholder="Search supervisor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`export-data-btn ${!canExport ? 'is-perm-locked' : ''}`}
                onClick={() => {
                  if (!canExport) {
                    alert(`Access Restricted: Your account (@${currentUser?.username || 'user'}) does not have 'export_data' permission in the Role Matrix.`)
                    return
                  }
                  const exportData = filteredSupervisors.map((s, idx) => ({
                    Rank: idx + 1,
                    Supervisor: s.supervisor,
                    PositiveAgents: s.solventCount,
                    DeficitAgents: s.deficitCount,
                    TotalGross: s.totalGross,
                    TotalHits: s.totalHits,
                    Commission: s.commission,
                    NetRemittance: s.netRemittance,
                    Status: s.netRemittance >= 0 ? 'Positive' : 'Deficit',
                  }))
                  downloadCsv(`GlowingFortune_Supervisor_Leaderboard_${selectedDate}.csv`, exportData)
                }}
                title={canExport ? "Export Supervisor Leaderboard to CSV" : "Export data permission ('export_data') is locked for your account in the Role Matrix"}
              >
                <Icon name={canExport ? "download" : "lock"} size={13} />
                <span>{canExport ? "Export CSV" : "Export Locked"}</span>
              </button>
              <span className="record-count">{filteredSupervisors.length} Supervisors</span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="modern-spvr-table">
              <thead>
                <tr>
                  <th>RANK &amp; SUPERVISOR</th>
                  <th>AGENT ROSTER</th>
                  <th className="num-col">TOTAL GROSS</th>
                  <th className="num-col">HITS (PAYOUT)</th>
                  <th className="num-col">COMMISSION (10%)</th>
                  <th className="num-col">NET REMITTANCE</th>
                  <th>OFFICIAL STATEMENT</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupervisors.map((spvr, idx) => {
                  const rankClass = idx === 0 ? 'rank-gold' : idx === 1 ? 'rank-silver' : idx === 2 ? 'rank-bronze' : ''

                  return (
                    <tr key={spvr.supervisor || idx}>
                      <td>
                        <span className={`spvr-rank-badge ${rankClass}`}>#{idx + 1}</span>
                        <strong style={{ color: '#0f172a' }}>{spvr.supervisor}</strong>
                      </td>
                      <td>
                        <div className="spvr-agent-pills">
                          <span className="spvr-pill-solvent" title="Agents with Positive Balance">
                            {spvr.positiveCount} Positive
                          </span>
                          {spvr.deficitCount > 0 && (
                            <span className="spvr-pill-deficit" title="Agents with Deficit">
                              {spvr.deficitCount} Deficit
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num-col">₱ {formatAmount(spvr.totalGross)}</td>
                      <td className={`num-col ${spvr.totalHits > 0 ? 'accounting-deficit-text' : ''}`}>
                        ₱ {formatAmount(spvr.totalHits)}
                      </td>
                      <td className="num-col">₱ {formatAmount(spvr.commission)}</td>
                      <td className={`num-col ${spvr.netRemittance < 0 ? 'accounting-deficit-text' : ''}`}>
                        {spvr.netRemittance < 0 ? `(₱ ${formatAmount(Math.abs(spvr.netRemittance))})` : `₱ ${formatAmount(spvr.netRemittance)}`}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`overview-statement-btn ${!canPrint ? 'is-perm-locked' : ''}`}
                          onClick={() => {
                            if (!canPrint) {
                              alert(`Access Restricted: Printing statements is locked for @${currentUser?.username || 'user'} in the Role Matrix.`)
                              return
                            }
                            onViewStatement(spvr)
                          }}
                          title={canPrint ? `Print official remittance statement for ${spvr.supervisor}` : "Printing statements is locked for your account in the Role Matrix"}
                        >
                          <Icon name={canPrint ? "print" : "lock"} size={12} />
                          <span>{canPrint ? "Print Statement" : "Print Locked"}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="modern-table-total-row">
                  <td>
                    <strong>TOTAL SUPERVISORS CONSOLIDATION</strong>
                  </td>
                  <td>
                    <div className="spvr-agent-pills">
                      <span className="spvr-pill-solvent">
                        {supervisorReports.reduce((s, g) => s + g.agents.filter(a => (a.totalNet - (a.totalSalary !== undefined ? a.totalSalary : a.totalGross * 0.1)) >= 0).length, 0)} Positive
                      </span>
                      <span className="spvr-pill-deficit">
                        {supervisorReports.reduce((s, g) => s + g.agents.filter(a => (a.totalNet - (a.totalSalary !== undefined ? a.totalSalary : a.totalGross * 0.1)) < 0).length, 0)} Deficit
                      </span>
                    </div>
                  </td>
                  <td className="num-col">
                    ₱ {formatAmount(supervisorReports.reduce((s, g) => s + g.totalGross, 0))}
                  </td>
                  <td className="num-col accounting-deficit-text">
                    ₱ {formatAmount(supervisorReports.reduce((s, g) => s + g.totalHits, 0))}
                  </td>
                  <td className="num-col">
                    ₱ {formatAmount(supervisorReports.reduce((s, g) => s + (g.totalSalary !== undefined ? g.totalSalary : g.totalGross * 0.1), 0))}
                  </td>
                  <td className="num-col">
                    ₱ {formatAmount(supervisorReports.reduce((s, g) => s + (g.totalNet - (g.totalSalary !== undefined ? g.totalSalary : g.totalGross * 0.1)), 0))}
                  </td>
                  <td><strong>{supervisorReports.length} Statements</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && (
        <div className="overview-analytics-split">
          {overallDraws.length > 0 && (
            <div className="analytics-card">
              <div className="analytics-card-header">
                <h4>Draw Gross Share Distribution</h4>
                <span className="date-tag live-tag">Volume Share %</span>
              </div>

              <div className="revenue-share-multi-bar">
                {overallDraws.map((d, idx) => {
                  const gross = Number(d.TotalOveAllGross ?? d.TotalOverAllGross) || 0
                  const pct = totalGross > 0 ? (gross / totalGross) * 100 : 0
                  return (
                    <div
                      key={d.id || idx}
                      className={`rev-bar-seg rev-seg-${(idx % 6) + 1}`}
                      style={{ width: `${pct}%` }}
                      title={`Draw ${getDrawScheduleMeta(d.drawTime).time}: ${pct.toFixed(1)}% (₱${formatAmount(gross)})`}
                    />
                  )
                })}
              </div>

              <div className="rev-share-legends">
                {overallDraws.map((d, idx) => {
                  const meta = getDrawScheduleMeta(d.drawTime)
                  const gross = Number(d.TotalOveAllGross ?? d.TotalOverAllGross) || 0
                  const pct = totalGross > 0 ? (gross / totalGross) * 100 : 0
                  return (
                    <div key={d.id || idx} className="rev-legend-item">
                      <span className="rev-legend-label">
                        <span className={`rev-legend-dot rev-seg-${(idx % 6) + 1}`} />
                        <span>Draw {meta.time}</span>
                      </span>
                      <span className="rev-legend-val">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="analytics-card">
            <div className="analytics-card-header">
              <h4>Field Health &amp; Deficit Watchlist</h4>
              <button
                type="button"
                className="deficit-watchlist-header-badge"
                onClick={onInspectDeficits}
                title="Click to inspect all negative balances per draw, supervisor, and agent"
              >
                <Icon name="alert" size={12} />
                <span>{deficitTellers.length} Deficit Tellers</span>
              </button>
            </div>

            {deficitTellers.length === 0 ? (
              <div className="state-message" style={{ padding: '16px', fontSize: '12px' }}>
                ✓ All active tellers have positive balances today.
              </div>
            ) : (
              <div className="deficit-watchlist-list">
                {deficitTellers.slice(0, 5).map((agent, idx) => (
                  <div
                    key={idx}
                    className="deficit-watch-row"
                    onClick={onInspectDeficits}
                    style={{ cursor: 'pointer' }}
                    title="Click to view details in Deficit Inspector"
                  >
                    <div>
                      <span className="deficit-watch-agent">{agent.teller}</span>
                      <span className="deficit-watch-spvr">({agent.supervisor})</span>
                    </div>
                    <span className="deficit-watch-amount">
                      ({formatAmount(Math.abs(agent.netSales))})
                    </span>
                  </div>
                ))}
                {deficitTellers.length > 5 && (
                  <small style={{ color: '#64748b', textAlign: 'center', marginTop: '4px', display: 'block' }}>
                    + {deficitTellers.length - 5} more deficit tellers recorded
                  </small>
                )}
                <button
                  type="button"
                  className="deficit-view-all-action-btn"
                  onClick={onInspectDeficits}
                  title="Open Deficit & Negative Inspector per Draw and Supervisor"
                >
                  <Icon name="alert" size={13} />
                  <span>Inspect All Negatives Per Draw &amp; Supervisor ({deficitTellers.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {canRawFeed && (
        <div className="raw-feed-accordion">
          <button
            type="button"
            className="raw-feed-toggle-btn"
            onClick={() => setShowRawFeed(!showRawFeed)}
          >
            <span>Source API Technical Feed ({rawRows.length} raw records from {endpointLabel})</span>
            <Icon name={showRawFeed ? 'chevronUp' : 'chevronDown'} size={14} />
          </button>
          {showRawFeed && (
            <div style={{ padding: '14px', borderTop: '1px solid #e2e8f0' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {rawColumns.map((col) => (
                        <th key={col}>{col.replaceAll('_', ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 50).map((row, rIdx) => (
                      <tr key={row.id ?? rIdx}>
                        {rawColumns.map((col) => (
                          <td key={col}>{formatReportValue(row?.[col], col)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rawRows.length > 50 && (
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    Showing first 50 of {rawRows.length} records.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [supervisorRows, setSupervisorRows] = useState([])
  const [overallDraws, setOverallDraws] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedDate, setSelectedDate] = useState(defaultFromDate)
  const [activeView, setActiveView] = useState('overview')
  const [selectedSupervisor, setSelectedSupervisor] = useState('all')
  const [showOverall, setShowOverall] = useState(false)
  const [reportViewMode, setReportViewMode] = useState('matrix')
  const [statementModalGroup, setStatementModalGroup] = useState(null)
  const [isDeficitModalOpen, setIsDeficitModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [rbacRoles, setRbacRoles] = useState(() => getRbacRoles())
  const [rbacRev, setRbacRev] = useState(0)
  const [commissionSettings, setCommissionSettings] = useState(() => loadCommissionSettings())

  useEffect(() => {
    const sessionToken = getSessionTokenFromUrl()
    bootFromCloud(sessionToken).then((data) => {
      if (data?.sessionUser) {
        setCurrentUser(data.sessionUser)
      } else if (sessionToken) {
        getCloudSession().then((u) => { if (u) setCurrentUser(u) }).catch(() => void 0)
      }
      setRbacRoles(getRbacRoles())
      setCommissionSettings(loadCommissionSettings())
    }).catch(() => void 0)

    const handleCommissionChange = (e) => {
      if (e?.detail) setCommissionSettings(e.detail)
      else setCommissionSettings(loadCommissionSettings())
    }
    window.addEventListener('luckybet_commissions_updated', handleCommissionChange)
    return () => window.removeEventListener('luckybet_commissions_updated', handleCommissionChange)
  }, [])

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })

  useEffect(() => {
    const themeVal = isDarkMode ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', themeVal)
    document.body.setAttribute('data-theme', themeVal)
  }, [isDarkMode])

  const handleSwitchUser = (targetUser) => {
    const rDef = rbacRoles[targetUser.role] || DEFAULT_ROLES[targetUser.role] || DEFAULT_ROLES.staff
    const perms = getUserEffectivePermissions(targetUser, rbacRoles)
    const isTargetAdmin = targetUser.role === 'admin'
    const newUser = {
      username: targetUser.username,
      name: targetUser.name,
      role: targetUser.role,
      roleLabel: rDef.label,
      roleBadge: rDef.badge,
      branch: targetUser.branch,
      avatar: targetUser.avatar || targetUser.name.substring(0, 2).toUpperCase(),
      token: 'rbac-token-' + targetUser.id,
      loginTime: new Date().toISOString(),
      permissions: perms,
      simulatedFromAdmin: !isTargetAdmin,
    }
    setCurrentUser(newUser)
    updateCloudSession(newUser.token, newUser).catch(() => void 0)
  }

  const handleReturnToAdmin = () => {
    const adminUser = getRbacUsers().find((u) => u.role === 'admin') || DEFAULT_USERS[0]
    const rDef = rbacRoles[adminUser.role] || DEFAULT_ROLES.admin
    const perms = getUserEffectivePermissions(adminUser, rbacRoles)
    const restored = {
      username: adminUser.username,
      name: adminUser.name,
      role: adminUser.role,
      roleLabel: rDef.label,
      roleBadge: rDef.badge,
      branch: adminUser.branch,
      avatar: adminUser.avatar || 'JL',
      token: 'rbac-token-' + adminUser.id,
      loginTime: new Date().toISOString(),
      permissions: perms,
      simulatedFromAdmin: false,
    }
    setCurrentUser(restored)
    updateCloudSession(restored.token, restored).catch(() => void 0)
  }

  useEffect(() => {
    const handleRbacChange = () => {
      setRbacRoles(getRbacRoles())
      setRbacRev((r) => r + 1)
    }
    window.addEventListener('luckybet_rbac_change', handleRbacChange)

    if (isSupabaseConfigured) {
      syncMatrixPermissionsFromSupabase().catch(() => void 0)
      syncCommissionSettingsFromSupabase().catch(() => void 0)
    }

    const unsubRealtime = subscribeToMatrixRealtime(() => {
      syncMatrixPermissionsFromSupabase().catch(() => void 0)
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured) {
        syncMatrixPermissionsFromSupabase().catch(() => void 0)
        syncCommissionSettingsFromSupabase().catch(() => void 0)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const syncInterval = setInterval(() => {
      if (isSupabaseConfigured) {
        syncMatrixPermissionsFromSupabase().catch(() => void 0)
        syncCommissionSettingsFromSupabase().catch(() => void 0)
      }
    }, 30000)

    return () => {
      window.removeEventListener('luckybet_rbac_change', handleRbacChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(syncInterval)
      if (typeof unsubRealtime === 'function') unsubRealtime()
    }
  }, [])

  const userPermissions = useMemo(() => {
    if (!currentUser) return []
    return getUserEffectivePermissions(currentUser, rbacRoles)
  }, [currentUser, rbacRoles, rbacRev])

  const can = useCallback(
    (permKey) => {
      return hasPermission(currentUser, permKey, rbacRoles)
    },
    [currentUser, rbacRoles, rbacRev]
  )

  useEffect(() => {
    if (!currentUser) return
    const isAllowed = (view) => {
      if (view === 'overview') return can('view_overview')
      if (view === 'reports') return can('view_reports')
      if (view === 'commissions') return can('manage_commissions')
      if (view === 'rbac') return can('manage_users')
      if (view === 'activity') return can('audit_logs')
      return false
    }

    if (!isAllowed(activeView)) {
      if (can('view_overview')) setActiveView('overview')
      else if (can('view_reports')) setActiveView('reports')
      else if (can('manage_commissions')) setActiveView('commissions')
      else if (can('manage_users')) setActiveView('rbac')
      else if (can('audit_logs')) setActiveView('activity')
    }
  }, [activeView, can, currentUser])

  const handleLogout = () => {
    revokeCloudSession(currentUser?.token).catch(() => void 0)
    signOutFromSupabase().catch(() => void 0)
    setCurrentUser(null)
  }

  const isToday = selectedDate === getCurrentDate()
  const isYesterday = selectedDate === getYesterdayDate()

  const fetchProxiedReport = async (type, params) => {
    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      try {
        const pUrl = new URL('/api/proxy', window.location.origin)
        pUrl.searchParams.set('type', type)
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null) pUrl.searchParams.set(k, v)
        })
        const pRes = await fetch(pUrl)
        if (pRes.ok) {
          return await pRes.json()
        }
      } catch (e) {
        console.warn('Proxy report error, falling back:', e)
      }
    }
    const isDummyToken = (t) => !t || t.startsWith('rbac-token') || t.startsWith('local-auth')
    const fallbackToken = '74242|PwJgY3Ia4jzsBUGsfyedB3BvpelUP0Sb9XxcYZmE'
    const effectiveToken = authorization || (!isDummyToken(currentUser?.token) ? currentUser?.token : null) || fallbackToken
    const headers = effectiveToken
      ? { Authorization: `Bearer ${effectiveToken}`, Accept: 'application/json' }
      : { Accept: 'application/json' }

    let fallbackUrl = ''
    if (type === 'overall') {
      const u = new URL(overallApiUrl)
      u.searchParams.set('from', params.from)
      u.searchParams.set('to', params.to)
      fallbackUrl = u.toString()
    } else if (type === 'draw') {
      const u = new URL(drawApiUrl)
      u.searchParams.set('drawId', params.drawId)
      u.searchParams.set('from', params.from)
      u.searchParams.set('to', params.to)
      fallbackUrl = u.toString()
    } else if (type === 'supervisor') {
      const u = new URL(supervisorApiUrl)
      u.searchParams.set('from', params.from)
      u.searchParams.set('to', params.to)
      fallbackUrl = u.toString()
    } else if (type === 'teller') {
      const u = new URL(tellerApiUrl)
      u.searchParams.set('from', params.from)
      u.searchParams.set('to', params.to)
      fallbackUrl = u.toString()
    }
    const fRes = await fetch(fallbackUrl, { headers })
    if (!fRes.ok) throw new Error(`Request failed (${fRes.status})`)
    return await fRes.json()
  }

  const loadReport = useCallback(async (targetDate = selectedDate) => {
    const queryDate = targetDate || selectedDate || getCurrentDate()
    setLoading(true)
    setError('')

    try {
      let overallData = []
      let dynamicDrawIds = []

      if (overallApiUrl) {
        try {
          const overallDataRaw = await fetchProxiedReport('overall', { from: queryDate, to: getNextDate(queryDate) })
          overallData = normalizeRows(overallDataRaw)
          dynamicDrawIds = overallData.map((d) => d?.id).filter(Boolean)
        } catch (fetchDrawsError) {
          console.warn('Unable to fetch dynamic draw IDs from overallApiUrl:', fetchDrawsError)
        }
      }

      setOverallDraws(overallData)

      let targetDrawIds = dynamicDrawIds
      if (targetDrawIds.length === 0 && queryDate === getCurrentDate() && drawIds.length > 0) {
        targetDrawIds = drawIds
      }

      let reportRows = []
      if (drawApiUrl && targetDrawIds.length > 0) {
        const [responses, supervisorResponse] = await Promise.all([
          Promise.all(targetDrawIds.map(async (drawId) => {
            const drawData = await fetchProxiedReport('draw', { drawId, from: queryDate, to: getNextDate(queryDate) })
            return normalizeRows(drawData)
          })),
          supervisorApiUrl
            ? (async () => {
                const spvrData = await fetchProxiedReport('supervisor', { from: queryDate, to: getNextDate(queryDate) })
                return normalizeRows(spvrData)
              })()
            : Promise.resolve([])
        ])

        reportRows = responses.flat()
        setSupervisorRows(supervisorResponse)
      } else if (overallData.length > 0) {
        reportRows = overallData
        setSupervisorRows([])
      } else {
        const sourceApiUrl = tellerApiUrl
        if (sourceApiUrl) {
          const tellerData = await fetchProxiedReport('teller', { from: queryDate, to: getNextDate(queryDate) })
          reportRows = normalizeRows(tellerData)
        }
        setSupervisorRows([])
      }

      setRows(reportRows)
      setLastUpdated(new Date())
    } catch (requestError) {
      setError(requestError.message || 'Error retrieving report data.')
      setRows([])
      setSupervisorRows([])
      setOverallDraws([])
    } finally {
      setLoading(false)
    }
  }, [currentUser, selectedDate])

  const handleDateChange = (newDate) => {
    if (!newDate) return
    setSelectedDate(newDate)
    loadReport(newDate)
  }

  useEffect(() => {
    if (!currentUser) return
    const timeoutId = window.setTimeout(() => {
      loadReport(selectedDate)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [activeView, currentUser, loadReport, selectedDate])

  const rawBranchName = (!import.meta.env.VITE_BRANCH_NAME && rows.find((r) => r?.location || r?.branch || r?.branchName)?.location) || configuredBranch
  const branchName = (rawBranchName || 'LDN').replace(/Mandaue/gi, 'LDN')

  const columns = getColumns(rows)
  const drawRows = rows.filter((row) => row && row.drawTime !== undefined)
  const supervisorReports = getSupervisorReports(drawRows, supervisorRows, commissionSettings)

  const deficitTellersCount = useMemo(() => {
    let count = 0
    supervisorReports.forEach((s) => {
      s.agents.forEach((a) => {
        const comm = a.totalSalary !== undefined ? a.totalSalary : a.totalGross * ((a.commissionRate || 10) / 100)
        if (a.totalNet - comm < 0) count++
      })
    })
    return count
  }, [supervisorReports])

  const activeSupervisor = (selectedSupervisor !== 'all' && supervisorReports.some((group) => group.supervisor === selectedSupervisor))
    ? selectedSupervisor
    : 'all'

  const displayedSupervisors = activeSupervisor === 'all'
    ? supervisorReports
    : supervisorReports.filter((group) => group.supervisor === activeSupervisor)

  const hasAgentFields = drawRows.some((row) => getFirstField(row, agentFieldNames) !== null)
  const hasSupervisorFields = drawRows.some((row) => getFirstField(row, supervisorFieldNames) !== null)
  const sourceApiUrl = activeView === 'reports' ? tellerApiUrl : (overallApiUrl || tellerApiUrl)
  const endpointLabel = sourceApiUrl ? new URL(sourceApiUrl).pathname : 'API endpoint not configured'

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(user) => setCurrentUser(user)} branchName={branchName} />
  }

  const canSwitchAccounts = currentUser?.role === 'admin' || Boolean(currentUser?.simulatedFromAdmin)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/glowing-fortune-logo.png" alt="Glowing Fortune Corporation" />
          <span>
            <strong>STL Reports</strong>
            <small className="brand-branch-badge">{branchName} Branch</small>
          </span>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {(can('view_overview') || can('view_reports') || can('manage_commissions')) && (
            <>
              <p className="nav-label">Workspace</p>
              {can('view_overview') && (
                <button
                  className={`nav-item ${activeView === 'overview' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveView('overview')}
                >
                  <span className="nav-icon"><Icon name="overview" /></span>
                  <span>Overview</span>
                </button>
              )}
              {can('view_reports') && (
                <button
                  className={`nav-item ${activeView === 'reports' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveView('reports')}
                >
                  <span className="nav-icon"><Icon name="reports" /></span>
                  <span>Reports</span>
                </button>
              )}
              {can('manage_commissions') && (
                <button
                  className={`nav-item ${activeView === 'commissions' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveView('commissions')}
                >
                  <span className="nav-icon"><Icon name="percent" /></span>
                  <span>Commissions</span>
                </button>
              )}
            </>
          )}

          {(can('manage_users') || can('audit_logs')) && (
            <>
              <p className="nav-label" style={{ marginTop: (can('view_overview') || can('view_reports')) ? '16px' : '0' }}>Access Control</p>
              {can('manage_users') && (
                <button
                  className={`nav-item ${activeView === 'rbac' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveView('rbac')}
                >
                  <span className="nav-icon"><Icon name="shieldCheck" /></span>
                  <span>Users &amp; RBAC</span>
                </button>
              )}
              {can('audit_logs') && (
                <button
                  className={`nav-item ${activeView === 'activity' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveView('activity')}
                >
                  <span className="nav-icon"><Icon name="activity" /></span>
                  <span>Activity Log</span>
                </button>
              )}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="status-dot" />
          <div>
            <strong>{currentUser?.name || 'System connected'}</strong>
            <span>{currentUser?.roleLabel || currentUser?.role || 'Live API source'}</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {activeView === 'rbac' || activeView === 'activity' ? 'ADMINISTRATION' : 'ACCOUNTING'} / {activeView.toUpperCase()} • <span className="topbar-branch-chip">{branchName} Branch</span>
            </p>
            <h1>
              {activeView === 'reports'
                ? 'Agent reports'
                : activeView === 'commissions'
                ? 'Supervisor Base Rates & Agent Overrides'
                : activeView === 'rbac'
                ? 'User Credentials & Access Control (RBAC)'
                : activeView === 'activity'
                ? 'Security & Operational Audit Log'
                : 'Overall reports'}
            </h1>
          </div>
          <div className="topbar-actions">
            <span className="date-label">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connecting...'}</span>
            <button className="refresh-button" type="button" onClick={() => loadReport(selectedDate)} disabled={loading}><Icon name="refresh" size={15} /> {loading ? 'Loading' : 'Refresh'}</button>
            <button
              className="deficit-topbar-trigger-btn"
              type="button"
              onClick={() => setIsDeficitModalOpen(true)}
              title="Open Deficit & Negative Balance Inspector (Per Draw, Supervisor, Agent)"
            >
              <Icon name="alert" size={14} />
              <span>Negative Inspector</span>
              {deficitTellersCount > 0 && (
                <span className="deficit-topbar-pill">{deficitTellersCount}</span>
              )}
            </button>
            <FacebookProfileDropdown
              currentUser={currentUser}
              allUsers={getRbacUsers()}
              userPermissions={userPermissions}
              totalPermissionsCount={PERMISSIONS.length}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
              onSwitchUser={handleSwitchUser}
              onReturnToAdmin={handleReturnToAdmin}
              onLogout={handleLogout}
              onNavigateView={setActiveView}
              canSwitchAccounts={canSwitchAccounts}
              can={can}
            />
          </div>
        </header>

        <section className="content-area">
          {((activeView === 'overview' && can('view_overview')) || (activeView === 'reports' && can('view_reports'))) && (
            <>
              <div className="welcome-row">
                <div>
                  <h2>Good day, {currentUser?.name?.split(' ')[0] || 'Accountant'}</h2>
                  <p>
                    {isToday
                      ? 'Here is the latest live consolidated view for today.'
                      : `Viewing previous report for ${formatDisplayDate(selectedDate)}.`}
                  </p>
                </div>
                {isToday ? (
                  <span className="live-badge"><span /> Live data (Today)</span>
                ) : (
                  <div className="history-badge-wrap">
                    <span className="history-badge"><Icon name="history" size={14} /> Previous Report</span>
                    <button type="button" className="jump-today-btn" onClick={() => handleDateChange(getCurrentDate())}>Jump to Today</button>
                  </div>
                )}
              </div>

              <div className="report-date-bar">
                <div className="date-bar-left">
                  <div className="date-presets">
                    <button
                      type="button"
                      className={`preset-btn ${isToday ? 'active' : ''}`}
                      onClick={() => handleDateChange(getCurrentDate())}
                      disabled={loading}
                    >
                      <span className="preset-dot" /> Today
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${isYesterday ? 'active' : ''}`}
                      onClick={() => handleDateChange(getYesterdayDate())}
                      disabled={loading}
                    >
                      Yesterday
                    </button>
                  </div>

                  <div className="date-stepper-wrap">
                    <button
                      type="button"
                      className="stepper-btn"
                      title="Previous day"
                      onClick={() => handleDateChange(getPreviousDate(selectedDate))}
                      disabled={loading}
                    >
                      <Icon name="chevronLeft" size={15} />
                    </button>

                    <div className="date-input-group">
                      <Icon name="calendar" size={14} />
                      <input
                        id="report-target-date"
                        type="date"
                        value={selectedDate}
                        max={getCurrentDate()}
                        onChange={(event) => handleDateChange(event.target.value)}
                        disabled={loading}
                      />
                    </div>

                    <button
                      type="button"
                      className="stepper-btn"
                      title="Next day"
                      onClick={() => handleDateChange(getNextDate(selectedDate))}
                      disabled={loading || isToday}
                    >
                      <Icon name="chevronRight" size={15} />
                    </button>
                  </div>
                </div>

                <div className="date-bar-right">
                  <div className="date-info-wrap">
                    <span className="date-display-label">{formatDisplayDate(selectedDate)}</span>
                    {isToday ? (
                      <span className="date-tag live-tag">Current date</span>
                    ) : (
                      <span className="date-tag past-tag">Previous report</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="refresh-btn-bar"
                    onClick={() => loadReport(selectedDate)}
                    disabled={loading}
                  >
                    <Icon name="refresh" size={13} /> {loading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeView === 'overview' && (
            !can('view_overview') ? (
              <AccessRestrictedNotice
                requiredPermKey="view_overview"
                viewName="Overview Dashboard & KPIs"
                currentUser={currentUser}
                userPermissions={userPermissions}
                onSwitchView={setActiveView}
              />
            ) : (
              <OverviewDashboard
                overallDraws={overallDraws}
                supervisorReports={supervisorReports}
                selectedDate={selectedDate}
                branchName={branchName}
                loading={loading}
                error={error}
                onViewStatement={(group) => setStatementModalGroup(group)}
                onInspectDeficits={() => setIsDeficitModalOpen(true)}
                rawRows={rows}
                rawColumns={columns}
                endpointLabel={endpointLabel}
                onRefresh={() => loadReport(selectedDate)}
                canPrint={can('print_statements')}
                canExport={can('export_data')}
                canRawFeed={can('view_raw_feed')}
                currentUser={currentUser}
              />
            )
          )}

          {activeView === 'reports' && (
            !can('view_reports') ? (
              <AccessRestrictedNotice
                requiredPermKey="view_reports"
                viewName="Draw Gross & Turnover Reports"
                currentUser={currentUser}
                userPermissions={userPermissions}
                onSwitchView={setActiveView}
              />
            ) : (
              <>
                {!loading && !error && supervisorReports.length > 0 && <DrawGrossSummary supervisorReports={supervisorReports} />}

                {!loading && !error && <section className="report-panel gross-panel supervisor-report">
                  <div className="panel-heading supervisor-panel-heading">
                    <div className="panel-heading-title">
                      <h2>Gross per supervisor</h2>
                      <p className="source-label">Teller performance for {formatDisplayDate(selectedDate)}</p>
                    </div>
                    <div className="supervisor-filter-bar">
                      <div className="supervisor-filter-pills">
                        <button
                          type="button"
                          className={`filter-pill-btn ${activeSupervisor === 'all' ? 'active' : ''}`}
                          onClick={() => setSelectedSupervisor('all')}
                          title="Show all supervisors"
                        >
                          <Icon name="users" size={13} />
                          <span>All Supervisors</span>
                          <span className="filter-count-badge">{supervisorReports.length}</span>
                        </button>
                      </div>

                      <div className="supervisor-select-group">
                        <Icon name="user" size={14} />
                        <select
                          id="supervisor-filter-dropdown"
                          className="supervisor-filter-select"
                          value={activeSupervisor}
                          onChange={(event) => setSelectedSupervisor(event.target.value)}
                          aria-label="Filter supervisor"
                        >
                          <option value="all">All Supervisors ({supervisorReports.length})</option>
                          <optgroup label="Select Specific Supervisor">
                            {supervisorReports.map((group) => (
                              <option key={group.supervisor} value={group.supervisor}>
                                {group.supervisor} ({group.agents.length} {group.agents.length === 1 ? 'agent' : 'agents'})
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {activeSupervisor !== 'all' && (
                        <button
                          type="button"
                          className="reset-supervisor-filter-btn"
                          onClick={() => setSelectedSupervisor('all')}
                          title="Reset to all supervisors"
                        >
                          Show All
                        </button>
                      )}

                      <div className="overall-toggle-container">
                        <span className="overall-toggle-divider" />
                        <label className="overall-toggle-label" htmlFor="toggle-overall-columns" title="Toggle Overall group visibility">
                          <span className="overall-toggle-text">Show Overall</span>
                          <span className="toggle-switch-ui">
                            <input
                              type="checkbox"
                              id="toggle-overall-columns"
                              className="toggle-checkbox"
                              checked={showOverall}
                              onChange={(e) => setShowOverall(e.target.checked)}
                            />
                            <span className="toggle-track-slider" />
                          </span>
                        </label>
                      </div>

                      <div className="view-mode-toggle-wrap">
                        <span className="overall-toggle-divider" />
                        <div className="view-mode-tabs" role="group" aria-label="Table format">
                          <button
                            type="button"
                            className={`view-mode-tab-btn ${reportViewMode === 'matrix' ? 'active' : ''}`}
                            onClick={() => setReportViewMode('matrix')}
                            title="Show Draw Matrix (10:30 AM, 2:00 PM, 3:00 PM, 5:00 PM, 7:00 PM, 9:00 PM)"
                          >
                            <Icon name="fields" size={12} />
                            <span>Draw Matrix</span>
                          </button>
                          <button
                            type="button"
                            className={`view-mode-tab-btn ${reportViewMode === 'statement' ? 'active' : ''}`}
                            onClick={() => setReportViewMode('statement')}
                            title="Show Balance Sheet Remittance Statement (Positive on top, Negative on bottom)"
                          >
                            <Icon name="fileText" size={12} />
                            <span>Remittance Statement</span>
                          </button>
                        </div>
                      </div>

                      {supervisorReports.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="supervisor-statement-top-btn deficit-inspector-btn"
                            onClick={() => setIsDeficitModalOpen(true)}
                            title="Inspect all negative balances and deficits per draw, supervisor, and agent"
                          >
                            <Icon name="alert" size={13} />
                            <span>Negative Inspector</span>
                            {deficitTellersCount > 0 && <span className="deficit-topbar-pill">{deficitTellersCount}</span>}
                          </button>
                          <button
                            type="button"
                            className={`supervisor-statement-top-btn ${!can('print_statements') ? 'is-perm-locked' : ''}`}
                            onClick={() => {
                              if (!can('print_statements')) {
                                alert(`Access Restricted: Printing statements is locked for @${currentUser?.username || 'user'} in the Role Matrix.`)
                                return
                              }
                              const target = activeSupervisor !== 'all'
                                ? (supervisorReports.find((g) => g.supervisor === activeSupervisor) ?? supervisorReports[0])
                                : {
                                    supervisor: 'ALL SUPERVISORS (CONSOLIDATED)',
                                    agents: supervisorReports.flatMap((s) => s.agents.map((a) => ({
                                      ...a,
                                      teller: `${a.teller} (${s.supervisor})`,
                                    }))),
                                  }
                              if (target) setStatementModalGroup(target)
                            }}
                            title={can('print_statements') ? "View and print official balance sheet remittance statement" : "Printing statements is locked for your account in the Role Matrix"}
                          >
                            <Icon name={can('print_statements') ? "print" : "lock"} size={13} />
                            <span>{can('print_statements') ? "Print Statement" : "Print Locked"}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!hasAgentFields || !hasSupervisorFields ? <div className="breakdown-note">The current API response does not include {hasAgentFields ? 'supervisor' : hasSupervisorFields ? 'agent' : 'agent or supervisor'} fields, so the available gross is grouped as unspecified. The endpoint must return those fields for an attributed breakdown.</div> : null}
                  {drawRows.length === 0 ? <div className="state-message">No agent report records were returned for {formatDisplayDate(selectedDate)}.</div> : <div className="supervisor-groups">{displayedSupervisors.map((group) => <section className="supervisor-group" key={group.supervisor}>
                    <div className="supervisor-heading">
                      <div className="supervisor-heading-info">
                        <strong>{group.supervisor}</strong>
                        <span>{group.agents.length} agents / {drawGroups.length} draw groups</span>
                      </div>
                      <button
                        type="button"
                        className={`supervisor-heading-statement-btn ${!can('print_statements') ? 'is-perm-locked' : ''}`}
                        onClick={() => {
                          if (!can('print_statements')) {
                            alert(`Access Restricted: Printing statements is locked for @${currentUser?.username || 'user'} in the Role Matrix.`)
                            return
                          }
                          setStatementModalGroup(group)
                        }}
                        title={can('print_statements') ? `Open official financial statement for ${group.supervisor}` : "Printing statements is locked for this account in the Role Matrix"}
                      >
                        <Icon name={can('print_statements') ? "print" : "lock"} size={13} />
                        <span>{can('print_statements') ? "Print Statement" : "Print Locked"}</span>
                      </button>
                    </div>
                    {reportViewMode === 'statement' ? (
                      <SupervisorStatementTable group={group} selectedDate={selectedDate} branchName={branchName} />
                    ) : (
                      <MatrixTable group={group} showOverall={showOverall} />
                    )}
                  </section>)}</div>}
                </section>}
              </>
            )
          )}

          {activeView === 'commissions' && (
            !can('manage_commissions') ? (
              <AccessRestrictedNotice
                requiredPermKey="manage_commissions"
                viewName="Agent Commissions Management"
                currentUser={currentUser}
                userPermissions={userPermissions}
                onSwitchView={setActiveView}
              />
            ) : (
              <CommissionManagementView
                supervisors={supervisorReports}
                currentUser={currentUser}
                can={can}
                onRatesUpdated={(newSettings) => setCommissionSettings(newSettings)}
              />
            )
          )}

          {(activeView === 'rbac' || activeView === 'activity') && (
            !(activeView === 'rbac' ? can('manage_users') : can('audit_logs')) ? (
              <AccessRestrictedNotice
                requiredPermKey={activeView === 'rbac' ? 'manage_users' : 'audit_logs'}
                viewName={activeView === 'rbac' ? 'Users & RBAC Management' : 'Security & Audit Log'}
                currentUser={currentUser}
                userPermissions={userPermissions}
                onSwitchView={setActiveView}
              />
            ) : (
              <RbacManagementView
                currentUser={currentUser}
                onSimulateUser={(simUser) => {
                  const isTargetAdmin = simUser.role === 'admin'
                  const updatedUser = {
                    ...simUser,
                    simulatedFromAdmin: !isTargetAdmin,
                  }
                  setCurrentUser(updatedUser)
                  updateCloudSession(updatedUser.token, updatedUser).catch(() => void 0)
                }}
                branchName={branchName}
                initialTab={activeView === 'activity' ? 'logs' : 'users'}
              />
            )
          )}
        </section>
      </main>

      {statementModalGroup && (
        <SupervisorStatementModal
          group={statementModalGroup}
          selectedDate={selectedDate}
          allSupervisors={supervisorReports}
          branchName={branchName}
          onClose={() => setStatementModalGroup(null)}
          onSelectSupervisor={(newGroup) => setStatementModalGroup(newGroup)}
          canPrint={can('print_statements')}
          currentUser={currentUser}
        />
      )}

      {isDeficitModalOpen && (
        <DeficitInspectorModal
          isOpen={isDeficitModalOpen}
          onClose={() => setIsDeficitModalOpen(false)}
          supervisorReports={supervisorReports}
          drawGroups={drawGroups}
          selectedDate={selectedDate}
          branchName={branchName}
          canPrint={can('print_statements')}
        />
      )}
    </div>
  )
}

export default App
