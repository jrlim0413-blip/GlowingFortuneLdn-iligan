import { saveSupabaseCommissionSettings } from './supabase.js'

export const DEFAULT_COMMISSION_CONFIG = {
  globalDefaultRate: 10.0,
  supervisors: {},
}

let inMemoryCommissionConfig = { ...DEFAULT_COMMISSION_CONFIG }

export function setInMemoryCommissionSettings(settings) {
  if (!settings || typeof settings !== 'object') return
  inMemoryCommissionConfig = {
    globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
    supervisors: settings.supervisors && typeof settings.supervisors === 'object' ? settings.supervisors : {},
  }
}

export function loadCommissionSettings() {
  return {
    globalDefaultRate: Number(inMemoryCommissionConfig.globalDefaultRate) || 10.0,
    supervisors: inMemoryCommissionConfig.supervisors ? { ...inMemoryCommissionConfig.supervisors } : {},
  }
}

export function saveCommissionSettings(settings) {
  try {
    const payload = {
      globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
      supervisors: settings.supervisors || {},
      updatedAt: new Date().toISOString(),
    }
    inMemoryCommissionConfig = {
      globalDefaultRate: payload.globalDefaultRate,
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
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()

  const spvrConfig = currentSettings.supervisors?.[spvrKey]
  const spvrDefault = spvrConfig && spvrConfig.defaultRate !== undefined && spvrConfig.defaultRate !== null
    ? Number(spvrConfig.defaultRate)
    : globalDefault

  if (spvrConfig?.agentOverrides && spvrConfig.agentOverrides[agtKey] !== undefined && spvrConfig.agentOverrides[agtKey] !== null) {
    const overrideRate = Number(spvrConfig.agentOverrides[agtKey])
    if (!isNaN(overrideRate) && overrideRate >= 0) {
      return {
        rate: overrideRate,
        isOverride: true,
        supervisorDefault: spvrDefault,
        globalDefault,
      }
    }
  }

  return {
    rate: spvrDefault,
    isOverride: false,
    supervisorDefault: spvrDefault,
    globalDefault,
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
      agentOverrides: {},
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

export function setAgentOverride(supervisorName, agentKey, overrideRate, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()
  const agtKey = String(agentKey || '').trim().toUpperCase()
  const rateNum = Math.max(0, Math.min(100, Number(overrideRate) || 0))

  if (!settings.supervisors) settings.supervisors = {}
  if (!settings.supervisors[spvrKey]) {
    settings.supervisors[spvrKey] = {
      defaultRate: settings.globalDefaultRate || 10.0,
      agentOverrides: { [agtKey]: rateNum },
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

export const updateAgentOverrideRate = setAgentOverride

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

export function resetSupervisorOverrides(supervisorName, currentSettings = null) {
  const settings = currentSettings ? { ...currentSettings } : loadCommissionSettings()
  const spvrKey = String(supervisorName || '').trim().toUpperCase()

  if (settings.supervisors?.[spvrKey]) {
    settings.supervisors[spvrKey] = {
      ...settings.supervisors[spvrKey],
      agentOverrides: {},
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
      commission: 0,
      remittanceDue: 0,
      isOverride: false,
    }
  }

  const { rate, isOverride } = getAgentCommissionRate(supervisorName, agentKey, settings)
  const commission = (gross * rate) / 100
  const remittanceDue = gross - commission

  return {
    rate,
    commission,
    remittanceDue,
    isOverride,
  }
}
