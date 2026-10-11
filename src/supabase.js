// src/supabase.js - Dedicated Supabase Client & Database Table Layer
import { createClient } from '@supabase/supabase-js'

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

// Load Supabase credentials exclusively from environment variables (.env / .env.local)
// Never commit or hardcode credentials directly in source files.
const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured && typeof console !== 'undefined' && env.DEV) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not configured. Supabase cloud sync features are disabled.'
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null

export const RBAC_TABLE_NAME = 'rbac_users'

/**
 * Normalize an identifier to an email address format suitable for Supabase Auth.
 */
export function formatSupabaseEmail(identifier) {
  const clean = String(identifier || '').trim().toLowerCase()
  if (clean.includes('@')) return clean
  return `${clean}@luckybetplay.ph`
}

// =============================================================================
// DEDICATED TABLE AUTHENTICATION & RBAC DIRECTORY
// =============================================================================

/**
 * Verify username and password strictly against the Supabase 'rbac_users' table.
 * If user is not found in the table, or password doesn't match, or is suspended,
 * access is explicitly denied.
 */
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

    // Table has not been created yet in PostgreSQL
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

    // Account not found in directory
    if (!data || data.length === 0) {
      return {
        success: false,
        notFound: true,
        error: `Account "${username}" is not registered in the authorized credentials directory.`,
      }
    }

    const account = data[0]

    // Account status check
    if (account.status === 'suspended' || account.status === 'inactive' || account.status === 'system') {
      return {
        success: false,
        inactive: true,
        error: `Access Denied: The account "${account.username}" is currently deactivated. Please contact your system administrator.`,
      }
    }

    // Strict Password Verification
    if (account.password !== cleanPass) {
      return {
        success: false,
        wrongPassword: true,
        error: 'Invalid password. Please verify your credentials and try again.',
      }
    }

    // Update last_login timestamp asynchronously
    supabase
      .from(RBAC_TABLE_NAME)
      .update({ last_login: new Date().toISOString() })
      .eq('id', account.id)
      .then(() => { })
      .catch(() => { })

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

/**
 * Fetch matrix configuration (role permissions and user custom permissions) from Supabase.
 * Checks dedicated 'rbac_matrix_config' table first; falls back to system row in 'rbac_users'.
 */
export async function getSupabaseMatrixConfig() {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    // 1. Try dedicated table first
    const { data: tableData, error: tableErr } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', MATRIX_CONFIG_ID)
      .maybeSingle()

    if (!tableErr && tableData?.config) {
      return { success: true, config: tableData.config, source: 'rbac_matrix_config' }
    }

    // 2. Fallback to protected system row in rbac_users
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

/**
 * Save matrix configuration (roles permissions + user custom permissions) to Supabase.
 * Saves to both dedicated table (if present) and fallback system row in rbac_users.
 */
export async function saveSupabaseMatrixConfig(config) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const payloadWithTimestamp = {
      ...config,
      updatedAt: new Date().toISOString(),
    }

    let savedToTable = false

    // 1. Attempt save to dedicated table
    try {
      const { error: tableErr } = await supabase
        .from('rbac_matrix_config')
        .upsert({
          id: MATRIX_CONFIG_ID,
          config: payloadWithTimestamp,
          updated_at: new Date().toISOString(),
        })
      if (!tableErr) {
        savedToTable = true
      }
    } catch { }

    // 2. Only fallback to system row in rbac_users if dedicated table is not present
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
        avatar: 'CF',
        email: JSON.stringify(payloadWithTimestamp),
      }

      const res = await supabase
        .from(RBAC_TABLE_NAME)
        .upsert(sysRow, { onConflict: 'username' })
      userErr = res.error
    }

    // 3. Broadcast real-time change to all connected clients
    try {
      if (realtimeChannelInstance) {
        realtimeChannelInstance.send({
          type: 'broadcast',
          event: 'matrix_updated',
          payload: { timestamp: Date.now() },
        })
      }
    } catch { }

    if (savedToTable || !userErr) {
      return { success: true, source: savedToTable ? 'rbac_matrix_config' : 'rbac_users_fallback' }
    }

    return { success: false, error: userErr?.message }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Synchronize cloud matrix permissions from Supabase into local storage and trigger UI re-render.
 */
