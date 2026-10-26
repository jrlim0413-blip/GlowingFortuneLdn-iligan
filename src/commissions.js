import { saveSupabaseCommissionSettings } from './supabase.js'

export const DEFAULT_COMMISSION_CONFIG = {
  globalDefaultRate: 10.0,
  globalCoordinatorRate: 0.0,
  globalCoordinatorMode: 'per_agent', // 'per_agent' (Option 1: row COMM) | 'consolidated' (Option 2: summary box deduction)
  supervisors: {},
}

let inMemoryCommissionConfig = { ...DEFAULT_COMMISSION_CONFIG }

export function setInMemoryCommissionSettings(settings) {
  if (!settings || typeof settings !== 'object') return
  inMemoryCommissionConfig = {
    globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
    globalCoordinatorRate: Number(settings.globalCoordinatorRate) || 0.0,
    globalCoordinatorMode: settings.globalCoordinatorMode === 'consolidated' ? 'consolidated' : 'per_agent',
    supervisors: settings.supervisors && typeof settings.supervisors === 'object' ? settings.supervisors : {},
  }
}

export function loadCommissionSettings() {
  return {
    globalDefaultRate: Number(inMemoryCommissionConfig.globalDefaultRate) || 10.0,
    globalCoordinatorRate: Number(inMemoryCommissionConfig.globalCoordinatorRate) || 0.0,
    globalCoordinatorMode: inMemoryCommissionConfig.globalCoordinatorMode === 'consolidated' ? 'consolidated' : 'per_agent',
    supervisors: inMemoryCommissionConfig.supervisors ? { ...inMemoryCommissionConfig.supervisors } : {},
  }
}

export function saveCommissionSettings(settings) {
  try {
    const payload = {
      globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
      globalCoordinatorRate: Number(settings.globalCoordinatorRate) || 0.0,
      globalCoordinatorMode: settings.globalCoordinatorMode === 'consolidated' ? 'consolidated' : 'per_agent',
      supervisors: settings.supervisors || {},
      updatedAt: new Date().toISOString(),
    }
    inMemoryCommissionConfig = {
      globalDefaultRate: payload.globalDefaultRate,
      globalCoordinatorRate: payload.globalCoordinatorRate,
      globalCoordinatorMode: payload.globalCoordinatorMode,
      supervisors: payload.supervisors,
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('luckybet_commissions_updated', { detail: payload }))
    }

    saveSupabaseCommissionSettings(payload).catch((err) => {
      console.warn('Supabase cloud commission settings sync failed:', err)
    })

    return true
  } catch (err) {
    console.error('Failed to save commission settings:', err)
    return false
  }
}

export function getAgentCommissionRate(supervisorName, agentKey, settings = null) {
  const currentSettings = settings || loadCommissionSettings()
  const globalDefault = Number(currentSettings.globalDefaultRate) || 10.0
  const globalCoordinatorDefault = Number(currentSettings.globalCoordinatorRate) || 0.0
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()

  const spvrConfig = currentSettings.supervisors?.[spvrKey]
  const spvrDefault = spvrConfig && spvrConfig.defaultRate !== undefined && spvrConfig.defaultRate !== null
    ? Number(spvrConfig.defaultRate)
    : globalDefault

  const spvrCoordinatorDefault = spvrConfig && spvrConfig.defaultCoordinatorRate !== undefined && spvrConfig.defaultCoordinatorRate !== null
    ? Number(spvrConfig.defaultCoordinatorRate)
    : globalCoordinatorDefault

  // Agent Commission Rate override
  let rate = spvrDefault
  let isOverride = false
  if (spvrConfig?.agentOverrides && spvrConfig.agentOverrides[agtKey] !== undefined && spvrConfig.agentOverrides[agtKey] !== null) {
    const overrideRate = Number(spvrConfig.agentOverrides[agtKey])
    if (!isNaN(overrideRate) && overrideRate >= 0) {
      rate = overrideRate
      isOverride = true
    }
  }

  // Coordinator / Admin Commission Rate override
  let coordinatorRate = spvrCoordinatorDefault
  let isCoordinatorOverride = false
  if (spvrConfig?.coordinatorOverrides && spvrConfig.coordinatorOverrides[agtKey] !== undefined && spvrConfig.coordinatorOverrides[agtKey] !== null) {
    const overrideCoord = Number(spvrConfig.coordinatorOverrides[agtKey])
    if (!isNaN(overrideCoord) && overrideCoord >= 0) {
      coordinatorRate = overrideCoord
      isCoordinatorOverride = true
    }
  }

  const totalRate = rate + coordinatorRate

  return {
    rate,
    isOverride,
    coordinatorRate,
    isCoordinatorOverride,
    supervisorDefault: spvrDefault,
    supervisorCoordinatorDefault: spvrCoordinatorDefault,
    globalDefault,
    globalCoordinatorDefault,
    totalRate,
  }
}

export function updateSupervisorDefaultRate(supervisorName, newRate, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const rateNum = Math.max(0, Math.min(100, Number(newRate) || 0))

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: rateNum,
      defaultCoordinatorRate: 0.0,
      agentOverrides: {},
      coordinatorOverrides: {},
    }
  } else {
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      defaultRate: rateNum,
    }
  }

  saveCommissionSettings(settings)
  return settings
}

