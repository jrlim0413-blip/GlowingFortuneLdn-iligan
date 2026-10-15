import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getCashierClaimsFromSupabase, saveCashierClaimsToSupabase, deleteCashierClaimFromSupabase } from './supabase'
import ConfirmActionModal from './ConfirmActionModal'
import './DeficitInspectorModal.css'

function formatAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0.00'
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '₱0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getGroupedDrawTotal(agent, group, field) {
  if (!agent?.draws || !group?.times) return 0
  return group.times.reduce((total, time) => {
    const d = agent.draws instanceof Map ? agent.draws.get(time) : agent.draws?.[time]
    return total + (Number(d?.[field]) || 0)
  }, 0)
}

function getCarryoverTotal(agent, drawGroups) {
  const firstDrawGross = getGroupedDrawTotal(agent, drawGroups[0], 'gross')
  const firstDrawHits = getGroupedDrawTotal(agent, drawGroups[0], 'hits')
  const firstDrawNet = firstDrawGross - firstDrawHits
  const secondDrawGross = getGroupedDrawTotal(agent, drawGroups[1], 'gross')
  return Math.max(firstDrawNet, 0) + secondDrawGross
}

function getThirdDrawCarryover(agent, drawGroups) {
  const secondDrawHits = getGroupedDrawTotal(agent, drawGroups[1], 'hits')
  const secondDrawNet = getCarryoverTotal(agent, drawGroups) - secondDrawHits
  const thirdDrawGross = getGroupedDrawTotal(agent, drawGroups[2], 'gross')
  return Math.max(secondDrawNet, 0) + thirdDrawGross
}

function getRotationNet(agent, drawGroup, drawGroups) {
  const gross = getGroupedDrawTotal(agent, drawGroup, 'gross')
  const hits = getGroupedDrawTotal(agent, drawGroup, 'hits')
  if (drawGroup.key === 'morning') {
    return gross - hits
  }
  if (drawGroup.key === 'afternoon') {
    return getCarryoverTotal(agent, drawGroups) - hits
  }
  if (drawGroup.key === 'evening') {
    return getThirdDrawCarryover(agent, drawGroups) - hits
  }
  return gross - hits
}

