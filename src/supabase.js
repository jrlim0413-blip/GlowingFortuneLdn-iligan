import { createClient } from '@supabase/supabase-js'
import { setInMemoryRoles, setInMemoryUserPerms, setInMemoryUsers } from './rbac.js'
import { setInMemoryCommissionSettings } from './commissions.js'

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

const DEFAULT_SUPABASE_URL = 'https://snemagtefsfuagzdhzmq.supabase.co'
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZW1hZ3RlZnNmdWFnemRoem1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDg4NjgsImV4cCI6MjEwNzM4NDg2OH0.Pym6MwNdX9vMDk-zbOGqCqfCjYUZqxMl9kpkwQfTo_A'

let rawUrl = (env.VITE_SUPABASE_URL || '').trim()
let rawKey = (env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!rawUrl || rawUrl.includes('ejtsskrbkaqfdcouwvzh') || !rawKey || rawKey.includes('whKp_OjW')) {
  rawUrl = DEFAULT_SUPABASE_URL
  rawKey = DEFAULT_SUPABASE_KEY
}

const supabaseUrl = rawUrl
const supabaseAnonKey = rawKey

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null

export const RBAC_TABLE_NAME = 'rbac_users'

export function formatSupabaseEmail(identifier) {
  const clean = String(identifier || '').trim().toLowerCase()
  if (clean.includes('@')) return clean
  return `${clean}@luckybetplay.ph`
}

export async function verifyCredentialsInSupabaseTable(username, password) {
  if (!supabase) {
    return { success: false, error: 'Supabase client is not configured' }
  }

  const cleanUser = String(username || '').trim().toLowerCase()
  const cleanPass = String(password || '').trim()

  if (cleanUser.startsWith('__')) {
    return {
      success: false,
      notFound: true,
      error: 'Invalid username credentials.',
    }
  }

  try {
    const { data, error } = await supabase
      .from(RBAC_TABLE_NAME)
      .select('*')
      .ilike('username', cleanUser)
      .limit(1)

    if (error) {
      const isMissingTable =
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        (error.message && error.message.includes('not find the table'))
      return {
        success: false,
        tableMissing: isMissingTable,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        notFound: true,
        error: `Account "${username}" is not registered in the authorized credentials directory.`,
      }
    }

    const account = data[0]

    if (account.status === 'suspended' || account.status === 'inactive' || account.status === 'system') {
      return {
        success: false,
        inactive: true,
        error: `Access Denied: The account "${account.username}" is currently deactivated. Please contact your system administrator.`,
      }
    }

    if (account.password !== cleanPass) {
      return {
        success: false,
        wrongPassword: true,
        error: 'Invalid password. Please verify your credentials and try again.',
      }
    }

    supabase
      .from(RBAC_TABLE_NAME)
      .update({ last_login: new Date().toISOString() })
      .eq('id', account.id)
      .then(() => void 0)
      .catch(() => void 0)

    return {
      success: true,
      account: {
        id: account.id,
        username: account.username,
        name: account.name,
        role: account.role,
        roleLabel: account.role_label || account.roleLabel,
        branch: account.branch,
        status: account.status,
        avatar: account.avatar || account.name.substring(0, 2).toUpperCase(),
        email: account.email,
        createdAt: account.created_at,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Error connecting to dedicated database table.',
    }
  }
}

export const MATRIX_CONFIG_ID = 'matrix_config'
export const MATRIX_CONFIG_SYS_ID = '__sys_matrix_config__'
export const MATRIX_REALTIME_CHANNEL = 'rbac-matrix-realtime'

let realtimeChannelInstance = null

export async function getSupabaseMatrixConfig() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'get_matrix')
      const res = await fetch(u)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.config) return { success: true, config: json.config }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const { data: tableData, error: tableErr } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', MATRIX_CONFIG_ID)
      .maybeSingle()

    if (!tableErr && tableData?.config) {
      return { success: true, config: tableData.config, source: 'rbac_matrix_config' }
    }

    const { data: userData, error: userErr } = await supabase
      .from(RBAC_TABLE_NAME)
      .select('email')
      .eq('id', MATRIX_CONFIG_SYS_ID)
      .maybeSingle()

    if (!userErr && userData?.email) {
      try {
        const parsed = JSON.parse(userData.email)
        return { success: true, config: parsed, source: 'rbac_users_fallback' }
      } catch (parseErr) {
        console.warn('Failed to parse matrix config from fallback email payload:', parseErr)
      }
    }

    return { success: false, error: userErr?.message || tableErr?.message || 'No cloud matrix found' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function saveSupabaseMatrixConfig(config) {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'save_matrix')
      const pRes = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (pRes.ok) {
        if (realtimeChannelInstance) {
          realtimeChannelInstance.send({
            type: 'broadcast',
            event: 'matrix_updated',
            payload: { timestamp: Date.now() },
          }).catch(() => void 0)
        }
        return { success: true, source: 'proxy' }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const payload = {
      roles: config.roles || {},
      userPerms: config.userPerms || {},
      updatedAt: new Date().toISOString(),
    }

    let savedToTable = false

    try {
      const { error: tableErr } = await supabase
        .from('rbac_matrix_config')
        .upsert({
          id: MATRIX_CONFIG_ID,
          config: payload,
          updated_at: new Date().toISOString(),
        })
      if (!tableErr) savedToTable = true
    } catch (err) { void err }

    let userErr = null
    if (!savedToTable) {
      const sysRow = {
        id: MATRIX_CONFIG_SYS_ID,
        username: MATRIX_CONFIG_SYS_ID,
        password: 'sys_protected_config_row',
        name: 'RBAC Permission Matrix System Config',
        role: 'system',
        role_label: 'System Config',
        branch: 'System',
        status: 'system',
        avatar: 'MX',
        email: JSON.stringify(payload),
      }

      const res = await supabase
        .from(RBAC_TABLE_NAME)
        .upsert(sysRow, { onConflict: 'username' })
      userErr = res.error
    }

    try {
      if (realtimeChannelInstance) {
        realtimeChannelInstance.send({
          type: 'broadcast',
          event: 'matrix_updated',
          payload: { timestamp: Date.now() },
        })
      }
    } catch (err) { void err }

    if (savedToTable || !userErr) {
      return { success: true, source: savedToTable ? 'rbac_matrix_config' : 'rbac_users_fallback' }
    }

    return { success: false, error: userErr?.message }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function syncMatrixPermissionsFromSupabase() {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }
  try {
    const res = await getSupabaseMatrixConfig()
    if (res.success && res.config) {
      const { roles, userPerms } = res.config
      let changed = false

      if (roles && typeof roles === 'object') {
        setInMemoryRoles(roles)
        changed = true
      }

      if (userPerms && typeof userPerms === 'object') {
        setInMemoryUserPerms(userPerms)
        changed = true
      }

      if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('luckybet_rbac_change', {
            detail: { roles, userPerms, source: 'supabase_sync' },
          })
        )
      }

      return { success: true, config: res.config, changed }
    }
    return { success: false, error: res.error }
  } catch (err) {
    console.warn('Syncing matrix permissions from Supabase failed:', err)
    return { success: false, error: err.message }
  }
}