export function updateSupervisorCoordinatorRate(supervisorName, newRate, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const rateNum = Math.max(0, Math.min(100, Number(newRate) || 0))

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: settings.globalDefaultRate || 10.0,
      defaultCoordinatorRate: rateNum,
      agentOverrides: {},
      coordinatorOverrides: {},
    }
  } else {
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      defaultCoordinatorRate: rateNum,
    }
  }

  saveCommissionSettings(settings)
  return settings
}

export function getSupervisorCoordinatorMode(supervisorName, settings = null) {
  const currentSettings = settings || loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const spvrConfig = currentSettings.supervisors?.[spvrKey]
  if (spvrConfig?.coordinatorMode && spvrConfig.coordinatorMode !== 'default') {
    return spvrConfig.coordinatorMode
  }
  return currentSettings.globalCoordinatorMode || 'per_agent'
}

export function updateGlobalCoordinatorMode(newMode, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  settings.globalCoordinatorMode = newMode === 'consolidated' ? 'consolidated' : 'per_agent'
  saveCommissionSettings(settings)
  return settings
}

export function updateSupervisorCoordinatorMode(supervisorName, newMode, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const validMode = (newMode === 'consolidated' || newMode === 'per_agent') ? newMode : undefined

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: settings.globalDefaultRate || 10.0,
      defaultCoordinatorRate: settings.globalCoordinatorRate || 0.0,
      coordinatorMode: validMode,
      agentOverrides: {},
      coordinatorOverrides: {},
    }
  } else {
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      coordinatorMode: validMode,
    }
  }

  saveCommissionSettings(settings)
  return settings
}

export function setAgentOverride(supervisorName, agentKey, overrideRate, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()
  const rateNum = Math.max(0, Math.min(100, Number(overrideRate) || 0))

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: settings.globalDefaultRate || 10.0,
      defaultCoordinatorRate: settings.globalCoordinatorRate || 0.0,
      agentOverrides: { [agtKey]: rateNum },
      coordinatorOverrides: {},
    }
  } else {
    const existingOverrides = settings.supervisors[spvrKey].agentOverrides || {}
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      agentOverrides: {
        ...existingOverrides,
        [agtKey]: rateNum,
      },
    }
  }

  saveCommissionSettings(settings)
  return settings
}

export function setAgentCoordinatorOverride(supervisorName, agentKey, overrideRate, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()
  const rateNum = Math.max(0, Math.min(100, Number(overrideRate) || 0))

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: settings.globalDefaultRate || 10.0,
      defaultCoordinatorRate: settings.globalCoordinatorRate || 0.0,
      agentOverrides: {},
      coordinatorOverrides: { [agtKey]: rateNum },
    }
  } else {
    const existingOverrides = settings.supervisors[spvrKey].coordinatorOverrides || {}
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      coordinatorOverrides: {
        ...existingOverrides,
        [agtKey]: rateNum,
      },
    }
  }

  saveCommissionSettings(settings)
  return settings
}

export const updateAgentOverrideRate = setAgentOverride
export const updateAgentCoordinatorOverrideRate = setAgentCoordinatorOverride

export function removeAgentOverride(supervisorName, agentKey, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()

  if (settings.supervisors?.[spvrKey]?.agentOverrides) {
    const updatedOverrides = { ...settings.supervisors[spvrKey].agentOverrides }
    delete updatedOverrides[agtKey]
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      agentOverrides: updatedOverrides,
    }
    saveCommissionSettings(settings)
  }

  return settings
}

export function removeAgentCoordinatorOverride(supervisorName, agentKey, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()

  if (settings.supervisors?.[spvrKey]?.coordinatorOverrides) {
    const updatedOverrides = { ...settings.supervisors[spvrKey].coordinatorOverrides }
    delete updatedOverrides[agtKey]
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      coordinatorOverrides: updatedOverrides,
    }
    saveCommissionSettings(settings)
  }

  return settings
}

export function resetSupervisorOverrides(supervisorName, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()

  if (settings.supervisors?.[spvrKey]) {
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      agentOverrides: {},
      coordinatorOverrides: {},
    }
    saveCommissionSettings(settings)
  }

  return settings
}

export function calculateCommissionDeduction(supervisorName, agentKey, grossAmount, settings = null) {
  const gross = Number(grossAmount) || 0
  if (gross <= 0) {
    return {
      rate: 0,
      coordinatorRate: 0,
      totalRate: 0,
      commission: 0,
      coordinatorCommission: 0,
      totalCommission: 0,
      remittanceDue: 0,
      isOverride: false,
      isCoordinatorOverride: false,
    }
  }

  const rateInfo = getAgentCommissionRate(supervisorName, agentKey, settings)
  const commission = (gross * rateInfo.rate) / 100
  const coordinatorCommission = (gross * rateInfo.coordinatorRate) / 100
  const totalCommission = commission + coordinatorCommission
  const remittanceDue = gross - totalCommission

  return {
    rate: rateInfo.rate,
    coordinatorRate: rateInfo.coordinatorRate,
    totalRate: rateInfo.totalRate,
    commission,
    coordinatorCommission,
    totalCommission,
    remittanceDue,
    isOverride: rateInfo.isOverride,
    isCoordinatorOverride: rateInfo.isCoordinatorOverride,
  }
}