export default function DeficitInspectorModal({
  isOpen,
  onClose,
  supervisorReports = [],
  drawGroups = [
    { key: 'morning', label: '1st Draw', schedule: '10:30 AM + 2:00 PM', times: ['10:30 AM', '2:00 PM'] },
    { key: 'afternoon', label: '2nd Draw', schedule: '3:00 PM + 5:00 PM', times: ['3:00 PM', '5:00 PM'] },
    { key: 'evening', label: '3rd Draw', schedule: '7:00 PM + 9:00 PM', times: ['7:00 PM', '9:00 PM'] },
  ],
  selectedDate,
  branchName = 'LDN',
}) {
  const [activeModalTab, setActiveModalTab] = useState('breakdown') 
  const [selectedDrawFilter, setSelectedDrawFilter] = useState('all') 
  const [selectedSupervisor, setSelectedSupervisor] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('grouped') 
  const [sortBy, setSortBy] = useState('deficit-desc') 
  const [copiedNotice, setCopiedNotice] = useState(false)

  const [cashierClaims, setCashierClaims] = useState([])
  const [dbSyncStatus, setDbSyncStatus] = useState('idle') 
  const [pendingDeleteClaim, setPendingDeleteClaim] = useState(null)
  const [isDeletingClaim, setIsDeletingClaim] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [isSavingToDb, setIsSavingToDb] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadClaimsFromDatabase() {
      const res = await getCashierClaimsFromSupabase(branchName, selectedDate)
      if (!isMounted) return

      if (res.success && res.data) {
        setCashierClaims(res.data) 
        setDbSyncStatus(res.data.length > 0 ? 'saved' : 'idle')
      } else {
        setCashierClaims([]) 
      }
    }

    loadClaimsFromDatabase()

    return () => {
      isMounted = false
    }
  }, [branchName, selectedDate])

  const updateCashierClaims = (newClaims) => {
    setCashierClaims(newClaims)
    setDbSyncStatus('idle')
  }

  const handleSaveToDatabase = async () => {
    setDbSyncStatus('saving')
    const res = await saveCashierClaimsToSupabase(branchName, selectedDate, cashierClaims)
    if (res.success) {
      setDbSyncStatus('saved')
      setCashierClaims((prev) => prev.map((item) => ({ ...item, isSavedInDb: true })))
      setTimeout(() => setDbSyncStatus('idle'), 3000)
    } else {
      setDbSyncStatus('error')
      alert(`Supabase Database Error: ${res.error || 'Please run the SQL schema script in Supabase Editor to create payout_shortage_replenishments table.'}`)
    }
  }

  const handleConfirmSaveToDatabase = async () => {
    setIsSavingToDb(true)
    await handleSaveToDatabase()
    setIsSavingToDb(false)
    setShowSaveConfirm(false)
  }

  const handleAddClaimRow = () => {
    const newRow = {
      id: `shortage-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      supervisor: '',
      drawRotation: '1st Draw',
      amount: '',
      isSavedInDb: false,
    }
    updateCashierClaims([...cashierClaims, newRow])
  }

  const handleUpdateClaim = (id, field, value) => {
    const updated = cashierClaims.map((item) =>
      item.id === id ? { ...item, [field]: value, isSavedInDb: false } : item
    )
    updateCashierClaims(updated)
  }

  const handleDeleteClaimRow = async (id) => {
    const updated = cashierClaims.filter((item) => item.id !== id)
    updateCashierClaims(updated)

    setDbSyncStatus('saving')
    if (id && !id.startsWith('shortage-') && !id.startsWith('claim-')) {
      await deleteCashierClaimFromSupabase(id)
    }
    const res = await saveCashierClaimsToSupabase(branchName, selectedDate, updated)
    if (res.success) {
      setDbSyncStatus('saved')
      setCashierClaims(updated.map((item) => ({ ...item, isSavedInDb: true })))
      setTimeout(() => setDbSyncStatus('idle'), 3000)
    } else {
      setDbSyncStatus('error')
    }
  }

  const handleConfirmDeleteRow = async () => {
    if (!pendingDeleteClaim) return
    setIsDeletingClaim(true)
    await handleDeleteClaimRow(pendingDeleteClaim.id)
    setIsDeletingClaim(false)
    setPendingDeleteClaim(null)
  }

  const totalCashierClaims = useMemo(() => {
    return cashierClaims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  }, [cashierClaims])

  const handleCopyCashierClaims = () => {
    if (cashierClaims.length === 0) return

    let text = `💵 PAYOUT SHORTAGE REPLENISHMENTS\n`
    text += `🏢 Branch: ${branchName} | 📅 Date: ${selectedDate}\n`
    text += `-------------------------------------------\n\n`

    cashierClaims.forEach((claim) => {
      const amt = Number(claim.amount) || 0
      if (amt > 0 || claim.supervisor) {
        text += `👤 SUPERVISOR: ${claim.supervisor || 'Unspecified'}\n`
        text += `  Draw Rotation: ${claim.drawRotation || '1st Draw'}\n`
        text += `  Replenishment Amount: (₱ ${formatViberNum(amt)})\n\n`
      }
    })

    text += `-------------------------------------------\n`
    text += `💰 TOTAL PAYOUT SHORTAGE REPLENISHMENTS: (₱ ${formatViberNum(totalCashierClaims)})`

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotice(true)
      setTimeout(() => setCopiedNotice(false), 2500)
    })
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const allDrawTimes = useMemo(() => {
    const times = []
    drawGroups.forEach((g) => {
      g.times.forEach((t) => {
        if (!times.includes(t)) times.push(t)
      })
    })
    return times
  }, [drawGroups])

  const allDeficitRecords = useMemo(() => {
    const records = []

    supervisorReports.forEach((spvrGroup) => {
      const supervisor = spvrGroup.supervisor || 'UNASSIGNED'
      const agents = spvrGroup.agents || []

      agents.forEach((agent) => {
        const agentName = agent.teller || agent.key || 'Unknown Agent'
        const agentKey = agent.key || agentName
        const commissionRate = agent.commissionRate || 10
        const totalSalary = agent.totalSalary !== undefined ? agent.totalSalary : (agent.totalGross * (commissionRate / 100))

        const morningGross = getGroupedDrawTotal(agent, drawGroups[0], 'gross')
        const morningHits = getGroupedDrawTotal(agent, drawGroups[0], 'hits')
        const morningNet = morningGross - morningHits
        if (morningNet < 0) {
          records.push({
            id: `${supervisor}-${agentKey}-morning`,
            agentName,
            agentKey,
            supervisor,
            drawCategory: 'rotation',
            drawKey: 'morning',
            drawTitle: '1st Draw (Morning)',
            drawSchedule: '10:30 AM + 2:00 PM',
            gross: morningGross,
            hits: morningHits,
            commission: 0,
            net: morningNet,
            deficit: Math.abs(morningNet),
            type: 'rotation',
          })
        }

        const afternoonGross = getGroupedDrawTotal(agent, drawGroups[1], 'gross')
        const afternoonHits = getGroupedDrawTotal(agent, drawGroups[1], 'hits')
        const afternoonNet = getRotationNet(agent, drawGroups[1], drawGroups)
        if (afternoonNet < 0) {
          records.push({
            id: `${supervisor}-${agentKey}-afternoon`,
            agentName,
            agentKey,
            supervisor,
            drawCategory: 'rotation',
            drawKey: 'afternoon',
            drawTitle: '2nd Draw (Afternoon)',
            drawSchedule: '3:00 PM + 5:00 PM',
            gross: afternoonGross,
            hits: afternoonHits,
            commission: 0,
            net: afternoonNet,
            deficit: Math.abs(afternoonNet),
            type: 'rotation',
          })
        }

        const eveningGross = getGroupedDrawTotal(agent, drawGroups[2], 'gross')
        const eveningHits = getGroupedDrawTotal(agent, drawGroups[2], 'hits')
        const eveningNet = getRotationNet(agent, drawGroups[2], drawGroups)
        if (eveningNet < 0) {
          records.push({
            id: `${supervisor}-${agentKey}-evening`,
            agentName,
            agentKey,
            supervisor,
            drawCategory: 'rotation',
            drawKey: 'evening',
            drawTitle: '3rd Draw (Evening)',
            drawSchedule: '7:00 PM + 9:00 PM',
            gross: eveningGross,
            hits: eveningHits,
            commission: 0,
            net: eveningNet,
            deficit: Math.abs(eveningNet),
            type: 'rotation',
          })
        }

        const eveningGroupNet = getRotationNet(agent, drawGroups[2], drawGroups)
        const remittanceNetSales = eveningGroupNet - totalSalary
        if (remittanceNetSales < 0) {
          records.push({
            id: `${supervisor}-${agentKey}-remittance`,
            agentName,
            agentKey,
            supervisor,
            drawCategory: 'remittance',
            drawKey: 'remittance',
            drawTitle: 'End-of-Day Remittance',
            drawSchedule: 'Final Remittance Balance',
            gross: agent.totalGross || 0,
            hits: agent.totalHits || 0,
            commission: totalSalary,
            commissionRate,
            net: remittanceNetSales,
            deficit: Math.abs(remittanceNetSales),
            type: 'remittance',
          })
        }

        allDrawTimes.forEach((time) => {
          const drawMap = agent.draws
          const drawData = drawMap instanceof Map ? drawMap.get(time) : drawMap?.[time]
          const drawGross = Number(drawData?.gross) || 0
          const drawHits = Number(drawData?.hits) || 0
          const drawNet = drawGross - drawHits
          if (drawNet < 0) {
            records.push({
              id: `${supervisor}-${agentKey}-time-${time}`,
              agentName,
              agentKey,
              supervisor,
              drawCategory: 'individual_time',
              drawKey: time,
              drawTitle: `Draw ${time}`,
              drawSchedule: `Specific Draw ${time}`,
              gross: drawGross,
              hits: drawHits,
              commission: 0,
              net: drawNet,
              deficit: Math.abs(drawNet),
              type: 'time',
            })
          }
        })
      })
    })

    return records
  }, [supervisorReports, drawGroups, allDrawTimes])

  const supervisorList = useMemo(() => {
    const map = new Map()
    supervisorReports.forEach((s) => {
      map.set(s.supervisor, 0)
    })
    allDeficitRecords.forEach((r) => {
      map.set(r.supervisor, (map.get(r.supervisor) || 0) + 1)
    })
    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
    }))
  }, [supervisorReports, allDeficitRecords])

  const filteredRecords = useMemo(() => {
    let result = allDeficitRecords

    if (selectedDrawFilter === 'all') {
      result = result.filter((r) => r.drawCategory === 'rotation' || r.drawCategory === 'remittance')
    } else if (selectedDrawFilter === 'all_including_times') {
      result = result
    } else if (['morning', 'afternoon', 'evening', 'remittance'].includes(selectedDrawFilter)) {
      result = result.filter((r) => r.drawKey === selectedDrawFilter)
    } else {
      result = result.filter((r) => r.drawKey === selectedDrawFilter)
    }

    if (selectedSupervisor !== 'all') {
      result = result.filter((r) => r.supervisor === selectedSupervisor)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (r) =>
          r.agentName.toLowerCase().includes(q) ||
          r.supervisor.toLowerCase().includes(q) ||
          r.drawTitle.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'deficit-desc') return b.deficit - a.deficit
      if (sortBy === 'deficit-asc') return a.deficit - b.deficit
      if (sortBy === 'name-asc') return a.agentName.localeCompare(b.agentName)
      if (sortBy === 'spvr-asc') return a.supervisor.localeCompare(b.supervisor)
      return 0
    })
  }, [allDeficitRecords, selectedDrawFilter, selectedSupervisor, searchQuery, sortBy])

  const groupedBySupervisor = useMemo(() => {
    const groups = new Map()
    filteredRecords.forEach((rec) => {
      if (!groups.has(rec.supervisor)) {
        groups.set(rec.supervisor, {
          supervisor: rec.supervisor,
          records: [],
          totalDeficit: 0,
          uniqueAgents: new Set(),
        })
      }
      const g = groups.get(rec.supervisor)
      g.records.push(rec)
      g.totalDeficit += rec.deficit
      g.uniqueAgents.add(rec.agentKey)
    })

    return Array.from(groups.values()).sort((a, b) => b.totalDeficit - a.totalDeficit)
  }, [filteredRecords])

  const summaryMetrics = useMemo(() => {
    const totalDeficit = filteredRecords.reduce((sum, r) => sum + r.deficit, 0)
    const uniqueAgentKeys = new Set(filteredRecords.map((r) => `${r.supervisor}-${r.agentKey}`))
    const uniqueCount = uniqueAgentKeys.size
    const highestRecord = filteredRecords.length > 0 ? filteredRecords[0] : null
    const avgDeficit = uniqueCount > 0 ? totalDeficit / uniqueCount : 0

    return {
      totalDeficit,
      uniqueCount,
      recordCount: filteredRecords.length,
      highestRecord,
      avgDeficit,
    }
  }, [filteredRecords])

  const formatViberNum = (num) => {
    const val = Number(num) || 0
    return val.toLocaleString('en-PH', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
  }

  const handleCopySummary = () => {
    if (filteredRecords.length === 0) return

    let text = `📋 GLOWING FORTUNE - DEFICIT SUMMARY\n`
    text += `🏢 Branch: ${branchName} | 📅 Date: ${selectedDate}\n`
    text += `-------------------------------------------\n`

    const supervisorMap = new Map()

    filteredRecords.forEach((r) => {
      if (!supervisorMap.has(r.supervisor)) {
        supervisorMap.set(r.supervisor, new Map())
      }
      const drawMap = supervisorMap.get(r.supervisor)

      let drawHeader = '1ST DRAW'
      if (r.drawKey === 'afternoon' || r.drawTitle?.toLowerCase().includes('2nd')) {
        drawHeader = '2ND DRAW'
      } else if (r.drawKey === 'evening' || r.drawTitle?.toLowerCase().includes('3rd')) {
        drawHeader = '3RD DRAW'
      } else if (r.drawKey === 'morning' || r.drawTitle?.toLowerCase().includes('1st')) {
        drawHeader = '1ST DRAW'
      } else if (r.drawKey === 'remittance' || r.drawTitle?.toLowerCase().includes('remittance')) {
        drawHeader = 'NET REMITTANCE'
      } else {
        drawHeader = (r.drawTitle || 'DRAW').toUpperCase()
      }

      if (!drawMap.has(drawHeader)) {
        drawMap.set(drawHeader, [])
      }
      drawMap.get(drawHeader).push(r)
    })

    supervisorMap.forEach((drawMap, supervisorName) => {
      text += `\n👤 SUPERVISOR: ${supervisorName}\n`

      drawMap.forEach((records, drawHeader) => {
        text += `\n🔴 ${drawHeader}\n`
        records.forEach((r) => {
          text += `• ${r.agentName}\n`
          text += `  Negative: (${formatViberNum(r.deficit)})\n`
        })
      })
    })

    text += `\n-------------------------------------------\n`
    text += `💰 TOTAL DEFICIT: (₱ ${formatViberNum(summaryMetrics.totalDeficit)})`

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotice(true)
      setTimeout(() => setCopiedNotice(false), 2500)
    })
  }

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return

    const headers = ['Supervisor', 'Agent Name', 'Draw / Category', 'Schedule', 'Gross Sales', 'Hits', 'Commission', 'Net Amount', 'Deficit Amount']
    const rows = filteredRecords.map((r) => [
      `"${r.supervisor}"`,
      `"${r.agentName}"`,
      `"${r.drawTitle}"`,
      `"${r.drawSchedule}"`,
      r.gross.toFixed(2),
      r.hits.toFixed(2),
      r.commission.toFixed(2),
      r.net.toFixed(2),
      r.deficit.toFixed(2),
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `GlowingFortune_Deficits_${branchName}_${selectedDate}_${selectedDrawFilter}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  const modalNode = (
    <div className="deficit-modal-backdrop" onClick={onClose}>
      <div className="deficit-modal-shell" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {}
        <div className="deficit-modal-header">
          <div className="deficit-header-title-wrap">
            <div className="deficit-icon-pill">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <div className="deficit-title-row">
                <h2>Deficit &amp; Negative Balance Inspector</h2>
                <span className="deficit-branch-badge">{branchName} Branch</span>
                <span className="deficit-date-badge">{selectedDate}</span>
              </div>
              <p className="deficit-subtitle">
                Official draw-by-draw teller deficits per supervisor and agent.
              </p>
            </div>
          </div>

          <div className="deficit-header-actions">
            <button
              type="button"
              className={`deficit-action-btn ${copiedNotice ? 'copied-active' : ''}`}
              onClick={activeModalTab === 'cashier_claims' ? handleCopyCashierClaims : handleCopySummary}
              title="Copy formatted summary for Viber / Messenger"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copiedNotice ? 'Copied to Clipboard!' : 'Copy for Viber/Messenger'}</span>
            </button>

            <button
              type="button"
              className="deficit-action-btn"
              onClick={handleExportCSV}
              title="Export all filtered negative records to CSV"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              className="deficit-close-btn"
              onClick={onClose}
              title="Close modal (Esc)"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {}
        <div className="deficit-main-nav-bar">
          <button
            type="button"
            className={`deficit-main-nav-tab ${activeModalTab === 'breakdown' ? 'active' : ''}`}
            onClick={() => setActiveModalTab('breakdown')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Draw Deficits Breakdown</span>
          </button>

          <button
            type="button"
            className={`deficit-main-nav-tab ${activeModalTab === 'cashier_claims' ? 'active' : ''}`}
            onClick={() => setActiveModalTab('cashier_claims')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>Payout Shortage Replenishment</span>
            {cashierClaims.length > 0 && (
              <span className="cashier-claims-count-badge">
                {cashierClaims.filter((c) => Number(c.amount) > 0).length}
              </span>
            )}
          </button>
        </div>

        {activeModalTab === 'cashier_claims' && (
          <div className="cashier-claims-wrapper">
            <div className="cashier-claims-header-bar">
              <div className="cashier-claims-title-group">
                <h3 className="cashier-claims-title">Payout Shortage Replenishment Ledger</h3>
                <p className="cashier-claims-sub">
                  Record payout shortage replenishment amounts collected by supervisors directly from the cashier.
                </p>
              </div>

              <div className="cashier-claims-actions">
                <button
                  type="button"
                  className={`cashier-save-db-btn status-${dbSyncStatus}`}
                  onClick={() => setShowSaveConfirm(true)}
                  disabled={dbSyncStatus === 'saving'}
                  title="Save shortage replenishments to Supabase database"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>
                    {dbSyncStatus === 'saving'
                      ? 'Saving...'
                      : dbSyncStatus === 'saved'
                      ? '✓ Saved to Database'
                      : dbSyncStatus === 'error'
                      ? '⚠ Retry Save'
                      : 'Save to Database'}
                  </span>
                </button>

                <button
                  type="button"
                  className="cashier-add-row-btn"
                  onClick={handleAddClaimRow}
                  title="Add row for Supervisor"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>+ Add Row (Supervisor)</span>
                </button>
              </div>
            </div>

            <div className="cashier-claims-table-container">
              {cashierClaims.length === 0 ? (
                <div className="cashier-claims-empty">
                  <p>No payout shortage replenishment records found for this date.</p>
                  <button type="button" className="cashier-add-row-btn" onClick={handleAddClaimRow}>
                    + Add Row (Supervisor)
                  </button>
                </div>
              ) : (
                <table className="cashier-claims-table">
                  <thead>
                    <tr>
                      <th style={{ width: '55px' }}>#</th>
                      <th style={{ width: '38%' }}>SUPERVISOR</th>
                      <th style={{ width: '30%' }}>DRAW ROTATION</th>
                      <th style={{ width: '24%' }}>REPLENISHMENT AMOUNT (₱)</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierClaims.map((claim, idx) => (
                      <tr
                        key={claim.id}
                        className={`cashier-claim-row ${claim.isSavedInDb ? 'is-saved-row' : 'is-unsaved-row'}`}
                      >
                        <td className="cashier-row-idx">
                          <div className="cashier-idx-badge-wrap">
                            <span>{idx + 1}</span>
                            {claim.isSavedInDb ? (
                              <span className="row-saved-check" title="Saved in database">✓</span>
                            ) : (
                              <span className="row-unsaved-dot" title="Unsaved draft">●</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            list="supervisor-suggestions"
                            className="cashier-input-field"
                            placeholder="Select or type supervisor..."
                            value={claim.supervisor}
                            onChange={(e) => handleUpdateClaim(claim.id, 'supervisor', e.target.value)}
                          />
                          <datalist id="supervisor-suggestions">
                            {supervisorList.map((s) => (
                              <option key={s.name} value={s.name} />
                            ))}
                          </datalist>
                        </td>
                        <td>
                          <select
                            className="cashier-input-field cashier-select-field"
                            value={claim.drawRotation || '1st Draw'}
                            onChange={(e) => handleUpdateClaim(claim.id, 'drawRotation', e.target.value)}
                          >
                            <option value="1st Draw">1st Draw (Morning)</option>
                            <option value="2nd Draw">2nd Draw (Afternoon)</option>
                            <option value="3rd Draw">3rd Draw (Evening)</option>
                            <option value="All Draws / Remittance">All Draws / Remittance</option>
                          </select>
                        </td>
                        <td>
                          <div className="cashier-amt-input-wrap">
                            <span className="cashier-currency-prefix">₱</span>
                            <input
                              type="number"
                              step="any"
                              className="cashier-input-field cashier-amt-field"
                              placeholder="0.00"
                              value={claim.amount}
                              onChange={(e) => handleUpdateClaim(claim.id, 'amount', e.target.value)}
                            />
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="cashier-delete-btn"
                            onClick={() => setPendingDeleteClaim(claim)}
                            title="Delete row"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="cashier-claims-footer">
              <div className="cashier-total-box">
                <span className="cashier-total-label">TOTAL PAYOUT SHORTAGE REPLENISHMENTS:</span>
                <strong className="cashier-total-val">{formatCurrency(totalCashierClaims)}</strong>
                <span className="cashier-total-count">
                  ({cashierClaims.filter((c) => Number(c.amount) > 0).length} supervisor claims)
                </span>
              </div>
            </div>
          </div>
        )}

        {activeModalTab === 'breakdown' && (
          <>

        {}
        <div className="deficit-kpi-grid">
          <div className="deficit-kpi-card total-deficit-card">
            <span className="deficit-kpi-label">TOTAL NEGATIVE EXPOSURE</span>
            <div className="deficit-kpi-value-row">
              <span className="deficit-kpi-amount">{formatCurrency(summaryMetrics.totalDeficit)}</span>
            </div>
            <span className="deficit-kpi-hint">
              Across {summaryMetrics.recordCount} negative draw records ({summaryMetrics.uniqueCount} agents)
            </span>
          </div>

          <div className="deficit-kpi-card">
            <span className="deficit-kpi-label">NEGATIVE AGENTS</span>
            <div className="deficit-kpi-value-row">
              <span className="deficit-kpi-num">{summaryMetrics.uniqueCount}</span>
              <span className="deficit-kpi-tag warning-tag">In Deficit</span>
            </div>
            <span className="deficit-kpi-hint">
              Total unique tellers with deficit balance
            </span>
          </div>

          <div className="deficit-kpi-card">
            <span className="deficit-kpi-label">AVERAGE DEFICIT / AGENT</span>
            <div className="deficit-kpi-value-row">
              <span className="deficit-kpi-num">{formatCurrency(summaryMetrics.avgDeficit)}</span>
            </div>
            <span className="deficit-kpi-hint">
              Mean negative balance per affected teller
            </span>
          </div>

          <div className="deficit-kpi-card">
            <span className="deficit-kpi-label">HIGHEST SINGLE DEFICIT</span>
            <div className="deficit-kpi-value-row">
              {summaryMetrics.highestRecord ? (
                <div>
                  <span className="deficit-kpi-agent-name">{summaryMetrics.highestRecord.agentName}</span>
                  <span className="deficit-kpi-high-val">({formatCurrency(summaryMetrics.highestRecord.deficit)})</span>
                </div>
              ) : (
                <span className="deficit-kpi-agent-name">None (₱0.00)</span>
              )}
            </div>
            <span className="deficit-kpi-hint">
              {summaryMetrics.highestRecord ? `Supervisor: ${summaryMetrics.highestRecord.supervisor}` : 'Clean balance sheet'}
            </span>
          </div>
        </div>

        {}
        <div className="deficit-controls-bar">
          <div className="deficit-draw-tabs-row">
            <span className="deficit-filter-caption">DRAW ROTATION:</span>
            <div className="deficit-tabs-group" role="tablist">
              <button
                type="button"
                className={`deficit-tab-btn ${selectedDrawFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedDrawFilter('all')}
              >
                All Draws &amp; Remittance
              </button>
              <button
                type="button"
                className={`deficit-tab-btn tab-morning ${selectedDrawFilter === 'morning' ? 'active' : ''}`}
                onClick={() => setSelectedDrawFilter('morning')}
              >
                1st Draw (Morning)
              </button>
              <button
                type="button"
                className={`deficit-tab-btn tab-afternoon ${selectedDrawFilter === 'afternoon' ? 'active' : ''}`}
                onClick={() => setSelectedDrawFilter('afternoon')}
              >
                2nd Draw (Afternoon)
              </button>
              <button
                type="button"
                className={`deficit-tab-btn tab-evening ${selectedDrawFilter === 'evening' ? 'active' : ''}`}
                onClick={() => setSelectedDrawFilter('evening')}
              >
                3rd Draw (Evening)
              </button>
              <button
                type="button"
                className={`deficit-tab-btn tab-remittance ${selectedDrawFilter === 'remittance' ? 'active' : ''}`}
                onClick={() => setSelectedDrawFilter('remittance')}
              >
                End-of-Day Remittance
              </button>
            </div>
          </div>

          <div className="deficit-secondary-controls">
            {}
            <div className="deficit-control-item">
              <label htmlFor="deficit-spvr-select">Supervisor:</label>
              <select
                id="deficit-spvr-select"
                className="deficit-select"
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
              >
                <option value="all">All Supervisors ({supervisorReports.length})</option>
                {supervisorList.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} {s.count > 0 ? `(${s.count} deficits)` : '(0)'}
                  </option>
                ))}
              </select>
            </div>

            {}
            <div className="deficit-control-item">
              <label htmlFor="deficit-time-select">Specific Time:</label>
              <select
                id="deficit-time-select"
                className="deficit-select"
                value={['morning', 'afternoon', 'evening', 'remittance', 'all'].includes(selectedDrawFilter) ? '' : selectedDrawFilter}
                onChange={(e) => {
                  if (e.target.value) setSelectedDrawFilter(e.target.value)
                }}
              >
                <option value="">By Draw Time...</option>
                {allDrawTimes.map((t) => (
                  <option key={t} value={t}>
                    Draw {t}
                  </option>
                ))}
              </select>
            </div>

            {}
            <div className="deficit-search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search agent or supervisor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {}
            <div className="deficit-view-toggle">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
                onClick={() => setViewMode('grouped')}
                title="Group records by Supervisor"
              >
                By Supervisor
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'flat' ? 'active' : ''}`}
                onClick={() => setViewMode('flat')}
                title="Unified Flat Ranking Table"
              >
                Flat Table
              </button>
            </div>
          </div>
        </div>

        {}
        <div className="deficit-modal-body">
          {filteredRecords.length === 0 ? (
            <div className="deficit-empty-state">
              <div className="deficit-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3>No Negative Deficits Found</h3>
              <p>
                {searchQuery || selectedSupervisor !== 'all' || selectedDrawFilter !== 'all'
                  ? 'No tellers match the selected draw, supervisor, or search filters.'
                  : 'All active agents have positive remittance balances for the selected date.'}
              </p>
              {(searchQuery || selectedSupervisor !== 'all' || selectedDrawFilter !== 'all') && (
                <button
                  type="button"
                  className="reset-filters-btn"
                  onClick={() => {
                    setSelectedDrawFilter('all')
                    setSelectedSupervisor('all')
                    setSearchQuery('')
                  }}
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : viewMode === 'grouped' ? (
            <div className="deficit-groups-list">
              {groupedBySupervisor.map((group) => (
                <div key={group.supervisor} className="deficit-spvr-card">
                  <div className="deficit-spvr-header">
                    <div className="deficit-spvr-info">
                      <span className="spvr-avatar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <div>
                        <strong className="spvr-name">{group.supervisor}</strong>
                        <span className="spvr-meta">
                          {group.uniqueAgents.size} tellers in deficit • {group.records.length} negative records
                        </span>
                      </div>
                    </div>
                    <div className="deficit-spvr-subtotal">
                      <small>Supervisor Deficit Subtotal:</small>
                      <strong className="deficit-pill-large">
                        ({formatCurrency(group.totalDeficit)})
                      </strong>
                    </div>
                  </div>

                  <div className="deficit-table-wrap">
                    <table className="deficit-data-table">
                      <thead>
                        <tr>
                          <th>AGENT / TELLER NAME</th>
                          <th>DRAW ROTATION</th>
                          <th className="num-col">GROSS</th>
                          <th className="num-col">HITS</th>
                          <th className="num-col">COMMISSION</th>
                          <th className="num-col highlight-col">NEGATIVE DEFICIT</th>
                          <th>SEVERITY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.records.map((record) => {
                          const isHigh = record.deficit >= 10000
                          const isModerate = record.deficit >= 3000 && record.deficit < 10000
                          return (
                            <tr key={record.id} className="deficit-row">
                              <td className="agent-cell">
                                <span className="agent-name-main">{record.agentName}</span>
                                <span className="agent-key-sub">{record.agentKey}</span>
                              </td>
                              <td className="draw-cell">
                                <span className={`draw-badge badge-${record.drawKey}`}>
                                  {record.drawTitle}
                                </span>
                                <span className="draw-sub-sched">{record.drawSchedule}</span>
                              </td>
                              <td className="num-col">{formatAmount(record.gross)}</td>
                              <td className="num-col hits-text">{formatAmount(record.hits)}</td>
                              <td className="num-col">
                                {record.commission > 0 ? (
                                  <>
                                    {formatAmount(record.commission)}
                                    {record.commissionRate && (
                                      <small className="comm-rate-sub">({record.commissionRate}%)</small>
                                    )}
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="num-col highlight-col">
                                <span className="deficit-amount-badge">
                                  ({formatCurrency(record.deficit)})
                                </span>
                              </td>
                              <td>
                                {isHigh ? (
                                  <span className="severity-badge sev-critical">CRITICAL</span>
                                ) : isModerate ? (
                                  <span className="severity-badge sev-elevated">ELEVATED</span>
                                ) : (
                                  <span className="severity-badge sev-normal">STANDARD</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="deficit-flat-table-wrap">
              <table className="deficit-data-table flat-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>AGENT / TELLER</th>
                    <th>SUPERVISOR</th>
                    <th>DRAW / CATEGORY</th>
                    <th className="num-col">GROSS</th>
                    <th className="num-col">HITS</th>
                    <th className="num-col">COMMISSION</th>
                    <th className="num-col highlight-col">NEGATIVE DEFICIT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, index) => {
                    const isHigh = record.deficit >= 10000
                    return (
                      <tr key={record.id} className="deficit-row">
                        <td className="rank-cell">
                          <span className={`rank-badge ${index < 3 ? 'top-rank' : ''}`}>
                            #{index + 1}
                          </span>
                        </td>
                        <td className="agent-cell">
                          <strong className="agent-name-main">{record.agentName}</strong>
                        </td>
                        <td className="spvr-cell">{record.supervisor}</td>
                        <td className="draw-cell">
                          <span className={`draw-badge badge-${record.drawKey}`}>
                            {record.drawTitle}
                          </span>
                        </td>
                        <td className="num-col">{formatAmount(record.gross)}</td>
                        <td className="num-col hits-text">{formatAmount(record.hits)}</td>
                        <td className="num-col">
                          {record.commission > 0 ? formatAmount(record.commission) : '—'}
                        </td>
                        <td className="num-col highlight-col">
                          <strong className="deficit-amount-badge">
                            ({formatCurrency(record.deficit)})
                          </strong>
                        </td>
                        <td>
                          {isHigh ? (
                            <span className="severity-badge sev-critical">CRITICAL</span>
                          ) : (
                            <span className="severity-badge sev-normal">DEFICIT</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

          </>
        )}

        {}
        <div className="deficit-modal-footer">
          <div className="footer-left">
            <span>
              Showing <strong>{filteredRecords.length}</strong> deficit records for{' '}
              <strong>{summaryMetrics.uniqueCount}</strong> tellers in <strong>{branchName}</strong>
            </span>
          </div>
          <div className="footer-right">
            <button type="button" className="footer-close-btn" onClick={onClose}>
              Close Inspector
            </button>
          </div>
        </div>

        {}
        <ConfirmActionModal
          isOpen={Boolean(pendingDeleteClaim)}
          title="Delete Payout Shortage Entry?"
          message="Are you sure you want to delete this replenishment entry? This action will permanently remove it from the database."
          details={
            pendingDeleteClaim && (
              <div>
                <div className="confirm-detail-row">
                  <span className="confirm-detail-label">Supervisor</span>
                  <span className="confirm-detail-value">{pendingDeleteClaim.supervisor || 'Unassigned'}</span>
                </div>
                <div className="confirm-detail-row">
                  <span className="confirm-detail-label">Draw Rotation</span>
                  <span className="confirm-detail-value">{pendingDeleteClaim.drawRotation || '1st Draw'}</span>
                </div>
                <div className="confirm-detail-row">
                  <span className="confirm-detail-label">Replenishment Amount</span>
                  <span className="confirm-detail-value">₱ {formatAmount(pendingDeleteClaim.amount)}</span>
                </div>
              </div>
            )
          }
          confirmText="Yes, Delete Record"
          cancelText="Cancel"
          confirmVariant="danger"
          isProcessing={isDeletingClaim}
          processingText="Deleting from Database..."
          onConfirm={handleConfirmDeleteRow}
          onCancel={() => !isDeletingClaim && setPendingDeleteClaim(null)}
        />

        {}
        <ConfirmActionModal
          isOpen={showSaveConfirm}
          title="Save Shortage Replenishments to Database?"
          message="Are you sure you want to save the Payout Shortage Replenishment ledger to the database for this branch and date?"
          details={
            <div>
              <div className="confirm-detail-row">
                <span className="confirm-detail-label">Branch</span>
                <span className="confirm-detail-value">{branchName}</span>
              </div>
              <div className="confirm-detail-row">
                <span className="confirm-detail-label">Date</span>
                <span className="confirm-detail-value">{selectedDate}</span>
              </div>
              <div className="confirm-detail-row">
                <span className="confirm-detail-label">Total Shortage Entries</span>
                <span className="confirm-detail-value">{cashierClaims.length} records</span>
              </div>
            </div>
          }
          confirmText="Yes, Save to Database"
          cancelText="Cancel"
          confirmVariant="success"
          isProcessing={isSavingToDb}
          processingText="Saving to Database..."
          onConfirm={handleConfirmSaveToDatabase}
          onCancel={() => !isSavingToDb && setShowSaveConfirm(false)}
        />
      </div>
    </div>
  )

  return createPortal(modalNode, document.body)
}