export const COMMISSIONS_CONFIG_ID = 'commissions_config'
export const COMMISSIONS_CONFIG_SYS_ID = '__sys_commissions_config__'

export async function getSupabaseCommissionSettings() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'get_commissions')
      const res = await fetch(u)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.settings) return { success: true, settings: json.settings }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const { data: tableData, error: tableErr } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', COMMISSIONS_CONFIG_ID)
      .maybeSingle()

    if (!tableErr && tableData?.config) {
      return { success: true, settings: tableData.config, source: 'rbac_matrix_config' }
    }

    const { data: userData, error: userErr } = await supabase
      .from(RBAC_TABLE_NAME)
      .select('email')
      .eq('id', COMMISSIONS_CONFIG_SYS_ID)
      .maybeSingle()

    if (!userErr && userData?.email) {
      try {
        const parsed = JSON.parse(userData.email)
        return { success: true, settings: parsed, source: 'rbac_users_fallback' }
      } catch (parseErr) {
        console.warn('Failed to parse commission settings from fallback payload:', parseErr)
      }
    }

    return { success: false, error: userErr?.message || tableErr?.message || 'No cloud commission settings found' }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function saveSupabaseCommissionSettings(settings) {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'save_commissions')
      const pRes = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (pRes.ok) {
        if (realtimeChannelInstance) {
          realtimeChannelInstance.send({
            type: 'broadcast',
            event: 'commissions_updated',
            payload: { timestamp: Date.now() },
          }).catch(() => void 0)
        }
        return { success: true, source: 'proxy' }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const payload = {
      globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
      supervisors: settings.supervisors || {},
      updatedAt: new Date().toISOString(),
    }

    let savedToTable = false

    try {
      const { error: tableErr } = await supabase
        .from('rbac_matrix_config')
        .upsert({
          id: COMMISSIONS_CONFIG_ID,
          config: payload,
          updated_at: new Date().toISOString(),
        })
      if (!tableErr) savedToTable = true
    } catch (err) { void err }

    let userErr = null
    if (!savedToTable) {
      const sysRow = {
        id: COMMISSIONS_CONFIG_SYS_ID,
        username: COMMISSIONS_CONFIG_SYS_ID,
        password: 'sys_protected_config_row',
        name: 'Agent Commission Settings System Config',
        role: 'system',
        role_label: 'System Config',
        branch: 'System',
        status: 'system',
        avatar: 'CM',
        email: JSON.stringify(payload),
      }

      const res = await supabase
        .from(RBAC_TABLE_NAME)
        .upsert(sysRow, { onConflict: 'username' })
      userErr = res.error
    }

    try {
      if (realtimeChannelInstance) {
        realtimeChannelInstance.send({
          type: 'broadcast',
          event: 'commissions_updated',
          payload: { timestamp: Date.now() },
        })
      }
    } catch (err) { void err }

    if (savedToTable || !userErr) {
      return { success: true, source: savedToTable ? 'rbac_matrix_config' : 'rbac_users_fallback' }
    }

    return { success: false, error: userErr?.message }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function syncCommissionSettingsFromSupabase() {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }
  try {
    const res = await getSupabaseCommissionSettings()
    if (res.success && res.settings) {
      setInMemoryCommissionSettings(res.settings)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('luckybet_commissions_updated', {
            detail: res.settings,
            source: 'supabase_sync',
          })
        )
      }

      return { success: true, settings: res.settings, changed: true }
    }
    return { success: false, error: res.error }
  } catch (err) {
    console.warn('Syncing commission settings from Supabase failed:', err)
    return { success: false, error: err.message }
  }
}