export async function syncMatrixPermissionsFromSupabase() {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }
  try {
    const res = await getSupabaseMatrixConfig()
    if (res.success && res.config) {
      const { roles, userPerms } = res.config
      let changed = false

      if (roles && typeof roles === 'object') {
        const currentRolesRaw = localStorage.getItem('luckybet_rbac_roles')
        const newRolesStr = JSON.stringify(roles)
        if (currentRolesRaw !== newRolesStr) {
          localStorage.setItem('luckybet_rbac_roles', newRolesStr)
          changed = true
        }
      }

      if (userPerms && typeof userPerms === 'object') {
        const currentUserPermsRaw = localStorage.getItem('luckybet_rbac_user_perms')
        const newUserPermsStr = JSON.stringify(userPerms)
        if (currentUserPermsRaw !== newUserPermsStr) {
          localStorage.setItem('luckybet_rbac_user_perms', newUserPermsStr)
          changed = true
        }
      }

      if (changed) {
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

/**
 * Fetch hierarchical commission settings (supervisor default rates and individual agent overrides) from Supabase.
 */
export async function getSupabaseCommissionSettings() {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    // 1. Try dedicated table first
    const { data: tableData, error: tableErr } = await supabase
      .from('rbac_matrix_config')
      .select('config')
      .eq('id', COMMISSIONS_CONFIG_ID)
      .maybeSingle()

    if (!tableErr && tableData?.config) {
      return { success: true, settings: tableData.config, source: 'rbac_matrix_config' }
    }

    // 2. Fallback to system row in rbac_users
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

/**
 * Save hierarchical commission settings to Supabase.
 */
export async function saveSupabaseCommissionSettings(settings) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const payload = {
      globalDefaultRate: Number(settings.globalDefaultRate) || 10.0,
      supervisors: settings.supervisors || {},
      updatedAt: new Date().toISOString(),
    }

    let savedToTable = false

    // 1. Attempt save to dedicated table
    try {
      const { error: tableErr } = await supabase
        .from('rbac_matrix_config')
        .upsert({
          id: COMMISSIONS_CONFIG_ID,
          config: payload,
          updated_at: new Date().toISOString(),
        })
      if (!tableErr) savedToTable = true
    } catch { }

    // 2. Only fallback to system row in rbac_users if dedicated table is not present
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

    // 3. Broadcast real-time change to all connected clients
    try {
      if (realtimeChannelInstance) {
        realtimeChannelInstance.send({
          type: 'broadcast',
          event: 'commissions_updated',
          payload: { timestamp: Date.now() },
        })
      }
    } catch { }

    if (savedToTable || !userErr) {
      return { success: true, source: savedToTable ? 'rbac_matrix_config' : 'rbac_users_fallback' }
    }

    return { success: false, error: userErr?.message }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Synchronize cloud commission settings from Supabase into local storage and trigger UI re-render.
 */
export async function syncCommissionSettingsFromSupabase() {
  if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }
  try {
    const res = await getSupabaseCommissionSettings()
    if (res.success && res.settings) {
      const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined'
      let changed = false

      if (isBrowser) {
        const currentRaw = localStorage.getItem('luckybet_commission_settings')
        const newStr = JSON.stringify(res.settings)
        if (currentRaw !== newStr) {
          localStorage.setItem('luckybet_commission_settings', newStr)
          changed = true
        }

        window.dispatchEvent(
          new CustomEvent('luckybet_commissions_updated', {
            detail: res.settings,
            source: 'supabase_sync',
          })
        )
      }

      return { success: true, settings: res.settings, changed }
    }
    return { success: false, error: res.error }
  } catch (err) {
    console.warn('Syncing commission settings from Supabase failed:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Subscribe to real-time matrix & commission changes across all browsers and devices.
 */
export function subscribeToMatrixRealtime(onUpdate) {
  if (!supabase) return () => { }

  try {
    const channel = supabase.channel(MATRIX_REALTIME_CHANNEL)
    realtimeChannelInstance = channel

    channel
      .on('broadcast', { event: 'matrix_updated' }, () => {
        if (typeof onUpdate === 'function') onUpdate()
      })
      .on('broadcast', { event: 'commissions_updated' }, () => {
        syncCommissionSettingsFromSupabase().catch(() => { })
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: RBAC_TABLE_NAME },
        (payload) => {
          if (
            payload?.new?.id === MATRIX_CONFIG_SYS_ID ||
            payload?.old?.id === MATRIX_CONFIG_SYS_ID ||
            payload?.new?.username === MATRIX_CONFIG_SYS_ID
          ) {
            if (typeof onUpdate === 'function') onUpdate()
          }
          if (
            payload?.new?.id === COMMISSIONS_CONFIG_SYS_ID ||
            payload?.old?.id === COMMISSIONS_CONFIG_SYS_ID ||
            payload?.new?.username === COMMISSIONS_CONFIG_SYS_ID
          ) {
            syncCommissionSettingsFromSupabase().catch(() => { })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rbac_matrix_config' },
        (payload) => {
          if (payload?.new?.id === COMMISSIONS_CONFIG_ID || payload?.old?.id === COMMISSIONS_CONFIG_ID) {
            syncCommissionSettingsFromSupabase().catch(() => { })
          } else {
            if (typeof onUpdate === 'function') onUpdate()
          }
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
        if (realtimeChannelInstance === channel) {
          realtimeChannelInstance = null
        }
      } catch { }
    }
  } catch (err) {
    console.warn('Realtime subscription setup error:', err)
    return () => { }
  }
}

/**
 * Fetch all authorized accounts from Supabase 'rbac_users' table.
 */
export async function getSupabaseRbacUsers() {
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

    // Exclude protected system configuration rows
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

/**
 * Insert or update an account in Supabase 'rbac_users' table.
 */
export async function saveRbacUserToSupabase(user) {
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

/**
 * Delete an account from Supabase 'rbac_users' table.
 */
export async function deleteRbacUserFromSupabase(id, username) {
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
      console.error('Supabase delete error:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('Supabase delete exception:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Seed initial default users into the table if empty.
 */
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
      email: u.email,
    }))

    await supabase.from(RBAC_TABLE_NAME).upsert(rows, { onConflict: 'username' })
  } catch { }
}

// =============================================================================
// SUPABASE AUTH (OAuth / Email fallback)
// =============================================================================

export async function signInWithSupabase(identifier, password) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  const email = formatSupabaseEmail(identifier)

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user, session: data.session }
  } catch (err) {
    return { success: false, error: err.message || 'Supabase authentication failed' }
  }
}

export async function signUpWithSupabase(email, password, metadata = {}) {
  if (!supabase) return { success: false, error: 'Supabase client is not configured' }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user, session: data.session }
  } catch (err) {
    return { success: false, error: err.message || 'Supabase registration failed' }
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

/**
 * Fetch Payout Shortage Replenishments from Supabase database by branch and date.
 */
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

/**
 * Save / sync Payout Shortage Replenishments to Supabase database for a specific branch and date.
 */
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

/**
 * Delete a specific Payout Shortage Replenishment record from Supabase by ID.
 */
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

// Backwards compatibility exports
export const getCashierClaimsFromSupabase = getPayoutShortagesFromSupabase
export const saveCashierClaimsToSupabase = savePayoutShortagesToSupabase
export const deleteCashierClaimFromSupabase = deletePayoutShortageRowFromSupabase
