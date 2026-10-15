import React, { useState, useEffect, useMemo } from 'react'
import { getPayoutShortagesFromSupabase } from './supabase'
import './DrawDeficitsExcelStatement.css'

function formatExcelDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatNegativeNum(val) {
  const num = Math.abs(Math.round(Number(val) || 0))
  if (num === 0) return '-'
  return `(${num.toLocaleString('en-US')})`
}

function formatCurrencyTotal(val) {
  const num = Number(val) || 0
  const isNeg = num < 0
  const absFormatted = Math.abs(num).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (isNeg) return `(₱ ${absFormatted})`
  return `₱ ${absFormatted}`
}

export function calculateAgentDrawDeficit(agent, drawKey) {
  if (!agent) return 0

  if (drawKey === 'morning') {
    const g1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.gross : agent.draws?.['10:30 AM']?.gross) || 0
    const g2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.gross : agent.draws?.['2:00 PM']?.gross) || 0
    const h1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.hits : agent.draws?.['10:30 AM']?.hits) || 0
    const h2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.hits : agent.draws?.['2:00 PM']?.hits) || 0
    const net = (Number(g1) + Number(g2)) - (Number(h1) + Number(h2))
    return net < 0 ? Math.abs(net) : 0
  }

  if (drawKey === 'afternoon') {
    const g1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.gross : agent.draws?.['10:30 AM']?.gross) || 0
    const g2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.gross : agent.draws?.['2:00 PM']?.gross) || 0
    const h1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.hits : agent.draws?.['10:30 AM']?.hits) || 0
    const h2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.hits : agent.draws?.['2:00 PM']?.hits) || 0
    const net1 = (Number(g1) + Number(g2)) - (Number(h1) + Number(h2))
    const carry1 = Math.max(0, net1)

    const g3 = (agent.draws instanceof Map ? agent.draws.get('3:00 PM')?.gross : agent.draws?.['3:00 PM']?.gross) || 0
    const g4 = (agent.draws instanceof Map ? agent.draws.get('5:00 PM')?.gross : agent.draws?.['5:00 PM']?.gross) || 0
    const h3 = (agent.draws instanceof Map ? agent.draws.get('3:00 PM')?.hits : agent.draws?.['3:00 PM']?.hits) || 0
    const h4 = (agent.draws instanceof Map ? agent.draws.get('5:00 PM')?.hits : agent.draws?.['5:00 PM']?.hits) || 0
    const net2 = (carry1 + Number(g3) + Number(g4)) - (Number(h3) + Number(h4))
    return net2 < 0 ? Math.abs(net2) : 0
  }

  if (drawKey === 'evening') {
    const g1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.gross : agent.draws?.['10:30 AM']?.gross) || 0
    const g2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.gross : agent.draws?.['2:00 PM']?.gross) || 0
    const h1 = (agent.draws instanceof Map ? agent.draws.get('10:30 AM')?.hits : agent.draws?.['10:30 AM']?.hits) || 0
    const h2 = (agent.draws instanceof Map ? agent.draws.get('2:00 PM')?.hits : agent.draws?.['2:00 PM']?.hits) || 0
    const net1 = (Number(g1) + Number(g2)) - (Number(h1) + Number(h2))
    const carry1 = Math.max(0, net1)

    const g3 = (agent.draws instanceof Map ? agent.draws.get('3:00 PM')?.gross : agent.draws?.['3:00 PM']?.gross) || 0
    const g4 = (agent.draws instanceof Map ? agent.draws.get('5:00 PM')?.gross : agent.draws?.['5:00 PM']?.gross) || 0
    const h3 = (agent.draws instanceof Map ? agent.draws.get('3:00 PM')?.hits : agent.draws?.['3:00 PM']?.hits) || 0
    const h4 = (agent.draws instanceof Map ? agent.draws.get('5:00 PM')?.hits : agent.draws?.['5:00 PM']?.hits) || 0
    const net2 = (carry1 + Number(g3) + Number(g4)) - (Number(h3) + Number(h4))
    const carry2 = Math.max(0, net2)

    const g5 = (agent.draws instanceof Map ? agent.draws.get('7:00 PM')?.gross : agent.draws?.['7:00 PM']?.gross) || 0
    const g6 = (agent.draws instanceof Map ? agent.draws.get('9:00 PM')?.gross : agent.draws?.['9:00 PM']?.gross) || 0
    const h5 = (agent.draws instanceof Map ? agent.draws.get('7:00 PM')?.hits : agent.draws?.['7:00 PM']?.hits) || 0
    const h6 = (agent.draws instanceof Map ? agent.draws.get('9:00 PM')?.hits : agent.draws?.['9:00 PM']?.hits) || 0
    const net3 = (carry2 + Number(g5) + Number(g6)) - (Number(h5) + Number(h6))
    return net3 < 0 ? Math.abs(net3) : 0
  }

  const gross = Number(agent.totalGross) || 0
  const hits = Number(agent.totalHits) || 0
  const comm = agent.totalSalary !== undefined ? Number(agent.totalSalary) : gross * ((agent.commissionRate || 10) / 100)
  const netSales = gross - hits - comm
  return netSales < 0 ? Math.abs(netSales) : 0
}