const matrixListeners = new Set()
let matrixChannel = null

function ensureMatrixChannel() {
  if (!supabase) return null
  if (matrixChannel) return matrixChannel

  try {
    const channel = supabase.channel(MATRIX_REALTIME_CHANNEL)
    channel
      .on('broadcast', { event: 'matrix_updated' }, () => {
        matrixListeners.forEach((fn) => {
          try { fn() } catch (err) { void err }
        })
      })
      .on('broadcast', { event: 'commissions_updated' }, () => {
        syncCommissionSettingsFromSupabase().catch(() => void 0)
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rbac_matrix_config' },
        (payload) => {
          if (payload?.new?.id === COMMISSIONS_CONFIG_ID) {
            syncCommissionSettingsFromSupabase().catch(() => void 0)
          } else {
            matrixListeners.forEach((fn) => {
              try { fn() } catch (err) { void err }
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: RBAC_TABLE_NAME },
        (payload) => {
          const rowId = payload?.new?.id || payload?.old?.id
          if (rowId === COMMISSIONS_CONFIG_SYS_ID) {
            syncCommissionSettingsFromSupabase().catch(() => void 0)
          } else if (rowId === MATRIX_CONFIG_SYS_ID) {
            matrixListeners.forEach((fn) => {
              try { fn() } catch (err) { void err }
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeChannelInstance = channel
        }
      })

    matrixChannel = channel
    return matrixChannel
  } catch {
    return null
  }
}

export function initSupabaseMatrixRealtime(onMatrixUpdate) {
  return subscribeToMatrixRealtime(onMatrixUpdate)
}

export function subscribeToMatrixRealtime(callback) {
  if (typeof callback !== 'function') return () => { }
  matrixListeners.add(callback)
  ensureMatrixChannel()

  return () => {
    matrixListeners.delete(callback)
    if (matrixListeners.size === 0 && matrixChannel && supabase) {
      try {
        supabase.removeChannel(matrixChannel)
      } catch (err) { void err }
      matrixChannel = null
      realtimeChannelInstance = null
    }
  }
}

export async function getSupabaseRbacUsers() {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'get_users')
      const res = await fetch(u)
      if (res.ok) {
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) return { success: true, data: json.data }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, data: [] }
  try {
    const { data, error } = await supabase
      .from(RBAC_TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        tableMissing: error.code === 'PGRST205',
        error: error.message,
        data: [],
      }
    }

    const normalized = (data || [])
      .filter(
        (row) =>
          !String(row.id || '').startsWith('__') &&
          row.status !== 'system' &&
          !String(row.username || '').startsWith('__')
      )
      .map((row) => ({
        id: row.id,
        username: row.username,
        password: row.password,
        name: row.name,
        role: row.role,
        roleLabel: row.role_label,
        branch: row.branch,
        status: row.status,
        avatar: row.avatar,
        email: row.email,
        lastLogin: row.last_login ? new Date(row.last_login).toLocaleString() : 'Never',
        createdAt: row.created_at ? row.created_at.split('T')[0] : '',
      }))

    return { success: true, data: normalized }
  } catch (err) {
    return { success: false, error: err.message, data: [] }
  }
}

export async function saveRbacUserToSupabase(user) {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'save_user')
      const pRes = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      })
      if (pRes.ok) {
        const json = await pRes.json()
        return { success: true, data: json.data }
      }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase is not configured' }
  try {
    const payload = {
      id: user.id || `usr_${Date.now()}`,
      username: String(user.username || '').trim().toLowerCase(),
      password: String(user.password || '').trim(),
      name: user.name,
      role: user.role,
      role_label: user.roleLabel || user.role_label,
      branch: user.branch,
      status: user.status || 'active',
      avatar: user.avatar || user.name.substring(0, 2).toUpperCase(),
      email: user.email || `${user.username}@luckybetplay.ph`,
    }

    const { data, error } = await supabase
      .from(RBAC_TABLE_NAME)
      .upsert(payload, { onConflict: 'username' })
      .select()

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function deleteRbacUserFromSupabase(id, username) {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'delete_user')
      if (id) u.searchParams.set('id', id)
      if (username) u.searchParams.set('username', username)
      const pRes = await fetch(u)
      if (pRes.ok) return { success: true }
    } catch (err) { void err }
  }
  if (!supabase) return { success: false, error: 'Supabase is not configured' }
  try {
    const cleanUser = username ? String(username).trim().toLowerCase() : ''
    const cleanId = id ? String(id).trim() : ''

    if (cleanUser.startsWith('__') || cleanId.startsWith('__')) {
      return { success: false, error: 'Protected system row cannot be deleted' }
    }

    let query = supabase.from(RBAC_TABLE_NAME).delete()
    if (cleanId && cleanUser) {
      query = query.or(`id.eq.${cleanId},username.eq.${cleanUser}`)
    } else if (cleanId) {
      query = query.eq('id', cleanId)
    } else if (cleanUser) {
      query = query.eq('username', cleanUser)
    } else {
      return { success: false, error: 'No identifier provided for deletion' }
    }

    const { error } = await query

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function seedDefaultUsersToSupabase(defaultUsers) {
  if (!supabase || !Array.isArray(defaultUsers) || defaultUsers.length === 0) return
  try {
    const rows = defaultUsers.map((u) => ({
      id: u.id,
      username: u.username.toLowerCase(),
      password: u.password,
      name: u.name,
      role: u.role,
      role_label: u.roleLabel,
      branch: u.branch,
      status: u.status || 'active',
      avatar: u.avatar,
      email: u.email || `${u.username}@luckybetplay.ph`,
    }))

    await supabase.from(RBAC_TABLE_NAME).upsert(rows, { onConflict: 'username' })
  } catch (err) { void err }
}

export async function signInWithSupabase(username, password) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const email = formatSupabaseEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, session: data.session, user: data.user }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function signUpWithSupabase(username, password, userData = {}) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const email = formatSupabaseEmail(username)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          ...userData,
        },
      },
    })
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, session: data.session, user: data.user }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function signOutFromSupabase() {
  if (!supabase) return { error: null }
  try {
    return await supabase.auth.signOut()
  } catch (err) {
    return { error: err }
  }
}

