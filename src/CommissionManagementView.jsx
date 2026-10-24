import React, { useState, useEffect, useMemo } from 'react'
import {
  loadCommissionSettings,
  saveCommissionSettings,
  getAgentCommissionRate,
  updateSupervisorDefaultRate,
  updateSupervisorCoordinatorRate,
  setAgentOverride,
  setAgentCoordinatorOverride,
  removeAgentOverride,
  removeAgentCoordinatorOverride,
  resetSupervisorOverrides,
} from './commissions'
import { isSupabaseConfigured, syncCommissionSettingsFromSupabase } from './supabase'
import ConfirmActionModal from './ConfirmActionModal'
import './CommissionManagementView.css'

function SvgIcon({ name, size = 16, className = '' }) {
  const icons = {
    percent: (
      <>
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
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
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7.5" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
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
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2.5" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    sparkles: (
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    ),
    calculator: (
      <>
        <rect width="16" height="20" x="4" y="2" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="16" y1="14" x2="16" y2="18" />
        <path d="M16 10h.01" />
        <path d="M12 10h.01" />
        <path d="M8 10h.01" />
        <path d="M12 14h.01" />
        <path d="M8 14h.01" />
        <path d="M12 18h.01" />
        <path d="M8 18h.01" />
      </>
    ),
    slider: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </>
    ),
    alertCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
    zap: (
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    ),
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
  }

  return (
    <svg
      className={`ui-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] || null}
    </svg>
  )
}

function formatAmount(value) {
  const num = Number(value) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CommissionManagementView({
  supervisors = [],
  currentUser = null,
  can = () => true,
  onRatesUpdated = () => {},
}) {
  const [settings, setSettings] = useState(() => loadCommissionSettings())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState('all') 
  const [editingSpvrKey, setEditingSpvrKey] = useState(null)
  const [tempSpvrRate, setTempSpvrRate] = useState('')
  const [editingSpvrCoorKey, setEditingSpvrCoorKey] = useState(null)
  const [tempSpvrCoorRate, setTempSpvrCoorRate] = useState('')
  const [feedbackToast, setFeedbackToast] = useState(null)
  const [expandedSupervisors, setExpandedSupervisors] = useState({})

  const [showCalculator, setShowCalculator] = useState(false)
  const [calcGross, setCalcGross] = useState(10000)
  const [calcSpvr, setCalcSpvr] = useState('')
  const [calcAgent, setCalcAgent] = useState('')

  const canEdit = can('edit_commissions')

  useEffect(() => {
    const initialExpanded = {}
    supervisors.forEach((s) => {
      initialExpanded[s.supervisor] = true
    })
    setExpandedSupervisors(initialExpanded)
  }, [supervisors])

  useEffect(() => {
    if (isSupabaseConfigured) {
      syncCommissionSettingsFromSupabase().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e?.detail) setSettings(e.detail)
    }
    window.addEventListener('luckybet_commissions_updated', handleUpdate)
    return () => window.removeEventListener('luckybet_commissions_updated', handleUpdate)
  }, [])

  const showToast = (message, type = 'success') => {
    setFeedbackToast({ message, type })
    setTimeout(() => {
      setFeedbackToast(null)
    }, 3500)
  }

  const handleSaveSupervisorRate = (spvrName, newRate) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    const val = parseFloat(newRate)
    if (isNaN(val) || val < 0 || val > 100) {
      showToast('Please enter a valid percentage between 0% and 100%.', 'error')
      return
    }
    const updated = updateSupervisorDefaultRate(spvrName, val, settings)
    setSettings(updated)
    setEditingSpvrKey(null)
    onRatesUpdated(updated)
    showToast(`Updated default agent commission for "${spvrName}" to ${val.toFixed(1)}%.`)
  }

  const handleSaveSupervisorCoordinatorRate = (spvrName, newRate) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    const val = parseFloat(newRate)
    if (isNaN(val) || val < 0 || val > 100) {
      showToast('Please enter a valid percentage between 0% and 100%.', 'error')
      return
    }
    const updated = updateSupervisorCoordinatorRate(spvrName, val, settings)
    setSettings(updated)
    setEditingSpvrCoorKey(null)
    onRatesUpdated(updated)
    showToast(`Updated default admin/coordinator commission for "${spvrName}" to ${val.toFixed(1)}%.`)
  }

  const handleToggleAgentOverride = (spvrName, agentKey, currentRateInfo) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    if (currentRateInfo.isOverride) {
      const updated = removeAgentOverride(spvrName, agentKey, settings)
      setSettings(updated)
      onRatesUpdated(updated)
      showToast(`Reverted agent "${agentKey}" to Supervisor Default (${currentRateInfo.supervisorDefault.toFixed(1)}%).`)
    } else {
      const updated = setAgentOverride(spvrName, agentKey, currentRateInfo.rate, settings)
      setSettings(updated)
      onRatesUpdated(updated)
      showToast(`Custom override enabled for agent "${agentKey}" at ${currentRateInfo.rate.toFixed(1)}%.`)
    }
  }

  const handleChangeAgentOverrideRate = (spvrName, agentKey, newRate) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    const val = parseFloat(newRate)
    if (isNaN(val) || val < 0 || val > 100) return
    const updated = setAgentOverride(spvrName, agentKey, val, settings)
    setSettings(updated)
    onRatesUpdated(updated)
  }

  const handleToggleCoordinatorOverride = (spvrName, agentKey, currentRateInfo) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    if (currentRateInfo.isCoordinatorOverride) {
      const updated = removeAgentCoordinatorOverride(spvrName, agentKey, settings)
      setSettings(updated)
      onRatesUpdated(updated)
      showToast(`Reverted coordinator share for agent "${agentKey}" to Supervisor Default (${currentRateInfo.supervisorCoordinatorDefault.toFixed(1)}%).`)
    } else {
      const updated = setAgentCoordinatorOverride(spvrName, agentKey, currentRateInfo.coordinatorRate, settings)
      setSettings(updated)
      onRatesUpdated(updated)
      showToast(`Custom coordinator override enabled for agent "${agentKey}" at ${currentRateInfo.coordinatorRate.toFixed(1)}%.`)
    }
  }

  const handleChangeCoordinatorOverrideRate = (spvrName, agentKey, newRate) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    const val = parseFloat(newRate)
    if (isNaN(val) || val < 0 || val > 100) return
    const updated = setAgentCoordinatorOverride(spvrName, agentKey, val, settings)
    setSettings(updated)
    onRatesUpdated(updated)
  }

  const [pendingResetSupervisor, setPendingResetSupervisor] = useState(null)
  const [isResettingSupervisor, setIsResettingSupervisor] = useState(false)

  const handleResetSupervisorOverrides = (spvrName) => {
    if (!canEdit) {
      showToast('Action Denied: You do not have permission to modify commission rates.', 'error')
      return
    }
    setPendingResetSupervisor(spvrName)
  }

  const handleConfirmResetSupervisor = async () => {
    if (!pendingResetSupervisor) return
    setIsResettingSupervisor(true)
    const updated = resetSupervisorOverrides(pendingResetSupervisor, settings)
    setSettings(updated)
    onRatesUpdated(updated)
    await saveCommissionSettings(updated)
    setIsResettingSupervisor(false)
    showToast(`All agent & coordinator overrides under "${pendingResetSupervisor}" reset to supervisor defaults.`)
    setPendingResetSupervisor(null)
  }

  const toggleSupervisorExpanded = (spvrName) => {
    setExpandedSupervisors((prev) => ({
      ...prev,
      [spvrName]: !prev[spvrName],
    }))
  }

  const stats = useMemo(() => {
    let totalAgents = 0
    let totalAgentOverrides = 0
    let totalCoorOverrides = 0
    let totalWithCoordinatorShare = 0
    const spvrCount = supervisors.length

    supervisors.forEach((s) => {
      const agts = s.agents || []
      totalAgents += agts.length
      agts.forEach((a) => {
        const rateInfo = getAgentCommissionRate(s.supervisor, a.key, settings)
        if (rateInfo.isOverride) totalAgentOverrides++
        if (rateInfo.isCoordinatorOverride) totalCoorOverrides++
        if (rateInfo.coordinatorRate > 0) totalWithCoordinatorShare++
      })
    })

    return {
      totalSupervisors: spvrCount,
      totalAgents,
      totalOverrides: totalAgentOverrides + totalCoorOverrides,
      totalAgentOverrides,
      totalCoorOverrides,
      totalWithCoordinatorShare,
      globalBaseRate: settings.globalDefaultRate || 10.0,
      globalBaseCoorRate: settings.globalCoordinatorRate || 0.0,
    }
  }, [supervisors, settings])

  const filteredSupervisors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return supervisors.filter((s) => {
      const spvrMatches = s.supervisor.toLowerCase().includes(q)
      const agentMatches = (s.agents || []).some((a) => a.teller.toLowerCase().includes(q) || a.key.toLowerCase().includes(q))

      if (q && !spvrMatches && !agentMatches) return false

      if (filterMode === 'overrides') {
        const hasOverrides = (s.agents || []).some((a) => {
          const r = getAgentCommissionRate(s.supervisor, a.key, settings)
          return r.isOverride || r.isCoordinatorOverride
        })
        return hasOverrides
      }

      if (filterMode === 'coordinators') {
        const hasCoor = (s.agents || []).some((a) => {
          const r = getAgentCommissionRate(s.supervisor, a.key, settings)
          return r.coordinatorRate > 0
        })
        return hasCoor
      }

      if (filterMode === 'defaults') {
        const hasNoOverrides = (s.agents || []).every((a) => {
          const r = getAgentCommissionRate(s.supervisor, a.key, settings)
          return !r.isOverride && !r.isCoordinatorOverride
        })
        return hasNoOverrides
      }

      return true
    })
  }, [supervisors, searchQuery, filterMode, settings])

  const presets = [8.0, 10.0, 12.0, 14.0, 15.0]
  const coordinatorPresets = [0.0, 1.0, 2.0, 2.5, 3.0, 5.0]

  return (
    <div className="commissions-dashboard-container">
      {/* Toast notification */}
      {feedbackToast && (
        <div className={`commissions-toast toast-${feedbackToast.type}`}>
          <SvgIcon name={feedbackToast.type === 'error' ? 'alertCircle' : 'check'} size={15} />
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="commissions-header-banner">
        <div className="header-banner-left">
          <div className="banner-icon-chip">
            <SvgIcon name="percent" size={24} />
          </div>
          <div>
            <div className="banner-title-row">
              <h1 className="banner-title">Commission Rates &amp; Coordinator Splits</h1>
              <span className="banner-badge">Split Engine</span>
            </div>
            <p className="banner-subtitle">
              Configure baseline commission rates and coordinator/admin shares per supervisor, or toggle custom overrides for individual agents.
              Supports commission sharing between agents and office coordinators/admins.
            </p>
          </div>
        </div>

        <div className="header-banner-right">
          {isSupabaseConfigured && (
            <div className="commissions-cloud-badge" title="Commission rates and agent overrides are saved live in Supabase Cloud">
              <span className="sync-status-dot status-connected" />
              <span>Cloud Synced Online</span>
            </div>
          )}
          <button
            type="button"
            className="action-btn-outline calculator-toggle-btn"
            onClick={async () => {
              showToast('Syncing latest commission settings from Supabase Cloud...', 'info')
              const res = await syncCommissionSettingsFromSupabase()
              if (res.success) {
                showToast('Commission rates & overrides synced from Supabase!')
              } else {
                showToast('Using local commission settings.', 'info')
              }
            }}
            title="Synchronize latest commission settings from Supabase Cloud"
          >
            <SvgIcon name="refresh" size={15} />
            <span>Sync Cloud</span>
          </button>
          <button
            type="button"
            className="action-btn-outline calculator-toggle-btn"
            onClick={() => setShowCalculator(!showCalculator)}
            title="Open real-time commission calculator simulator"
          >
            <SvgIcon name="calculator" size={16} />
            <span>{showCalculator ? 'Close Calculator' : 'Payout Calculator'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="commissions-stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap icon-primary">
            <SvgIcon name="users" size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Supervisors Configured</span>
            <strong className="stat-value">{stats.totalSupervisors}</strong>
            <span className="stat-desc">Active zone supervisors</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap icon-emerald">
            <SvgIcon name="user" size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Monitored Agents</span>
            <strong className="stat-value">{stats.totalAgents}</strong>
            <span className="stat-desc">Active terminal tellers</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap icon-amber">
            <SvgIcon name="zap" size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Custom Overrides</span>
            <strong className="stat-value stat-highlight">{stats.totalOverrides}</strong>
            <span className="stat-desc">{stats.totalAgentOverrides} Agent | {stats.totalCoorOverrides} Coor overrides</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap icon-purple">
            <SvgIcon name="percent" size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Agents with Coordinator Cut</span>
            <strong className="stat-value">{stats.totalWithCoordinatorShare}</strong>
            <span className="stat-desc">Commission split active</span>
          </div>
        </div>
      </div>

      {/* Interactive Simulator */}
      {showCalculator && (
        <div className="commission-calculator-panel">
          <div className="calculator-header">
            <div className="calc-title">
              <SvgIcon name="calculator" size={18} />
              <span>Real-Time Commission Split Simulator</span>
            </div>
            <button
              type="button"
              className="calc-close-btn"
              onClick={() => setShowCalculator(false)}
            >
              &times;
            </button>
          </div>
          <div className="calculator-body">
            <div className="calc-inputs-row">
              <div className="calc-field">
                <label>Simulated Gross Sales (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={calcGross}
                  onChange={(e) => setCalcGross(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="e.g. 10000"
                />
              </div>

              <div className="calc-field">
                <label>Select Supervisor</label>
                <select
                  value={calcSpvr}
                  onChange={(e) => {
                    setCalcSpvr(e.target.value)
                    setCalcAgent('')
                  }}
                >
                  <option value="">-- Choose Supervisor --</option>
                  {supervisors.map((s) => (
                    <option key={s.supervisor} value={s.supervisor}>
                      {s.supervisor}
                    </option>
                  ))}
                </select>
              </div>

              <div className="calc-field">
                <label>Select Agent (Optional Override)</label>
                <select
                  value={calcAgent}
                  onChange={(e) => setCalcAgent(e.target.value)}
                  disabled={!calcSpvr}
                >
                  <option value="">-- Inherit Supervisor Defaults --</option>
                  {(supervisors.find((s) => s.supervisor === calcSpvr)?.agents || []).map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.teller} ({a.key})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {calcSpvr && (
              <div className="calc-result-box">
                {(() => {
                  const rateInfo = getAgentCommissionRate(calcSpvr, calcAgent || 'UNKNOWN', settings)
                  const agentCommAmount = calcGross * (rateInfo.rate / 100)
                  const coorCommAmount = calcGross * (rateInfo.coordinatorRate / 100)
                  const totalCommAmount = agentCommAmount + coorCommAmount
                  const netRemit = calcGross - totalCommAmount

                  return (
                    <div className="calc-result-grid">
                      <div className="result-metric">
                        <span className="res-label">Gross Sales</span>
                        <strong className="res-val">₱ {formatAmount(calcGross)}</strong>
                      </div>
                      <div className="result-metric">
                        <span className="res-label">Agent Share ({rateInfo.rate.toFixed(1)}%)</span>
                        <strong className="res-val val-blue">₱ {formatAmount(agentCommAmount)}</strong>
                      </div>
                      <div className="result-metric">
                        <span className="res-label">Admin/Coor Share ({rateInfo.coordinatorRate.toFixed(1)}%)</span>
                        <strong className="res-val val-purple">₱ {formatAmount(coorCommAmount)}</strong>
                      </div>
                      <div className="result-metric">
                        <span className="res-label">Total Commission ({rateInfo.totalRate.toFixed(1)}%)</span>
                        <strong className="res-val val-emerald">₱ {formatAmount(totalCommAmount)}</strong>
                      </div>
                      <div className="result-metric">
                        <span className="res-label">Net Remittance Due</span>
                        <strong className="res-val val-dark">₱ {formatAmount(netRemit)}</strong>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="commissions-toolbar">
        <div className="search-box">
          <SvgIcon name="search" size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search by supervisor or agent name/code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>

        <div className="filter-group" role="group" aria-label="Filter rate type">
          <button
            type="button"
            className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Supervisors ({supervisors.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'overrides' ? 'active' : ''}`}
            onClick={() => setFilterMode('overrides')}
          >
            Has Overrides ({stats.totalOverrides})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'coordinators' ? 'active' : ''}`}
            onClick={() => setFilterMode('coordinators')}
          >
            Has Coordinator Split ({stats.totalWithCoordinatorShare})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'defaults' ? 'active' : ''}`}
            onClick={() => setFilterMode('defaults')}
          >
            Standard Defaults Only
          </button>
        </div>
      </div>

      {/* Supervisors Accordion List */}
      <div className="supervisors-accordion-list">
        {filteredSupervisors.length === 0 ? (
          <div className="empty-state-card">
            <SvgIcon name="search" size={32} />
            <h3>No matching supervisors or agents found</h3>
            <p>Try searching for a different name, or clear active filters.</p>
          </div>
        ) : (
          filteredSupervisors.map((spvr) => {
            const spvrKey = spvr.supervisor
            const spvrUpper = spvrKey.toUpperCase()
            const spvrConfig = settings.supervisors?.[spvrUpper]
            const currentDefaultRate = spvrConfig?.defaultRate !== undefined
              ? Number(spvrConfig.defaultRate)
              : (settings.globalDefaultRate || 10.0)

            const currentDefaultCoordinatorRate = spvrConfig?.defaultCoordinatorRate !== undefined
              ? Number(spvrConfig.defaultCoordinatorRate)
              : (settings.globalCoordinatorRate || 0.0)

            const isExpanded = Boolean(expandedSupervisors[spvrKey])
            const agentsList = spvr.agents || []
            const activeOverridesCount = agentsList.filter((a) => {
              const r = getAgentCommissionRate(spvrKey, a.key, settings)
              return r.isOverride || r.isCoordinatorOverride
            }).length

            const isEditingAgentRate = editingSpvrKey === spvrKey
            const isEditingCoorRate = editingSpvrCoorKey === spvrKey

            return (
              <div key={spvrKey} className={`supervisor-commission-card ${isExpanded ? 'is-expanded' : ''}`}>
                {/* Supervisor Header */}
                <div className="spvr-card-header">
                  <div className="spvr-info-cluster" onClick={() => toggleSupervisorExpanded(spvrKey)}>
                    <button
                      type="button"
                      className="accordion-toggle-btn"
                      aria-label="Toggle agent details"
                    >
                      <SvgIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={16} />
                    </button>
                    <div>
                      <div className="spvr-name-row">
                        <strong className="spvr-name">{spvr.supervisor}</strong>
                        <span className="spvr-agent-count-chip">
                          {agentsList.length} {agentsList.length === 1 ? 'Agent' : 'Agents'}
                        </span>
                        {activeOverridesCount > 0 && (
                          <span className="spvr-override-count-chip">
                            ⚡ {activeOverridesCount} Custom {activeOverridesCount === 1 ? 'Override' : 'Overrides'}
                          </span>
                        )}
                        {currentDefaultCoordinatorRate > 0 && (
                          <span className="spvr-coor-active-chip" title="Coordinator cut active by default">
                            👥 Coor: {currentDefaultCoordinatorRate.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="spvr-summary-metrics">
                        <span>Total Gross: <strong>₱ {formatAmount(spvr.totalGross)}</strong></span>
                        <span className="metric-dot">&bull;</span>
                        <span>Total Hits: <strong>₱ {formatAmount(spvr.totalHits)}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Rate Controls Cluster */}
                  <div className="spvr-rate-control-cluster">
                    {/* Default Agent Commission Rate */}
                    <div className="spvr-default-rate-badge">
                      <span className="rate-badge-label">Agent Rate:</span>
                      {isEditingAgentRate ? (
                        <div className="inline-rate-edit-wrap">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            className="inline-rate-input"
                            value={tempSpvrRate}
                            onChange={(e) => setTempSpvrRate(e.target.value)}
                            autoFocus
                          />
                          <span className="input-pct">%</span>
                          <button
                            type="button"
                            className="inline-save-btn"
                            onClick={() => handleSaveSupervisorRate(spvrKey, tempSpvrRate)}
                            title="Save rate"
                          >
                            <SvgIcon name="check" size={13} />
                          </button>
                          <button
                            type="button"
                            className="inline-cancel-btn"
                            onClick={() => setEditingSpvrKey(null)}
                            title="Cancel"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <div className="rate-display-cluster">
                          <strong className="rate-value-display">{currentDefaultRate.toFixed(1)}%</strong>
                          {canEdit && (
                            <button
                              type="button"
                              className="edit-rate-trigger-btn"
                              onClick={() => {
                                setEditingSpvrKey(spvrKey)
                                setTempSpvrRate(currentDefaultRate.toString())
                              }}
                              title="Edit supervisor default agent commission"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}

                      {canEdit && !isEditingAgentRate && (
                        <div className="rate-presets-row">
                          {presets.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`preset-chip ${Math.abs(currentDefaultRate - p) < 0.01 ? 'active' : ''}`}
                              onClick={() => handleSaveSupervisorRate(spvrKey, p)}
                              title={`Set agent commission to ${p}%`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Default Admin / Coordinator Commission Rate */}
                    <div className="spvr-default-rate-badge spvr-coor-rate-badge">
                      <span className="rate-badge-label">Admin/Coor Rate:</span>
                      {isEditingCoorRate ? (
                        <div className="inline-rate-edit-wrap">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            className="inline-rate-input"
                            value={tempSpvrCoorRate}
                            onChange={(e) => setTempSpvrCoorRate(e.target.value)}
                            autoFocus
                          />
                          <span className="input-pct">%</span>
                          <button
                            type="button"
                            className="inline-save-btn"
                            onClick={() => handleSaveSupervisorCoordinatorRate(spvrKey, tempSpvrCoorRate)}
                            title="Save coordinator rate"
                          >
                            <SvgIcon name="check" size={13} />
                          </button>
                          <button
                            type="button"
                            className="inline-cancel-btn"
                            onClick={() => setEditingSpvrCoorKey(null)}
                            title="Cancel"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <div className="rate-display-cluster">
                          <strong className="rate-value-display val-purple">{currentDefaultCoordinatorRate.toFixed(1)}%</strong>
                          {canEdit && (
                            <button
                              type="button"
                              className="edit-rate-trigger-btn"
                              onClick={() => {
                                setEditingSpvrCoorKey(spvrKey)
                                setTempSpvrCoorRate(currentDefaultCoordinatorRate.toString())
                              }}
                              title="Edit supervisor default coordinator commission"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}

                      {canEdit && !isEditingCoorRate && (
                        <div className="rate-presets-row">
                          {coordinatorPresets.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`preset-chip preset-chip-coor ${Math.abs(currentDefaultCoordinatorRate - p) < 0.01 ? 'active' : ''}`}
                              onClick={() => handleSaveSupervisorCoordinatorRate(spvrKey, p)}
                              title={`Set coordinator commission to ${p}%`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {activeOverridesCount > 0 && canEdit && (
                      <button
                        type="button"
                        className="reset-spvr-overrides-btn"
                        onClick={() => handleResetSupervisorOverrides(spvrKey)}
                        title="Revert all agents and coordinator rates under this supervisor to defaults"
                      >
                        Reset All Overrides
                      </button>
                    )}
                  </div>
                </div>

                {/* Agents Table */}
                {isExpanded && (
                  <div className="spvr-agents-table-wrap">
                    <table className="spvr-agents-table">
                      <thead>
                        <tr>
                          <th className="col-agent">Agent / Terminal Staff</th>
                          <th className="col-agent-rate">Agent Commission Rate</th>
                          <th className="col-coor-rate">Admin / Coordinator Rate</th>
                          <th className="col-live-gross">Today's Gross Sales</th>
                          <th className="col-live-breakdown">Commission Split Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentsList.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="table-empty-cell">
                              No agents recorded under this supervisor for the selected date.
                            </td>
                          </tr>
                        ) : (
                          agentsList.map((agent) => {
                            const rateInfo = getAgentCommissionRate(spvrKey, agent.key, settings)
                            const agentGross = agent.totalGross || 0
                            const agentComm = agentGross * (rateInfo.rate / 100)
                            const coorComm = agentGross * (rateInfo.coordinatorRate / 100)
                            const totalComm = agentComm + coorComm

                            return (
                              <tr
                                key={agent.key}
                                className={`agent-rate-row ${(rateInfo.isOverride || rateInfo.isCoordinatorOverride) ? 'has-override-row' : ''}`}
                              >
                                <td className="col-agent">
                                  <div className="agent-name-cell">
                                    <strong className="agent-display-name">{agent.teller}</strong>
                                    <span className="agent-key-tag">Code: <code>{agent.key}</code></span>
                                  </div>
                                </td>

                                {/* Agent Commission Column (Pill + iOS Toggle + Custom Input) */}
                                <td className="col-agent-rate">
                                  <div className="rate-column-cell-content">
                                    <div className="effective-rate-pill-wrap">
                                      <span className={`effective-rate-pill ${rateInfo.isOverride ? 'pill-override' : 'pill-inherited'}`}>
                                        {rateInfo.rate.toFixed(1)}%
                                      </span>
                                      <small className="rate-origin-hint">
                                        {rateInfo.isOverride ? `⚡ Custom Override` : `Inherited (${rateInfo.supervisorDefault.toFixed(1)}%)`}
                                      </small>
                                    </div>

                                    <div className="rate-toggle-input-row">
                                      <label
                                        className={`ios-switch-cell ${rateInfo.isOverride ? 'is-granted' : 'is-denied'}`}
                                        title={
                                          canEdit
                                            ? (rateInfo.isOverride
                                              ? `Click to remove override and revert to Supervisor Default (${rateInfo.supervisorDefault.toFixed(1)}%)`
                                              : `Click to set a custom commission override for ${agent.teller}`)
                                            : 'Permission denied'
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          className="ios-switch-input"
                                          checked={rateInfo.isOverride}
                                          disabled={!canEdit}
                                          onChange={() => handleToggleAgentOverride(spvrKey, agent.key, rateInfo)}
                                        />
                                        <span className="ios-switch-control">
                                          <span className="ios-switch-track">
                                            <span className="ios-switch-thumb" />
                                          </span>
                                          <span className="ios-switch-state-text">
                                            {rateInfo.isOverride ? 'CUSTOM' : 'DEFAULT'}
                                          </span>
                                        </span>
                                      </label>

                                      {rateInfo.isOverride && (
                                        <div className="custom-override-input-wrap">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.5"
                                            className="override-number-input"
                                            value={rateInfo.rate}
                                            disabled={!canEdit}
                                            onChange={(e) =>
                                              handleChangeAgentOverrideRate(spvrKey, agent.key, e.target.value)
                                            }
                                          />
                                          <span className="input-pct-label">%</span>
                                          {canEdit && (
                                            <button
                                              type="button"
                                              className="revert-override-btn"
                                              onClick={() => removeAgentOverride(spvrKey, agent.key, settings)}
                                              title="Revert to Supervisor Default"
                                            >
                                              Revert
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Admin / Coordinator Commission Column (Pill + iOS Toggle + Custom Input) */}
                                <td className="col-coor-rate">
                                  <div className="rate-column-cell-content">
                                    <div className="effective-rate-pill-wrap">
                                      <span className={`effective-rate-pill ${rateInfo.isCoordinatorOverride ? 'pill-override-coor' : (rateInfo.coordinatorRate > 0 ? 'pill-coor-active' : 'pill-inherited')}`}>
                                        {rateInfo.coordinatorRate.toFixed(1)}%
                                      </span>
                                      <small className="rate-origin-hint">
                                        {rateInfo.isCoordinatorOverride
                                          ? `⚡ Custom Override`
                                          : `Inherited (${rateInfo.supervisorCoordinatorDefault.toFixed(1)}%)`}
                                      </small>
                                    </div>

                                    <div className="rate-toggle-input-row">
                                      <label
                                        className={`ios-switch-cell ${rateInfo.isCoordinatorOverride ? 'is-granted-coor' : 'is-denied'}`}
                                        title={
                                          canEdit
                                            ? (rateInfo.isCoordinatorOverride
                                              ? `Click to revert coordinator share to Supervisor Default (${rateInfo.supervisorCoordinatorDefault.toFixed(1)}%)`
                                              : `Click to set a custom coordinator cut for ${agent.teller}`)
                                            : 'Permission denied'
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          className="ios-switch-input"
                                          checked={rateInfo.isCoordinatorOverride}
                                          disabled={!canEdit}
                                          onChange={() => handleToggleCoordinatorOverride(spvrKey, agent.key, rateInfo)}
                                        />
                                        <span className="ios-switch-control">
                                          <span className="ios-switch-track">
                                            <span className="ios-switch-thumb" />
                                          </span>
                                          <span className="ios-switch-state-text">
                                            {rateInfo.isCoordinatorOverride ? 'CUSTOM' : 'DEFAULT'}
                                          </span>
                                        </span>
                                      </label>

                                      {rateInfo.isCoordinatorOverride && (
                                        <div className="custom-override-input-wrap custom-override-coor-wrap">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.5"
                                            className="override-number-input override-coor-input"
                                            value={rateInfo.coordinatorRate}
                                            disabled={!canEdit}
                                            onChange={(e) =>
                                              handleChangeCoordinatorOverrideRate(spvrKey, agent.key, e.target.value)
                                            }
                                          />
                                          <span className="input-pct-label coor-pct">%</span>
                                          {canEdit && (
                                            <button
                                              type="button"
                                              className="revert-override-btn"
                                              onClick={() => removeAgentCoordinatorOverride(spvrKey, agent.key, settings)}
                                              title="Revert to Supervisor Default"
                                            >
                                              Revert
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td className="col-live-gross">
                                  <span className="amount-num">₱ {formatAmount(agentGross)}</span>
                                </td>

                                <td className="col-live-breakdown">
                                  <div className="comm-breakdown-cluster">
                                    <div className="comm-breakdown-row">
                                      <span className="comm-share-label">Agent ({rateInfo.rate.toFixed(1)}%):</span>
                                      <strong className="comm-share-val val-blue">₱ {formatAmount(agentComm)}</strong>
                                    </div>
                                    {rateInfo.coordinatorRate > 0 && (
                                      <div className="comm-breakdown-row">
                                        <span className="comm-share-label">Admin/Coor ({rateInfo.coordinatorRate.toFixed(1)}%):</span>
                                        <strong className="comm-share-val val-purple">₱ {formatAmount(coorComm)}</strong>
                                      </div>
                                    )}
                                    <div className="comm-breakdown-row comm-breakdown-total">
                                      <span className="comm-share-label">Total Comm ({rateInfo.totalRate.toFixed(1)}%):</span>
                                      <strong className="comm-share-val val-emerald">₱ {formatAmount(totalComm)}</strong>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmActionModal
        isOpen={Boolean(pendingResetSupervisor)}
        title="Reset Agent & Coordinator Overrides?"
        message={`Are you sure you want to reset all custom agent and coordinator commission overrides under supervisor "${pendingResetSupervisor}" back to default rates?`}
        details={
          <div>
            <div className="confirm-detail-row">
              <span className="confirm-detail-label">Supervisor</span>
              <span className="confirm-detail-value">{pendingResetSupervisor}</span>
            </div>
          </div>
        }
        confirmText="Yes, Reset Overrides"
        cancelText="Cancel"
        confirmVariant="warning"
        isProcessing={isResettingSupervisor}
        processingText="Resetting Overrides..."
        onConfirm={handleConfirmResetSupervisor}
        onCancel={() => setPendingResetSupervisor(null)}
      />
    </div>
  )
}