const ALL_DRAWS_CONFIG = [
  { key: 'morning', title: '1ST DRAW', subtext: '10:30 AM & 2:00 PM' },
  { key: 'afternoon', title: '2ND DRAW', subtext: '3:00 PM & 5:00 PM' },
  { key: 'evening', title: '3RD DRAW', subtext: '7:00 PM & 9:00 PM' },
]

export default function DrawDeficitsExcelStatement({
  group,
  allSupervisors = [],
  selectedDate,
  branchName = 'LDN',
}) {
  const isConsolidated = group?.supervisor === 'ALL SUPERVISORS (CONSOLIDATED)'

  const drawsData = useMemo(() => {
    const rawGroups = (isConsolidated && allSupervisors && allSupervisors.length > 0)
      ? allSupervisors
      : [group || { supervisor: 'SUPERVISOR 1', agents: [] }]

    return ALL_DRAWS_CONFIG.map((drawConf) => {
      const supervisorResults = rawGroups.map((s) => {
        const deficitAgents = (s.agents || []).map((agent) => {
          const deficit = calculateAgentDrawDeficit(agent, drawConf.key)
          return {
            teller: agent.teller,
            key: agent.key || agent.teller,
            deficit,
          }
        }).filter((a) => a.deficit > 0)

        const totalDeficit = deficitAgents.reduce((sum, a) => sum + a.deficit, 0)

        return {
          supervisor: s.supervisor,
          agents: deficitAgents,
          totalDeficit,
        }
      })

      const totalDeficitDraw = supervisorResults.reduce((sum, s) => sum + s.totalDeficit, 0)
      const totalCountDraw = supervisorResults.reduce((sum, s) => sum + s.agents.length, 0)

      let singleSupervisorData = null
      if (!isConsolidated) {
        const spvr = supervisorResults[0] || { supervisor: group?.supervisor || 'SUPERVISOR 1', agents: [], totalDeficit: 0 }
        singleSupervisorData = {
          supervisor: spvr.supervisor,
          totalDeficit: spvr.totalDeficit,
          totalCount: spvr.agents.length,
          agents: spvr.agents,
        }
      }

      return {
        ...drawConf,
        supervisorResults,
        totalDeficitDraw,
        totalCountDraw,
        singleSupervisorData,
      }
    })
  }, [group, allSupervisors, isConsolidated])

  const overallTotals = useMemo(() => {
    const rawGroups = (isConsolidated && allSupervisors && allSupervisors.length > 0)
      ? allSupervisors
      : [group || { supervisor: 'SUPERVISOR 1', agents: [] }]

    let gross = 0
    let hits = 0
    let commission = 0
    let net = 0
    let remittance = 0

    rawGroups.forEach((g) => {
      (g.agents || []).forEach((agent) => {
        const agGross = Number(agent.totalGross) || 0
        const agHits = Number(agent.totalHits) || 0
        const commRate = agent.commissionRate !== undefined ? agent.commissionRate : 10
        const agComm = agent.totalSalary !== undefined ? Number(agent.totalSalary) : (agGross * (commRate / 100))
        const agNet = agGross - agHits
        const agRemit = agNet - agComm

        gross += agGross
        hits += agHits
        commission += agComm
        net += agNet
        remittance += agRemit
      })
    })

    return {
      gross,
      hits,
      commission,
      net,
      remittance,
    }
  }, [group, allSupervisors, isConsolidated])

  const [psrData, setPsrData] = useState([])

  useEffect(() => {
    let isMounted = true
    async function loadPsr() {
      const res = await getPayoutShortagesFromSupabase(branchName || 'LDN', selectedDate)
      if (isMounted && res.success && res.data) {
        setPsrData(res.data)
      }
    }
    loadPsr()
    return () => {
      isMounted = false
    }
  }, [branchName, selectedDate])

  const psrSummary = useMemo(() => {
    const relevant = (!isConsolidated && group?.supervisor)
      ? psrData.filter((p) => p.supervisor === group.supervisor)
      : psrData

    const map = new Map()
    let totalPsr = 0

    relevant.forEach((p) => {
      const rot = p.drawRotation || '1st Draw'
      const amt = Number(p.amount) || 0
      map.set(rot, (map.get(rot) || 0) + amt)
      totalPsr += amt
    })

    const list = Array.from(map.entries()).map(([rotation, amount]) => ({ rotation, amount }))

    return {
      list,
      totalPsr,
    }
  }, [psrData, group, isConsolidated])

  const formattedDate = formatExcelDate(selectedDate)

  const renderTellerContent = (teller) => {
    if (!teller) return '\u00A0'
    const parts = teller.split(' - ')
    return <strong className="modern-teller-main" title={teller}>{parts[0]}</strong>
  }

  return (
    <div className="modern-roster-document">
      {}
      <div className="modern-draws-container">
        {drawsData.map((drawItem) => (
          <div key={`draw-block-${drawItem.key}`} className="modern-draw-card">
            {}
            <div className="modern-draw-banner">
              <div className="modern-draw-title-left">
                <span className="draw-title-badge">{drawItem.title}</span>
                <span className="draw-subtext-badge">({drawItem.subtext})</span>
                {drawItem.totalDeficitDraw > 0 && (
                  <span className="draw-header-total-badge">
                    Total Negative: <strong>{formatCurrencyTotal(drawItem.totalDeficitDraw)}</strong>
                  </span>
                )}
              </div>
            </div>

            {}
            {!isConsolidated && drawItem.singleSupervisorData && (
              <div className="modern-roster-body">
                {drawItem.singleSupervisorData.totalCount === 0 ? (
                  <div className="modern-clean-draw-notice">
                    <span className="clean-check">✓</span>
                    <span className="clean-msg">
                      No negative deficits in <strong>{drawItem.title}</strong> for {drawItem.singleSupervisorData.supervisor} — TOTAL NEGATIVE: ₱ 0
                    </span>
                  </div>
                ) : (
                  <table className="modern-single-col-table">
                    <thead>
                      <tr className="modern-draw-th-row">
                        <th className="modern-th-agent">
                          <span>AGENT / TELLER - NEGATIVE</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawItem.singleSupervisorData.agents.map((agent, aIdx) => (
                        <tr key={`r-${drawItem.key}-${aIdx}`} className="modern-tr tr-data">
                          <td className="modern-td-name">
                            <div className="modern-td-detail">
                              <span className="modern-td-agent-label">{renderTellerContent(agent.teller)}</span>
                            <span className="modern-amount-text">
                              {formatNegativeNum(agent.deficit)}
                            </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {}
                      <tr className="modern-draw-total-row">
                        <td className="modern-draw-total-label">
                          <div className="modern-td-detail">
                            <span className="modern-draw-total-copy">
                              <strong>TOTAL NEGATIVE</strong>
                              <span className="modern-total-count">({drawItem.singleSupervisorData.totalCount} {drawItem.singleSupervisorData.totalCount === 1 ? 'teller' : 'tellers'})</span>
                            </span>
                            <strong className="modern-draw-total-amt">{formatCurrencyTotal(drawItem.singleSupervisorData.totalDeficit)}</strong>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {}
            {isConsolidated && (
              <div className="modern-roster-body">
                {drawItem.totalCountDraw === 0 ? (
                  <div className="modern-clean-draw-notice">
                    <span className="clean-check">✓</span>
                    <span className="clean-msg">
                      No negative deficits recorded across all supervisors in <strong>{drawItem.title}</strong> — TOTAL NEGATIVE: ₱ 0
                    </span>
                  </div>
                ) : (
                  <table className="modern-single-col-table">
                    <thead>
                      <tr className="modern-draw-th-row">
                        <th className="modern-th-agent">
                          <span>SUPERVISOR &bull; AGENT - NEGATIVE</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawItem.supervisorResults
                        .flatMap((s) => s.agents.map((a) => ({ ...a, supervisor: s.supervisor })))
                        .map((agent, aIdx) => (
                          <tr key={`r-cons-${drawItem.key}-${aIdx}`} className="modern-tr tr-data">
                            <td className="modern-td-name">
                              <div className="modern-td-detail">
                                <span className="modern-td-agent-label">
                                  <span className="modern-spvr-tag">[{agent.supervisor}]</span>{' '}
                                  {renderTellerContent(agent.teller)}
                                </span>
                              <span className="modern-amount-text">
                                {formatNegativeNum(agent.deficit)}
                              </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {}
                      <tr className="modern-draw-total-row">
                        <td className="modern-draw-total-label">
                          <div className="modern-td-detail">
                            <span className="modern-draw-total-copy">
                              <strong>CONSOLIDATED TOTAL</strong>
                              <span className="modern-total-count">({drawItem.totalCountDraw} {drawItem.totalCountDraw === 1 ? 'teller' : 'tellers'})</span>
                            </span>
                            <strong className="modern-draw-total-amt">{formatCurrencyTotal(drawItem.totalDeficitDraw)}</strong>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}

        {}
        <div className="modern-draw-card modern-consolidated-card">
          <div className="modern-draw-banner consolidated-banner">
            <div className="modern-draw-title-left">
              <span className="draw-title-badge">CONSOLIDATED SUPERVISOR TOTAL</span>
            </div>
          </div>

          <div className="modern-summary-rows-body">
            <div className="modern-sum-line">
              <span className="sum-label">Overall Agent Gross</span>
              <span className="sum-eq">=</span>
              <span className="sum-val">{formatCurrencyTotal(overallTotals.gross)}</span>
            </div>
            <div className="modern-sum-line">
              <span className="sum-label">Overall Agent Hits</span>
              <span className="sum-eq">=</span>
              <span className="sum-val">{formatCurrencyTotal(overallTotals.hits)}</span>
            </div>
            <div className="modern-sum-line">
              <span className="sum-label">Overall Agent Commission</span>
              <span className="sum-eq">=</span>
              <span className="sum-val">{formatCurrencyTotal(overallTotals.commission)}</span>
            </div>
            <div className="modern-sum-line">
              <span className="sum-label">Overall Agent Net</span>
              <span className="sum-eq">=</span>
              <span className="sum-val">{formatCurrencyTotal(overallTotals.net)}</span>
            </div>
            <div className="modern-sum-line remit-line">
              <span className="sum-label">Overall Agent Remittance</span>
              <span className="sum-eq">=</span>
              <span className="sum-val">{formatCurrencyTotal(overallTotals.remittance)}</span>
            </div>

            <div className="modern-sum-hr" />

            <div className="modern-psr-block">
              <div className="psr-block-title">(PSR) Payout Shortage Replenishments</div>
              {psrSummary.list.length === 0 ? (
                <div className="modern-sum-line psr-indent-line">
                  <span className="sum-label psr-label">No Replenishments</span>
                  <span className="sum-eq">=</span>
                  <span className="sum-val">₱ 0.00</span>
                </div>
              ) : (
                psrSummary.list.map((item) => (
                  <div key={item.rotation} className="modern-sum-line psr-indent-line">
                    <span className="sum-label psr-label">{item.rotation}</span>
                    <span className="sum-eq">=</span>
                    <span className="sum-val">{formatCurrencyTotal(item.amount)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="modern-sum-hr" />

            <div className="modern-sum-line grand-total-line">
              <span className="sum-label grand-label">TOTAL REMITTANCE + PSR</span>
              <span className="sum-eq">=</span>
              <span className="sum-val grand-val">
                {formatCurrencyTotal(overallTotals.remittance + psrSummary.totalPsr)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