export async function getSupabaseSession() {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session || null
  } catch {
    return null
  }
}

export const PAYOUT_SHORTAGE_TABLE_NAME = 'payout_shortage_replenishments'

export async function getPayoutShortagesFromSupabase(branch, claimDate) {
  if (!supabase) return { success: false, data: [] }
  try {
    let res = await supabase
      .from(PAYOUT_SHORTAGE_TABLE_NAME)
      .select('*')
      .eq('branch', branch)
      .eq('claim_date', claimDate)
      .order('created_at', { ascending: true })

    if (res.error && res.error.code === 'PGRST205') {
      res = await supabase
        .from('cashier_negative_claims')
        .select('*')
        .eq('branch', branch)
        .eq('claim_date', claimDate)
        .order('created_at', { ascending: true })
    }

    if (res.error) {
      return {
        success: false,
        tableMissing: res.error.code === 'PGRST205',
        error: res.error.message,
        data: [],
      }
    }

    const normalized = (res.data || []).map((row) => ({
      id: row.id,
      supervisor: row.supervisor,
      drawRotation: row.draw_rotation || '1st Draw',
      amount: row.amount !== null ? String(row.amount) : '',
      isSavedInDb: true,
    }))

    return { success: true, data: normalized }
  } catch (err) {
    return { success: false, error: err.message, data: [] }
  }
}

export async function savePayoutShortagesToSupabase(branch, claimDate, claimsArray) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    let tableName = PAYOUT_SHORTAGE_TABLE_NAME

    const { error: delErr } = await supabase
      .from(tableName)
      .delete()
      .eq('branch', branch)
      .eq('claim_date', claimDate)

    if (delErr && delErr.code === 'PGRST205') {
      tableName = 'cashier_negative_claims'
      await supabase
        .from(tableName)
        .delete()
        .eq('branch', branch)
        .eq('claim_date', claimDate)
    }

    const rowsToInsert = (claimsArray || [])
      .filter((item) => item.supervisor || Number(item.amount) > 0)
      .map((item, idx) => ({
        id: item.id || `shortage_${branch}_${claimDate}_${idx}_${Date.now()}`,
        branch: branch,
        claim_date: claimDate,
        supervisor: item.supervisor || 'Unassigned',
        draw_rotation: item.drawRotation || '1st Draw',
        amount: Number(item.amount) || 0,
        updated_at: new Date().toISOString(),
      }))

    if (rowsToInsert.length > 0) {
      const { data, error } = await supabase
        .from(tableName)
        .upsert(rowsToInsert)

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true, data }
    }

    return { success: true, data: [] }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function deletePayoutShortageRowFromSupabase(id) {
  if (!supabase || !id) return { success: false, error: 'Supabase client is not configured' }
  try {
    let tableName = PAYOUT_SHORTAGE_TABLE_NAME
    let res = await supabase.from(tableName).delete().eq('id', id)

    if (res.error && res.error.code === 'PGRST205') {
      tableName = 'cashier_negative_claims'
      res = await supabase.from(tableName).delete().eq('id', id)
    }

    if (res.error) {
      return { success: false, error: res.error.message }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export const getCashierClaimsFromSupabase = getPayoutShortagesFromSupabase
export const saveCashierClaimsToSupabase = savePayoutShortagesToSupabase
export const deleteCashierClaimFromSupabase = deletePayoutShortageRowFromSupabase

export const ACTIVE_SESSIONS_CONFIG_ID = 'active_sessions'

export function getSessionTokenFromUrl() {
  if (typeof window === 'undefined') return null
  try {
    if (window.name && window.name.startsWith('ses_')) {
      return window.name
    }
    if (window.name) {
      try {
        const parsed = JSON.parse(window.name)
        if (parsed?.token) return parsed.token
      } catch (err) { void err }
    }
  } catch (err) { void err }

  const hash = window.location.hash || ''
  const match = hash.match(/session=([^&]+)/)
  if (match) {
    const token = decodeURIComponent(match[1])
    try { window.name = token } catch (err) { void err }
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (err) { void err }
    return token
  }

  return null
}

export function setSessionTokenInUrl(token) {
  if (typeof window === 'undefined') return
  try {
    window.name = token || ''
  } catch (err) { void err }

  if (window.location.hash.includes('session=')) {
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (err) { void err }
  }
}

export async function createCloudSession(user) {
  const token = 'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
  const sessionUser = {
    ...user,
    token,
    lastActive: new Date().toISOString(),
  }

  setSessionTokenInUrl(token)

  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'create_session')
      const pRes = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionUser),
      })
      if (pRes.ok) return sessionUser
    } catch (err) { void err }
  }

  if (supabase) {
    try {
      const { data } = await supabase
        .from('rbac_matrix_config')
        .select('config')
        .eq('id', ACTIVE_SESSIONS_CONFIG_ID)
        .maybeSingle()

      const currentSessions = (data?.config && typeof data.config === 'object') ? data.config : {}
      currentSessions[token] = sessionUser

      await supabase
        .from('rbac_matrix_config')
        .upsert({
          id: ACTIVE_SESSIONS_CONFIG_ID,
          config: currentSessions,
          updated_at: new Date().toISOString(),
        })
    } catch (err) {
      console.warn('Failed to persist cloud session to Supabase:', err)
    }
  }

  return sessionUser
}

export async function getCloudSession() {
  const token = getSessionTokenFromUrl()
  if (!token) return null
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', ACTIVE_SESSIONS_CONFIG_ID)
      .maybeSingle()

    if (!error && data?.config && data.config[token]) {
      return data.config[token]
    }
  } catch (err) {
    console.warn('Failed to retrieve cloud session:', err)
  }

  setSessionTokenInUrl(null)
  return null
}

export async function updateCloudSession(token, updatedUser) {
  if (!token) return
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'create_session')
      await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedUser, token }),
      })
      return
    } catch (err) { void err }
  }
  if (!token || !supabase) return
  try {
    const { data } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', ACTIVE_SESSIONS_CONFIG_ID)
      .maybeSingle()

    const currentSessions = (data?.config && typeof data.config === 'object') ? data.config : {}
    currentSessions[token] = {
      ...currentSessions[token],
      ...updatedUser,
      token,
      lastActive: new Date().toISOString(),
    }

    await supabase
      .from('rbac_matrix_config')
      .upsert({
        id: ACTIVE_SESSIONS_CONFIG_ID,
        config: currentSessions,
        updated_at: new Date().toISOString(),
      })
  } catch (err) {
    console.warn('Failed to update cloud session:', err)
  }
}

export async function revokeCloudSession(token) {
  const targetToken = token || getSessionTokenFromUrl()
  setSessionTokenInUrl(null)

  if (targetToken && typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'revoke_session')
      u.searchParams.set('token', targetToken)
      await fetch(u, { method: 'POST' })
      return
    } catch (err) { void err }
  }

  if (targetToken && supabase) {
    try {
      const { data } = await supabase
        .from('rbac_matrix_config')
        .select('config')
        .eq('id', ACTIVE_SESSIONS_CONFIG_ID)
        .maybeSingle()

      if (data?.config && data.config[targetToken]) {
        const nextSessions = { ...data.config }
        delete nextSessions[targetToken]

        await supabase
          .from('rbac_matrix_config')
          .upsert({
            id: ACTIVE_SESSIONS_CONFIG_ID,
            config: nextSessions,
            updated_at: new Date().toISOString(),
          })
      }
    } catch (err) { void err }
  }
}

export async function bootFromCloud(sessionToken) {
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    try {
      const u = new URL('/api/proxy', window.location.origin)
      u.searchParams.set('action', 'boot')
      if (sessionToken) u.searchParams.set('token', sessionToken)
      const res = await fetch(u)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          if (data.matrix) {
            if (data.matrix.roles) setInMemoryRoles(data.matrix.roles)
            if (data.matrix.userPerms) setInMemoryUserPerms(data.matrix.userPerms)
          }
          if (data.commissions) setInMemoryCommissionSettings(data.commissions)
          if (Array.isArray(data.users) && data.users.length > 0) setInMemoryUsers(data.users)

          window.dispatchEvent(new CustomEvent('luckybet_rbac_change', { detail: { source: 'boot_proxy' } }))
          window.dispatchEvent(new CustomEvent('luckybet_commissions_updated', { detail: data.commissions, source: 'boot_proxy' }))
          return data
        }
      }
    } catch (e) {
      console.warn('Proxy boot error, falling back:', e)
    }
  }

  const [matrixRes, commRes, usersRes] = await Promise.all([
    syncMatrixPermissionsFromSupabase().catch(() => null),
    syncCommissionSettingsFromSupabase().catch(() => null),
    getSupabaseRbacUsers().catch(() => null),
  ])
  return {
    matrix: matrixRes?.config,
    commissions: commRes?.settings,
    users: usersRes?.data || [],
  }
}
