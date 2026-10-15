import { useState, useMemo, useEffect } from 'react'
import './RbacManagementView.css'
import ConfirmActionModal from './ConfirmActionModal'
import {
  getRbacUsers,
  saveRbacUsers,
  getRbacRoles,
  saveRbacRoles,
  getUserCustomPermissions,
  setUserCustomPermissions,
  clearUserCustomPermissions,
  getUserEffectivePermissions,
  hasPermission,
  PERMISSIONS,
  DEFAULT_ROLES,
  getAuditLogs,
  addAuditLog,
  getDeletedUsernames,
  recordDeletedUsername,
  unmarkDeletedUsername,
  isTabPermission,
  isFeaturePermission,
  getPermissionMeta,
  areFeatureParentTabsDisabled,
  getAffectedFeaturesWhenTabDisabled,
} from './rbac'
import {
  isSupabaseConfigured,
  getSupabaseRbacUsers,
  saveRbacUserToSupabase,
  deleteRbacUserFromSupabase,
  syncMatrixPermissionsFromSupabase,
  saveSupabaseMatrixConfig,
  subscribeToMatrixRealtime,
} from './supabase'

const SQL_SCRIPT_TEXT = `-- Dedicated rbac_users table for Cloud Directory
CREATE TABLE IF NOT EXISTS public.rbac_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  role_label TEXT,
  branch TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT,
  email TEXT,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dedicated table for Cloud Role Permission Matrix & Account Capabilities
CREATE TABLE IF NOT EXISTS public.rbac_matrix_config (
  id TEXT PRIMARY KEY,
  config JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.rbac_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_matrix_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access to rbac_users" ON public.rbac_users;
CREATE POLICY "Allow anon full access to rbac_users"
ON public.rbac_users
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access to rbac_matrix_config" ON public.rbac_matrix_config;
CREATE POLICY "Allow anon full access to rbac_matrix_config"
ON public.rbac_matrix_config
FOR ALL
USING (true)
WITH CHECK (true);

INSERT INTO public.rbac_users (id, username, password, name, role, role_label, branch, status, avatar, email)
VALUES
  ('usr_admin', 'admin', 'adminpassword', 'Jay Ryan Lim', 'admin', 'System Administrator', 'LDN HQ (All Zones)', 'active', 'JL', 'admin@glowingfortune.ph'),
  ('usr_accountant', 'ldn.staff', 'luckybet2026', 'Elena Morales', 'accountant', 'Head Cashier', 'LDN Branch', 'active', 'EM', 'elena.m@glowingfortune.ph'),
  ('usr_supervisor', 'supervisor.carlos', 'luckybet2026', 'Carlos Tan', 'supervisor', 'Branch Supervisor', 'LDN Central Zone', 'active', 'CT', 'carlos.tan@glowingfortune.ph'),
  ('usr_terminal', 'teller.ldn', 'luckybet2026', 'Rico Dela Cruz', 'staff', 'Terminal Staff', 'LDN Terminal 01', 'active', 'RD', 'rico.staff@glowingfortune.ph')
ON CONFLICT (username) DO UPDATE SET
  password = EXCLUDED.password,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  role_label = EXCLUDED.role_label,
  branch = EXCLUDED.branch,
  status = EXCLUDED.status;`

function SvgIcon({ name, size = 16, className = '' }) {
  const icons = {
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    userPlus: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </>
    ),
    shieldCheck: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    key: (
      <>
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="m11 12 9-9" />
        <path d="m15.5 7.5 2 2" />
        <path d="m18 5 2 2" />
      </>
    ),
    lock: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2.5" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    edit: (
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </>
    ),
    check: (
      <polyline points="20 6 9 17 4 12" />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7.5" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 21h5v-5" />
      </>
    ),
    logIn: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    activity: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    ),
    slashCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
      </>
    ),
    checkCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
    folder: (
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    ),
    tool: (
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
    layers: (
      <>
        <path d="m12 2 9 4.5-9 4.5-9-4.5Z" />
        <path d="m3 11 9 4.5 9-4.5" />
        <path d="m3 16 9 4.5 9-4.5" />
      </>
    ),
    alertTriangle: (
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="16" x2="12" y2="11" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>
    ),
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
      {icons[name] || icons.shieldCheck}
    </svg>
  )
}

export default function RbacManagementView({ currentUser, onSimulateUser, branchName = 'LDN', initialTab = 'users' }) {
  const [users, setUsers] = useState(() => getRbacUsers())
  const [roles, setRoles] = useState(() => getRbacRoles())
  const [auditLogs, setAuditLogs] = useState(() => getAuditLogs())
  const [activeTab, setActiveTab] = useState(initialTab || 'users') 
  const [matrixViewMode, setMatrixViewMode] = useState('roles') 
  const [accountPermsRev, setAccountPermsRev] = useState(0)

  const canSwitchAccounts = currentUser?.role === 'admin' || Boolean(currentUser?.simulatedFromAdmin)

  useEffect(() => {
    const handleRbacUpdate = () => {
      setRoles(getRbacRoles())
      setUsers(getRbacUsers())
      setAuditLogs(getAuditLogs())
      setAccountPermsRev((prev) => prev + 1)
    }
    window.addEventListener('luckybet_rbac_change', handleRbacUpdate)
    return () => window.removeEventListener('luckybet_rbac_change', handleRbacUpdate)
  }, [])

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab)
  }, [initialTab])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState('all')

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const [supabaseSyncStatus, setSupabaseSyncStatus] = useState('idle') 
  const [showSqlModal, setShowSqlModal] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    syncMatrixPermissionsFromSupabase().catch(() => {})

    const unsubRealtime = subscribeToMatrixRealtime(() => {
      syncMatrixPermissionsFromSupabase().catch(() => {})
    })

    setSupabaseSyncStatus('syncing')
    getSupabaseRbacUsers()
      .then((res) => {
        const deletedList = getDeletedUsernames()
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          const validUsers = res.data.filter(
            (u) => !deletedList.includes(u.username?.toLowerCase())
          )
          setUsers(validUsers)
          saveRbacUsers(validUsers)
          setSupabaseSyncStatus('connected')

          const lingering = res.data.filter((u) =>
            deletedList.includes(u.username?.toLowerCase())
          )
          lingering.forEach((u) => {
            deleteRbacUserFromSupabase(u.id, u.username).catch(() => {})
          })
        } else if (res.tableMissing) {
          setSupabaseSyncStatus('table_missing')
        } else if (res.success && res.data.length === 0) {
          setSupabaseSyncStatus('connected')
          const activeDefaults = users.filter(
            (u) => !deletedList.includes(u.username?.toLowerCase())
          )
          activeDefaults.forEach((u) => saveRbacUserToSupabase(u).catch(() => {}))
        } else {
          setSupabaseSyncStatus('connected')
        }
      })
      .catch(() => {
        setSupabaseSyncStatus('error')
      })

    return () => {
      if (typeof unsubRealtime === 'function') unsubRealtime()
    }
  }, [])

  const [formData, setFormData] = useState({
    username: '',
    name: '',
    password: '',
    role: 'accountant',
    branch: `${branchName} Branch`,
    status: 'active',
    email: '',
  })

  const showNotification = (notice, type = 'info', title = '') => {
    if (typeof notice === 'object' && notice !== null) {
      setFeedbackNotice({
        type: notice.type || 'info',
        title: notice.title || '',
        message: notice.message || '',
      })
    } else {
      setFeedbackNotice({
        type,
        title,
        message: String(notice || ''),
      })
    }
  }

  useEffect(() => {
    if (!feedbackNotice) return
    const duration =
      typeof feedbackNotice === 'object' &&
      (feedbackNotice.type === 'warning' || feedbackNotice.type === 'error')
        ? 6000
        : 3800
    const timer = setTimeout(() => {
      setFeedbackNotice(null)
    }, duration)
    return () => clearTimeout(timer)
  }, [feedbackNotice])

  const tabPerms = useMemo(() => PERMISSIONS.filter((p) => p.type === 'tab'), [])
  const featurePerms = useMemo(() => PERMISSIONS.filter((p) => p.type === 'feature'), [])

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.branch && u.branch.toLowerCase().includes(searchQuery.toLowerCase()))

      let matchesFilter = true
      if (filterRole === 'active_only') {
        matchesFilter = u.status === 'active'
      } else if (filterRole === 'suspended_only') {
        matchesFilter = u.status === 'suspended' || u.status === 'inactive'
      } else if (filterRole !== 'all') {
        matchesFilter = u.role === filterRole
      }

      return matchesSearch && matchesFilter
    })
  }, [users, searchQuery, filterRole])

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*'
    let generated = 'LB-'
    for (let i = 0; i < 8; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setFormData((prev) => ({ ...prev, password: generated }))
  }

  const handleCreateUser = (e) => {
    e.preventDefault()
    const cleanUser = formData.username.trim().toLowerCase()
    const cleanName = formData.name.trim()
    const cleanPass = formData.password.trim()

    if (!cleanUser || !cleanName || !cleanPass) {
      alert('Please fill out Username, Full Name, and Password.')
      return
    }

    if (users.some((u) => u.username.toLowerCase() === cleanUser)) {
      alert(`Username "${cleanUser}" already exists. Please choose a different Access ID.`)
      return
    }

    const roleDef = roles[formData.role] || DEFAULT_ROLES[formData.role] || DEFAULT_ROLES.staff
    const newUser = {
      id: `usr_${Date.now()}`,
      username: cleanUser,
      name: cleanName,
      password: cleanPass,
      role: formData.role,
      roleLabel: roleDef.label,
      branch: formData.branch || `${branchName} Branch`,
      status: formData.status,
      lastLogin: 'Never',
      createdAt: new Date().toISOString().split('T')[0],
      avatar: cleanName.substring(0, 2).toUpperCase(),
      email: formData.email.trim() || `${cleanUser}@luckybetplay.ph`,
    }

    unmarkDeletedUsername(cleanUser)

    const updated = [newUser, ...users]
    setUsers(updated)
    saveRbacUsers(updated)

    if (isSupabaseConfigured) {
      saveRbacUserToSupabase(newUser).catch(() => {})
    }

    const updatedLogs = addAuditLog(
      'RBAC_USER_CREATED',
      `New user credential ${cleanUser} (${roleDef.label}) created by ${currentUser?.username || 'admin'}`,
      currentUser?.username || 'admin',
      'success'
    )
    setAuditLogs(updatedLogs)

    setIsAddModalOpen(false)
    setFormData({
      username: '',
      name: '',
      password: '',
      role: 'accountant',
      branch: `${branchName} Branch`,
      status: 'active',
      email: '',
    })

    showNotification(`User credential "${cleanUser}" successfully created!`)
  }

  const handleUpdateUser = (e) => {
    e.preventDefault()
    if (!editingUser) return

    const roleDef = roles[editingUser.role] || DEFAULT_ROLES[editingUser.role] || DEFAULT_ROLES.staff
    const updated = users.map((u) => {
      if (u.id === editingUser.id) {
        return {
          ...u,
          name: editingUser.name.trim(),
          role: editingUser.role,
          roleLabel: roleDef.label,
          branch: editingUser.branch.trim(),
          status: editingUser.status,
          password: editingUser.password.trim(),
          email: editingUser.email.trim(),
        }
      }
      return u
    })

    setUsers(updated)
    saveRbacUsers(updated)

    const updatedUser = updated.find((u) => u.id === editingUser.id)
    if (updatedUser && isSupabaseConfigured) {
      saveRbacUserToSupabase(updatedUser).catch(() => {})
    }

    const updatedLogs = addAuditLog(
      'RBAC_USER_UPDATED',
      `Credential for ${editingUser.username} updated to ${roleDef.label} (${editingUser.status})`,
      currentUser?.username || 'admin',
      'info'
    )
    setAuditLogs(updatedLogs)

    setEditingUser(null)
    showNotification(`Credentials for "${editingUser.username}" saved!`)
  }

  const handleToggleUserStatus = async (targetUser) => {
    if (!targetUser) return
    if (targetUser.username === 'admin') {
      alert('Security policy prevents deactivating the root System Administrator account.')
      return
    }

    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended'
    const isNowDeactivated = nextStatus === 'suspended'

    const updated = users.map((u) => {
      if (u.id === targetUser.id || u.username.toLowerCase() === targetUser.username.toLowerCase()) {
        return { ...u, status: nextStatus }
      }
      return u
    })
    setUsers(updated)
    saveRbacUsers(updated)

    if (isSupabaseConfigured) {
      const updatedUser = updated.find(
        (u) => u.id === targetUser.id || u.username.toLowerCase() === targetUser.username.toLowerCase()
      )
      if (updatedUser) {
        saveRbacUserToSupabase(updatedUser).catch((err) => {
          console.warn('Failed to update status in cloud database:', err)
        })
      }
    }

    const updatedLogs = addAuditLog(
      isNowDeactivated ? 'RBAC_USER_DEACTIVATED' : 'RBAC_USER_ACTIVATED',
      `Account @${targetUser.username} was ${isNowDeactivated ? 'deactivated' : 'reactivated'} by ${currentUser?.username || 'admin'}`,
      currentUser?.username || 'admin',
      isNowDeactivated ? 'warning' : 'success'
    )
    setAuditLogs(updatedLogs)

    showNotification(
      isNowDeactivated
        ? `Account "@${targetUser.username}" has been deactivated.`
        : `Account "@${targetUser.username}" has been reactivated.`
    )
  }

  const handleDeleteUser = async () => {
    if (!deletingUser || isDeleting) return
    if (deletingUser.username === 'admin') {
      alert('Security policy prevents deleting the root System Administrator account.')
      setDeletingUser(null)
      return
    }

    const targetUser = deletingUser
    const cleanUser = targetUser.username.trim().toLowerCase()
    setIsDeleting(true)

    try {
      recordDeletedUsername(cleanUser)

      const updated = users.filter((u) => u.id !== targetUser.id && u.username.toLowerCase() !== cleanUser)
      setUsers(updated)
      saveRbacUsers(updated)

      if (isSupabaseConfigured) {
        const delRes = await deleteRbacUserFromSupabase(targetUser.id, targetUser.username)
        if (!delRes.success) {
          console.warn('Cloud directory delete warning:', delRes.error)
        }
      }

      const updatedLogs = addAuditLog(
        'RBAC_USER_DELETED',
        `Account ${cleanUser} was permanently deleted by ${currentUser?.username || 'admin'}`,
        currentUser?.username || 'admin',
        'warning'
      )
      setAuditLogs(updatedLogs)

      showNotification(`User credential "@${cleanUser}" permanently deleted.`)
    } catch (err) {
      console.error('Error deleting user:', err)
      showNotification(`Error deleting user: ${err.message}`)
    } finally {
      setIsDeleting(false)
      setDeletingUser(null)
    }
  }

  const handleTogglePermission = (roleKey, permKey) => {
    const currentRole = roles[roleKey]
    if (!currentRole) return

    const currentPerms = currentRole.permissions || []
    const isCurrentlyGranted = currentPerms.includes(permKey)
    const permMeta = getPermissionMeta(permKey)
    const isTab = permMeta.type === 'tab'
    const isFeature = permMeta.type === 'feature'

    if (!isCurrentlyGranted && isFeature) {
      if (areFeatureParentTabsDisabled(permKey, currentPerms)) {
        showNotification({
          type: 'warning',
          title: '🚫 FEATURE CANNOT BE ENABLED',
          message: `The FEATURE "${permMeta.label}" cannot be enabled for ${currentRole.label} because its parent workspace tab is DISABLED (${permMeta.parentTabLabels?.join(' or ')}). Please enable the corresponding workspace tab above first!`,
        })
        return
      }
    }

    if (roleKey === 'admin' && permKey === 'manage_users' && isCurrentlyGranted) {
      if (!confirm('Warning: Disabling "manage_users" for System Administrator will restrict access to this RBAC management panel. Are you sure you want to test this?')) {
        return
      }
    }

    let nextPerms = []
    let autoDisabledFeatures = []

    if (isCurrentlyGranted) {
      if (isTab) {
        autoDisabledFeatures = getAffectedFeaturesWhenTabDisabled(permKey, currentPerms)
        const autoDisabledKeys = autoDisabledFeatures.map((f) => f.key)
        nextPerms = currentPerms.filter((p) => p !== permKey && !autoDisabledKeys.includes(p))
      } else {
        nextPerms = currentPerms.filter((p) => p !== permKey)
      }
    } else {
      nextPerms = [...currentPerms, permKey]
    }

    const updatedRoles = {
      ...roles,
      [roleKey]: {
        ...currentRole,
        permissions: nextPerms,
      },
    }

    setRoles(updatedRoles)
    saveRbacRoles(updatedRoles)

    const affectedUsers = users.filter((u) => u.role === roleKey).map((u) => u.name).join(', ')

    if (isCurrentlyGranted) {
      if (isTab) {
        addAuditLog(
          'RBAC_TAB_DISABLED',
          `Workspace TAB "${permMeta.label}" (${permKey}) was DISABLED for role ${currentRole.label}${autoDisabledFeatures.length > 0 ? ` (dependent in-tab features also disabled: ${autoDisabledFeatures.map((f) => f.key).join(', ')})` : ''}`,
          currentUser?.username || 'admin',
          'warning'
        )
        if (autoDisabledFeatures.length > 0) {
          showNotification({
            type: 'warning',
            title: '⚠️ TAB DISABLED',
            message: `The workspace TAB "${permMeta.label}" was DISABLED for ${currentRole.label}. The dependent feature(s) inside (${autoDisabledFeatures.map((f) => `"${f.label}"`).join(', ')}) were automatically disabled because their parent tab is closed in sidebar navigation.`,
          })
        } else {
          showNotification({
            type: 'info',
            title: '❌ TAB DISABLED',
            message: `The workspace TAB "${permMeta.label}" was disabled for ${currentRole.label} and removed from sidebar navigation${affectedUsers ? ` (${affectedUsers})` : ''}.`,
          })
        }
      } else {
        addAuditLog(
          'RBAC_FEATURE_DISABLED',
          `In-tab FEATURE "${permMeta.label}" (${permKey}) was DISABLED for role ${currentRole.label}`,
          currentUser?.username || 'admin',
          'info'
        )
        showNotification({
          type: 'info',
          title: '❌ FEATURE DISABLED',
          message: `The FEATURE "${permMeta.label}" was disabled for ${currentRole.label}${affectedUsers ? ` (${affectedUsers})` : ''}.`,
        })
      }
    } else {
      if (isTab) {
        addAuditLog(
          'RBAC_TAB_ENABLED',
          `Workspace TAB "${permMeta.label}" (${permKey}) was ENABLED for role ${currentRole.label}`,
          currentUser?.username || 'admin',
          'success'
        )
        showNotification({
          type: 'success',
          title: '✅ TAB ENABLED',
          message: `The workspace TAB "${permMeta.label}" was enabled for ${currentRole.label} and is now accessible in sidebar navigation!`,
        })
      } else {
        addAuditLog(
          'RBAC_FEATURE_ENABLED',
          `In-tab FEATURE "${permMeta.label}" (${permKey}) was ENABLED for role ${currentRole.label}`,
          currentUser?.username || 'admin',
          'success'
        )
        showNotification({
          type: 'success',
          title: '✅ FEATURE ENABLED',
          message: `The FEATURE "${permMeta.label}" was enabled for ${currentRole.label} inside ${permMeta.parentTabLabels?.join(' & ') || 'tab'}.`,
        })
      }
    }

    if (currentUser?.role === roleKey && typeof onSimulateUser === 'function') {
      onSimulateUser({
        ...currentUser,
        permissions: nextPerms,
      })
    }
  }

  const handleToggleAccountPermission = (targetUser, permKey) => {
    const currentPerms = getUserEffectivePermissions(targetUser, roles)
    const isCurrentlyGranted = currentPerms.includes(permKey)
    const permMeta = getPermissionMeta(permKey)
    const isTab = permMeta.type === 'tab'
    const isFeature = permMeta.type === 'feature'

    if (!isCurrentlyGranted && isFeature) {
      if (areFeatureParentTabsDisabled(permKey, currentPerms)) {
        showNotification({
          type: 'warning',
          title: '🚫 FEATURE CANNOT BE ENABLED',
          message: `The FEATURE "${permMeta.label}" cannot be enabled for @${targetUser.username} (${targetUser.name}) because its parent workspace tab is DISABLED (${permMeta.parentTabLabels?.join(' or ')}). Please enable the corresponding workspace tab above for this account first!`,
        })
        return
      }
    }

    let nextPerms = []
    let autoDisabledFeatures = []

    if (isCurrentlyGranted) {
      if (isTab) {
        autoDisabledFeatures = getAffectedFeaturesWhenTabDisabled(permKey, currentPerms)
        const autoDisabledKeys = autoDisabledFeatures.map((f) => f.key)
        nextPerms = currentPerms.filter((p) => p !== permKey && !autoDisabledKeys.includes(p))
      } else {
        nextPerms = currentPerms.filter((p) => p !== permKey)
      }
    } else {
      nextPerms = [...currentPerms, permKey]
    }

    setUserCustomPermissions(targetUser.username, nextPerms)
    setAccountPermsRev((prev) => prev + 1)

    if (isCurrentlyGranted) {
      if (isTab) {
        addAuditLog(
          'RBAC_USER_TAB_DISABLED',
          `Workspace TAB "${permMeta.label}" was DISABLED for account @${targetUser.username}`,
          currentUser?.username || 'admin',
          'warning'
        )
        if (autoDisabledFeatures.length > 0) {
          showNotification({
            type: 'warning',
            title: '⚠️ TAB DISABLED',
            message: `The workspace TAB "${permMeta.label}" was DISABLED for @${targetUser.username}. The dependent feature(s) inside (${autoDisabledFeatures.map((f) => `"${f.label}"`).join(', ')}) were automatically disabled because their parent tab is closed in sidebar navigation.`,
          })
        } else {
          showNotification({
            type: 'info',
            title: '❌ TAB DISABLED',
            message: `The workspace TAB "${permMeta.label}" was disabled for @${targetUser.username} and removed from their sidebar navigation.`,
          })
        }
      } else {
        addAuditLog(
          'RBAC_USER_FEATURE_DISABLED',
          `In-tab FEATURE "${permMeta.label}" was DISABLED for account @${targetUser.username}`,
          currentUser?.username || 'admin',
          'info'
        )
        showNotification({
          type: 'info',
          title: '❌ FEATURE DISABLED',
          message: `The FEATURE "${permMeta.label}" was disabled for @${targetUser.username} (${targetUser.name}).`,
        })
      }
    } else {
      if (isTab) {
        addAuditLog(
          'RBAC_USER_TAB_ENABLED',
          `Workspace TAB "${permMeta.label}" was ENABLED for account @${targetUser.username}`,
          currentUser?.username || 'admin',
          'success'
        )
        showNotification({
          type: 'success',
          title: '✅ TAB ENABLED',
          message: `The workspace TAB "${permMeta.label}" was enabled for @${targetUser.username} and is now accessible in their sidebar navigation!`,
        })
      } else {
        addAuditLog(
          'RBAC_USER_FEATURE_ENABLED',
          `In-tab FEATURE "${permMeta.label}" was ENABLED for account @${targetUser.username}`,
          currentUser?.username || 'admin',
          'success'
        )
        showNotification({
          type: 'success',
          title: '✅ FEATURE ENABLED',
          message: `The FEATURE "${permMeta.label}" was enabled for @${targetUser.username} inside ${permMeta.parentTabLabels?.join(' & ') || 'tab'}.`,
        })
      }
    }

    if (currentUser?.username?.toLowerCase() === targetUser.username?.toLowerCase() && typeof onSimulateUser === 'function') {
      onSimulateUser({
        ...currentUser,
        permissions: nextPerms,
      })
    }
  }

  const handleResetAccountPermissions = (targetUser) => {
    clearUserCustomPermissions(targetUser.username)
    setAccountPermsRev((prev) => prev + 1)
    const roleDef = roles[targetUser.role] || DEFAULT_ROLES[targetUser.role]
    showNotification(`Reset @${targetUser.username} to standard ${roleDef?.label || targetUser.role} permissions.`)

    if (currentUser?.username?.toLowerCase() === targetUser.username?.toLowerCase() && typeof onSimulateUser === 'function') {
      onSimulateUser({
        ...currentUser,
        permissions: roleDef?.permissions || [],
      })
    }
  }

  const [showResetRolesConfirm, setShowResetRolesConfirm] = useState(false)
  const [isResettingRoles, setIsResettingRoles] = useState(false)

  const handleResetRoles = () => {
    setShowResetRolesConfirm(true)
  }

  const handleConfirmResetRoles = async () => {
    setIsResettingRoles(true)
    setRoles(DEFAULT_ROLES)
    await saveRbacRoles(DEFAULT_ROLES)
    setIsResettingRoles(false)
    setShowResetRolesConfirm(false)
    showNotification('Role permissions restored to factory defaults.')
  }

  return (
    <div className="rbac-management-view">
      {}
      <div className="rbac-header-card">
        <div className="rbac-header-titles">
          <div className="rbac-eyebrow-chip">
            <SvgIcon name="shieldCheck" size={13} />
            <span>ROLE-BASED ACCESS CONTROL &bull; RBAC</span>
          </div>
          <h2>User Credentials &amp; Access Control</h2>
          <p>
            Configure workstation credentials, manage operational privilege tiers, and enforce 256-bit secure access.
          </p>
        </div>

        <div className="rbac-header-actions">
          {isSupabaseConfigured && (
            <button
              type="button"
              className={`rbac-supabase-sync-btn status-${supabaseSyncStatus}`}
              onClick={() => setShowSqlModal(true)}
              title="View cloud database configuration & SQL schema"
            >
              <span className={`sync-status-dot status-${supabaseSyncStatus}`} />
              <span>
                {supabaseSyncStatus === 'connected'
                  ? 'Cloud Directory: Live'
                  : supabaseSyncStatus === 'table_missing'
                  ? 'Setup Cloud Directory (SQL)'
                  : 'Cloud Syncing...'}
              </span>
            </button>
          )}

          <button
            type="button"
            className="rbac-primary-btn"
            onClick={() => setIsAddModalOpen(true)}
          >
            <SvgIcon name="userPlus" size={15} />
            <span>Add User Credential</span>
          </button>
        </div>
      </div>

      {feedbackNotice && (
        <div
          className={`rbac-feedback-toast toast-${typeof feedbackNotice === 'object' ? feedbackNotice.type || 'info' : 'info'}`}
          role="status"
        >
          <div className="toast-icon-wrap">
            <SvgIcon
              name={
                typeof feedbackNotice === 'object' &&
                (feedbackNotice.type === 'warning' || feedbackNotice.type === 'error')
                  ? 'alertTriangle'
                  : typeof feedbackNotice === 'object' && feedbackNotice.type === 'info'
                  ? 'info'
                  : 'checkCircle'
              }
              size={18}
            />
          </div>
          <div className="toast-content-wrap">
            {typeof feedbackNotice === 'object' && feedbackNotice.title && (
              <strong className="toast-title">{feedbackNotice.title}</strong>
            )}
            <p className="toast-message">
              {typeof feedbackNotice === 'object' ? feedbackNotice.message : feedbackNotice}
            </p>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setFeedbackNotice(null)}
            title="Dismiss notification"
          >
            <SvgIcon name="x" size={13} />
          </button>
        </div>
      )}

      {}
      {canSwitchAccounts && (
        <div className="rbac-simulator-bar">
          <div className="simulator-label-group">
            <span className="simulator-pulse-dot" />
            <span className="simulator-title">Active Session Account:</span>
            <div className="simulator-current-user">
              <strong>{currentUser?.name || 'Administrator'}</strong>
              <span className="simulator-role-chip">{currentUser?.roleLabel || currentUser?.role || 'Admin'}</span>
            </div>
          </div>
          <div className="simulator-quick-buttons">
            <span className="simulator-quick-label">Switch Test Account:</span>
            {users.slice(0, 5).map((u) => {
              const isCurrent = currentUser?.username?.toLowerCase() === u.username.toLowerCase()
              const uPerms = getUserEffectivePermissions(u, roles)
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`simulator-account-btn ${isCurrent ? 'is-active' : ''}`}
                  onClick={() => {
                    const rDef = roles[u.role] || DEFAULT_ROLES[u.role] || DEFAULT_ROLES.staff
                    const isTargetAdmin = u.role === 'admin'
                    if (typeof onSimulateUser === 'function') {
                      onSimulateUser({
                        username: u.username,
                        name: u.name,
                        role: u.role,
                        roleLabel: rDef.label,
                        roleBadge: rDef.badge,
                        branch: u.branch,
                        avatar: u.avatar || u.name.substring(0, 2).toUpperCase(),
                        token: 'rbac-token-' + u.id,
                        loginTime: new Date().toISOString(),
                        permissions: uPerms,
                        simulatedFromAdmin: !isTargetAdmin,
                      })
                      showNotification(`Switched active session to @${u.username} (${rDef.label})`)
                    }
                  }}
                  title={`Switch active test session to @${u.username} (${u.role}) - ${uPerms.length}/6 permissions enabled`}
                >
                  <span className="sim-btn-avatar">{u.avatar || u.name.substring(0, 2).toUpperCase()}</span>
                  <span className="sim-btn-name">{u.name.split(' ')[0]}</span>
                  <span className="sim-btn-role">({u.role})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {}
      <div className="rbac-nav-tabs-bar">
        <div className="rbac-tabs-left">
          <button
            type="button"
            className={`rbac-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <SvgIcon name="users" size={15} />
            <span>User Credentials</span>
            <span className="rbac-count-badge">{users.length}</span>
          </button>

          <button
            type="button"
            className={`rbac-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <SvgIcon name="key" size={15} />
            <span>Role Permissions Matrix</span>
          </button>

          <button
            type="button"
            className={`rbac-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <SvgIcon name="activity" size={15} />
            <span>Security &amp; Audit Trail</span>
            <span className="rbac-count-badge">{auditLogs.length}</span>
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="rbac-tab-filters">
            <div className="rbac-search-box">
              <SvgIcon name="search" size={14} />
              <input
                type="text"
                placeholder="Search by name, ID or branch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="rbac-clear-search-btn"
                  onClick={() => setSearchQuery('')}
                >
                  <SvgIcon name="x" size={12} />
                </button>
              )}
            </div>

            <select
              className="rbac-role-filter-select"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">All Roles ({users.length})</option>
              <option value="active_only">✅ Active Only</option>
              <option value="suspended_only">🚫 Deactivated Only</option>
              <option value="admin">Administrators</option>
              <option value="accountant">Head Cashiers</option>
              <option value="supervisor">Branch Supervisors</option>
              <option value="staff">Terminal Staff</option>
            </select>
          </div>
        )}
      </div>

      {}
      {}
      {}
      {activeTab === 'users' && (
        <div className="rbac-content-container">
          <div className="rbac-users-grid">
            {filteredUsers.map((user) => {
              const roleDef = roles[user.role] || DEFAULT_ROLES[user.role] || DEFAULT_ROLES.staff
              const isCurrentActive = currentUser?.username === user.username

              return (
                <div
                  key={user.id}
                  className={`rbac-user-card ${isCurrentActive ? 'is-active-session' : ''} ${
                    user.status === 'suspended' ? 'is-suspended' : ''
                  }`}
                >
                  <div className="rbac-user-card-header">
                    <div
                      className="rbac-user-avatar"
                      style={{
                        background: roleDef.bgColor,
                        color: roleDef.color,
                        borderColor: roleDef.borderColor,
                      }}
                    >
                      {user.avatar || user.name.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="rbac-user-header-meta">
                      <div className="rbac-user-name-row">
                        <strong className="rbac-user-fullname">{user.name}</strong>
                        {isCurrentActive && (
                          <span className="rbac-active-session-chip">Active Session</span>
                        )}
                      </div>
                      <span className="rbac-user-username">@{user.username}</span>
                    </div>

                    <div className="rbac-user-status-dot-wrap" title={`Status: ${user.status}`}>
                      <span className={`rbac-status-dot ${user.status}`} />
                    </div>
                  </div>

                  <div className="rbac-user-role-badge-row">
                    <span
                      className="rbac-role-pill"
                      style={{
                        color: roleDef.color,
                        background: roleDef.bgColor,
                        borderColor: roleDef.borderColor,
                      }}
                    >
                      <SvgIcon name="shieldCheck" size={12} />
                      {roleDef.label}
                    </span>
                    <span className="rbac-branch-pill">📍 {user.branch}</span>
                  </div>

                  <div className="rbac-user-card-body">
                    <div className="rbac-credential-detail-row">
                      <span className="rbac-detail-label">Access ID:</span>
                      <code className="rbac-detail-value">{user.username}</code>
                    </div>

                    <div className="rbac-credential-detail-row">
                      <span className="rbac-detail-label">Password:</span>
                      <span className="rbac-password-mask">••••••••••••</span>
                    </div>

                    <div className="rbac-credential-detail-row">
                      <span className="rbac-detail-label">Last Active:</span>
                      <span className="rbac-detail-subtext">{user.lastLogin || 'Never'}</span>
                    </div>
                  </div>

                  <div className="rbac-user-card-footer">
                    {canSwitchAccounts && (
                      <button
                        type="button"
                        className="rbac-simulate-user-btn"
                        onClick={() => {
                          if (typeof onSimulateUser === 'function') {
                            const isTargetAdmin = user.role === 'admin'
                            onSimulateUser({
                              username: user.username,
                              name: user.name,
                              role: user.role,
                              roleLabel: roleDef.label,
                              roleBadge: roleDef.badge,
                              branch: user.branch,
                              avatar: user.avatar,
                              token: 'rbac-token-' + user.id,
                              loginTime: new Date().toISOString(),
                              simulatedFromAdmin: !isTargetAdmin,
                            })
                            showNotification(`Switched active session to @${user.username} (${roleDef.label})`)
                          }
                        }}
                        title="Instantly test dashboard and permissions as this user"
                      >
                        <SvgIcon name="logIn" size={13} />
                        <span>{isCurrentActive ? 'Current Session' : 'Login as User'}</span>
                      </button>
                    )}

                    <div className="rbac-card-manage-btns">
                      <button
                        type="button"
                        className="rbac-icon-btn edit-btn"
                        onClick={() => setEditingUser({ ...user })}
                        title="Edit credentials and role"
                      >
                        <SvgIcon name="edit" size={14} />
                      </button>

                      {user.username !== 'admin' && (
                        <button
                          type="button"
                          className={`rbac-icon-btn ${user.status === 'suspended' ? 'activate-btn' : 'deactivate-btn'}`}
                          onClick={() => handleToggleUserStatus(user)}
                          title={user.status === 'suspended' ? 'Reactivate account' : 'Deactivate account'}
                        >
                          <SvgIcon name={user.status === 'suspended' ? 'checkCircle' : 'slashCircle'} size={14} />
                        </button>
                      )}

                      {user.username !== 'admin' && (
                        <button
                          type="button"
                          className="rbac-icon-btn delete-btn"
                          onClick={() => setDeletingUser(user)}
                          title="Delete user credential"
                        >
                          <SvgIcon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredUsers.length === 0 && (
            <div className="rbac-empty-state">
              <SvgIcon name="users" size={32} />
              <p>No user credentials match your search criteria.</p>
              <button
                type="button"
                className="rbac-clear-search-pill"
                onClick={() => {
                  setSearchQuery('')
                  setFilterRole('all')
                }}
              >
                Reset Search Filters
              </button>
            </div>
          )}
        </div>
      )}

      {}
      {}
      {}
      {activeTab === 'matrix' && (
        <div className="rbac-matrix-container">
          <div className="rbac-matrix-header-box">
            <div>
              <h3>Role &amp; Account Capabilities Matrix</h3>
              <p>
                Configure operational permissions by role tier or customize access specifically per individual account.
              </p>
            </div>
            <div className="rbac-matrix-header-right">
              {isSupabaseConfigured && (
                <div className="rbac-cloud-matrix-badge" title="Role and account permissions are synced live in Cloud Database">
                  <span className="sync-status-dot status-connected" />
                  <span>Cloud Synced Online</span>
                </div>
              )}
              <button
                type="button"
                className="rbac-secondary-btn"
                onClick={async () => {
                  showNotification('Syncing latest permissions from Cloud Database...', 'info', 'Cloud Sync')
                  const res = await syncMatrixPermissionsFromSupabase()
                  if (res.success) {
                    showNotification('Cloud permissions successfully synced and applied!', 'success', 'Synced')
                  } else {
                    showNotification('Using cached local permissions.', 'info', 'Sync Status')
                  }
                }}
                title="Synchronize latest permissions from Cloud Database"
              >
                <SvgIcon name="refresh" size={14} />
                <span>Sync Cloud</span>
              </button>
              <button
                type="button"
                className="rbac-secondary-btn"
                onClick={handleResetRoles}
                title="Restore matrix to factory default permissions"
              >
                <SvgIcon name="refresh" size={14} />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>

          {}
          <div className="rbac-matrix-mode-bar">
            <div className="matrix-mode-toggle-group">
              <button
                type="button"
                className={`matrix-mode-btn ${matrixViewMode === 'roles' ? 'active' : ''}`}
                onClick={() => setMatrixViewMode('roles')}
              >
                <SvgIcon name="shieldCheck" size={13} />
                <span>By Role Tier ({Object.keys(roles).length})</span>
              </button>
              <button
                type="button"
                className={`matrix-mode-btn ${matrixViewMode === 'accounts' ? 'active' : ''}`}
                onClick={() => setMatrixViewMode('accounts')}
              >
                <SvgIcon name="users" size={13} />
                <span>By Specific Account ({users.length})</span>
              </button>
            </div>
            <span className="matrix-mode-hint">
              {matrixViewMode === 'roles'
                ? '⚡ Toggling a capability updates all accounts assigned to that role tier.'
                : '🎯 Toggling a capability customizes access specifically for that individual user account.'}
            </span>
          </div>

          {matrixViewMode === 'roles' ? (
            <div className="rbac-matrix-table-wrap">
              <table className="rbac-matrix-table">
                <thead>
                  <tr>
                    <th className="perm-header-col">System Capability</th>
                    {Object.keys(roles).map((rKey) => {
                      const r = roles[rKey]
                      const assignedUsers = users.filter((u) => u.role === rKey)
                      const isUserRole = currentUser?.role === rKey

                      return (
                        <th key={rKey} className={`role-col-header ${isUserRole ? 'is-current-user-role' : ''}`}>
                          <div
                            className="role-header-chip"
                            style={{
                              color: r.color,
                              background: r.bgColor,
                              borderColor: r.borderColor,
                            }}
                          >
                            <SvgIcon name="shieldCheck" size={12} />
                            <span>{r.label}</span>
                          </div>
                          <div className="role-assigned-accounts-list">
                            <span className="role-accounts-count">{assignedUsers.length} accounts:</span>
                            {assignedUsers.map((u) => (
                              <span key={u.id} className="role-user-tag" title={`@${u.username}`}>
                                {u.name.split(' ')[0]}
                              </span>
                            ))}
                            {assignedUsers.length === 0 && <span className="no-accounts-tag">No accounts</span>}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {}
                  <tr className="matrix-section-divider-row section-tabs-row">
                    <td colSpan={1 + Object.keys(roles).length}>
                      <div className="matrix-section-banner">
                        <div className="section-banner-title">
                          <SvgIcon name="folder" size={15} />
                          <span>📁 WORKSPACE TABS (Sidebar Navigation)</span>
                        </div>
                        <span className="section-banner-desc">
                          Controls which workspace menus appear in the left sidebar navigation.
                        </span>
                      </div>
                    </td>
                  </tr>

                  {tabPerms.map((perm) => (
                    <tr key={perm.key} className="matrix-perm-row perm-kind-tab-row">
                      <td className="perm-cell-label perm-type-tab">
                        <div className="perm-title-row">
                          <span className="perm-kind-badge kind-tab" title="Sidebar Workspace Tab">
                            <SvgIcon name="folder" size={11} /> TAB
                          </span>
                          <strong className="perm-title-text">{perm.label}</strong>
                        </div>
                        <span className="perm-group-tag">
                          Sidebar Menu: <code>{perm.tabName}</code> &bull; <code>{perm.key}</code>
                        </span>
                        {perm.description && (
                          <span className="perm-desc-hint">{perm.description}</span>
                        )}
                      </td>
                      {Object.keys(roles).map((rKey) => {
                        const r = roles[rKey]
                        const isGranted = (r.permissions || []).includes(perm.key)

                        return (
                          <td key={`${rKey}-${perm.key}`} className="matrix-check-cell">
                            <label
                              className={`ios-switch-cell ${isGranted ? 'is-granted' : 'is-denied'}`}
                              title={`Click to toggle workspace tab "${perm.label}" for all ${r.label} accounts`}
                            >
                              <input
                                type="checkbox"
                                className="ios-switch-input"
                                checked={isGranted}
                                onChange={() => handleTogglePermission(rKey, perm.key)}
                              />
                              <span className="ios-switch-control">
                                <span className="ios-switch-track">
                                  <span className="ios-switch-thumb" />
                                </span>
                                <span className="ios-switch-state-text">{isGranted ? 'ON' : 'OFF'}</span>
                              </span>
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {}
                  <tr className="matrix-section-divider-row section-features-row">
                    <td colSpan={1 + Object.keys(roles).length}>
                      <div className="matrix-section-banner">
                        <div className="section-banner-title">
                          <SvgIcon name="tool" size={15} />
                          <span>⚙️ IN-TAB FEATURES (Operations &amp; Tools Inside Tabs)</span>
                        </div>
                        <span className="section-banner-desc">
                          Operational actions and tools inside workspaces. Cannot be enabled if parent tab is disabled.
                        </span>
                      </div>
                    </td>
                  </tr>

                  {featurePerms.map((perm) => (
                    <tr key={perm.key} className="matrix-perm-row perm-kind-feature-row">
                      <td className="perm-cell-label perm-type-feature">
                        <div className="perm-title-row">
                          <span className="perm-kind-badge kind-feature" title="In-Tab Action & Tool">
                            <SvgIcon name="tool" size={11} /> FEATURE
                          </span>
                          <strong className="perm-title-text">{perm.label}</strong>
                        </div>
                        <div className="perm-parent-link-row">
                          <span className="perm-parent-label">📍 Belongs to Tab:</span>
                          <div className="perm-parent-pills">
                            {perm.parentTabLabels?.map((label, idx) => (
                              <span key={idx} className="perm-parent-pill">{label}</span>
                            ))}
                          </div>
                        </div>
                        {perm.description && (
                          <span className="perm-desc-hint">{perm.description}</span>
                        )}
                      </td>
                      {Object.keys(roles).map((rKey) => {
                        const r = roles[rKey]
                        const isGranted = (r.permissions || []).includes(perm.key)
                        const isParentDisabled = areFeatureParentTabsDisabled(perm.key, r.permissions || [])

                        return (
                          <td key={`${rKey}-${perm.key}`} className="matrix-check-cell">
                            <label
                              className={`ios-switch-cell ${isGranted ? 'is-granted' : 'is-denied'} ${isParentDisabled ? 'is-parent-disabled' : ''}`}
                              title={
                                isParentDisabled
                                  ? `⚠️ Parent tab is disabled (${perm.parentTabLabels?.join(' or ')}). Please enable the corresponding workspace tab above to use this feature!`
                                  : `Click to toggle feature "${perm.label}" for all ${r.label} accounts`
                              }
                            >
                              <input
                                type="checkbox"
                                className="ios-switch-input"
                                checked={isGranted}
                                onChange={() => handleTogglePermission(rKey, perm.key)}
                              />
                              <span className="ios-switch-control">
                                <span className="ios-switch-track">
                                  <span className="ios-switch-thumb" />
                                </span>
                                <span className="ios-switch-state-text">{isGranted ? 'ON' : 'OFF'}</span>
                              </span>
                              {isParentDisabled && (
                                <span className="cell-parent-disabled-hint">⚠️ Tab Disabled</span>
                              )}
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rbac-matrix-table-wrap">
              <table className="rbac-matrix-table account-matrix-table">
                <thead>
                  <tr>
                    <th className="perm-header-col">System Capability</th>
                    {users.map((u) => {
                      const r = roles[u.role] || DEFAULT_ROLES[u.role] || DEFAULT_ROLES.staff
                      const hasCustom = Boolean(getUserCustomPermissions(u.username))
                      const isCurrent = currentUser?.username?.toLowerCase() === u.username.toLowerCase()

                      return (
                        <th key={u.id} className={`role-col-header user-col-header ${isCurrent ? 'is-active-col' : ''}`}>
                          <div className="user-header-box">
                            <div className="user-header-top">
                              <span className="user-header-avatar">{u.avatar || u.name.substring(0, 2).toUpperCase()}</span>
                              <div className="user-header-identity">
                                <strong>{u.name}</strong>
                                <code>@{u.username}</code>
                              </div>
                            </div>
                            <div className="user-header-tags">
                              <span
                                className="user-header-role"
                                style={{
                                  color: r.color,
                                  background: r.bgColor,
                                  borderColor: r.borderColor,
                                }}
                              >
                                {r.label}
                              </span>
                              {hasCustom ? (
                                <div className="custom-override-group">
                                  <span className="custom-override-tag">Custom Overrides</span>
                                  <button
                                    type="button"
                                    className="user-reset-perm-btn"
                                    onClick={() => handleResetAccountPermissions(u)}
                                    title="Revert this account back to standard role defaults"
                                  >
                                    Reset
                                  </button>
                                </div>
                              ) : (
                                <span className="role-default-tag">Role Defaults</span>
                              )}
                            </div>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {}
                  <tr className="matrix-section-divider-row section-tabs-row">
                    <td colSpan={1 + users.length}>
                      <div className="matrix-section-banner">
                        <div className="section-banner-title">
                          <SvgIcon name="folder" size={15} />
                          <span>📁 WORKSPACE TABS (Sidebar Navigation)</span>
                        </div>
                        <span className="section-banner-desc">
                          Controls which workspace menus appear in each user account's sidebar navigation.
                        </span>
                      </div>
                    </td>
                  </tr>

                  {tabPerms.map((perm) => (
                    <tr key={perm.key} className="matrix-perm-row perm-kind-tab-row">
                      <td className="perm-cell-label perm-type-tab">
                        <div className="perm-title-row">
                          <span className="perm-kind-badge kind-tab" title="Sidebar Workspace Tab">
                            <SvgIcon name="folder" size={11} /> TAB
                          </span>
                          <strong className="perm-title-text">{perm.label}</strong>
                        </div>
                        <span className="perm-group-tag">
                          Sidebar Menu: <code>{perm.tabName}</code> &bull; <code>{perm.key}</code>
                        </span>
                        {perm.description && (
                          <span className="perm-desc-hint">{perm.description}</span>
                        )}
                      </td>
                      {users.map((u) => {
                        const userEffectivePerms = getUserEffectivePermissions(u, roles)
                        const isGranted = userEffectivePerms.includes(perm.key)
                        const hasCustom = Boolean(getUserCustomPermissions(u.username))

                        return (
                          <td key={`${u.id}-${perm.key}`} className="matrix-check-cell">
                            <label
                              className={`ios-switch-cell ${isGranted ? 'is-granted' : 'is-denied'} ${hasCustom ? 'is-custom-override' : ''}`}
                              title={`Click to toggle workspace tab "${perm.label}" specifically for ${u.name} (@${u.username})`}
                            >
                              <input
                                type="checkbox"
                                className="ios-switch-input"
                                checked={isGranted}
                                onChange={() => handleToggleAccountPermission(u, perm.key)}
                              />
                              <span className="ios-switch-control">
                                <span className="ios-switch-track">
                                  <span className="ios-switch-thumb" />
                                </span>
                                <span className="ios-switch-state-text">{isGranted ? 'ON' : 'OFF'}</span>
                              </span>
                              {hasCustom && (
                                <span className="custom-override-dot" title="Custom override for this account" />
                              )}
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {}
                  <tr className="matrix-section-divider-row section-features-row">
                    <td colSpan={1 + users.length}>
                      <div className="matrix-section-banner">
                        <div className="section-banner-title">
                          <SvgIcon name="tool" size={15} />
                          <span>⚙️ IN-TAB FEATURES (Operations &amp; Tools Inside Tabs)</span>
                        </div>
                        <span className="section-banner-desc">
                          Operational actions and tools inside workspaces. Cannot be enabled if parent tab is disabled.
                        </span>
                      </div>
                    </td>
                  </tr>

                  {featurePerms.map((perm) => (
                    <tr key={perm.key} className="matrix-perm-row perm-kind-feature-row">
                      <td className="perm-cell-label perm-type-feature">
                        <div className="perm-title-row">
                          <span className="perm-kind-badge kind-feature" title="In-Tab Action & Tool">
                            <SvgIcon name="tool" size={11} /> FEATURE
                          </span>
                          <strong className="perm-title-text">{perm.label}</strong>
                        </div>
                        <div className="perm-parent-link-row">
                          <span className="perm-parent-label">📍 Belongs to Tab:</span>
                          <div className="perm-parent-pills">
                            {perm.parentTabLabels?.map((label, idx) => (
                              <span key={idx} className="perm-parent-pill">{label}</span>
                            ))}
                          </div>
                        </div>
                        {perm.description && (
                          <span className="perm-desc-hint">{perm.description}</span>
                        )}
                      </td>
                      {users.map((u) => {
                        const userEffectivePerms = getUserEffectivePermissions(u, roles)
                        const isGranted = userEffectivePerms.includes(perm.key)
                        const hasCustom = Boolean(getUserCustomPermissions(u.username))
                        const isParentDisabled = areFeatureParentTabsDisabled(perm.key, userEffectivePerms)

                        return (
                          <td key={`${u.id}-${perm.key}`} className="matrix-check-cell">
                            <label
                              className={`ios-switch-cell ${isGranted ? 'is-granted' : 'is-denied'} ${hasCustom ? 'is-custom-override' : ''} ${isParentDisabled ? 'is-parent-disabled' : ''}`}
                              title={
                                isParentDisabled
                                  ? `⚠️ Parent tab is disabled (${perm.parentTabLabels?.join(' or ')}). Please enable the corresponding workspace tab for @${u.username} first!`
                                  : `Click to toggle feature "${perm.label}" specifically for ${u.name} (@${u.username})`
                              }
                            >
                              <input
                                type="checkbox"
                                className="ios-switch-input"
                                checked={isGranted}
                                onChange={() => handleToggleAccountPermission(u, perm.key)}
                              />
                              <span className="ios-switch-control">
                                <span className="ios-switch-track">
                                  <span className="ios-switch-thumb" />
                                </span>
                                <span className="ios-switch-state-text">{isGranted ? 'ON' : 'OFF'}</span>
                              </span>
                              {isParentDisabled && (
                                <span className="cell-parent-disabled-hint">⚠️ Tab Disabled</span>
                              )}
                              {hasCustom && !isParentDisabled && (
                                <span className="custom-override-dot" title="Custom override for this account" />
                              )}
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {}
      {}
      {}
      {activeTab === 'logs' && (
        <div className="rbac-audit-container">
          <div className="rbac-audit-header-box">
            <div>
              <h3>Security &amp; Operational Audit Trail</h3>
              <p>Cryptographically recorded credential events, authentication gateways, and role reassignments.</p>
            </div>
            <span className="rbac-audit-ssl-seal">
              <SvgIcon name="lock" size={13} /> 256-Bit SSL Enforced
            </span>
          </div>

          <div className="rbac-logs-list">
            {auditLogs.map((log) => (
              <div key={log.id} className={`rbac-log-card severity-${log.severity || 'info'}`}>
                <div className="rbac-log-timestamp">
                  <span className="log-time">{log.timestamp}</span>
                  <span className="log-actor">@{log.actor}</span>
                </div>
                <div className="rbac-log-body">
                  <span className="rbac-log-action-tag">{log.action}</span>
                  <p className="rbac-log-details">{log.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      {}
      {}
      {isAddModalOpen && (
        <div
          className="rbac-modal-backdrop"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="rbac-modal-window"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rbac-modal-header">
              <div className="rbac-modal-icon-badge">
                <SvgIcon name="userPlus" size={18} />
              </div>
              <div>
                <h3>Add User Credential</h3>
                <p>Register new staff access ID with role-based permissions.</p>
              </div>
              <button
                type="button"
                className="rbac-modal-close-btn"
                onClick={() => setIsAddModalOpen(false)}
              >
                <SvgIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="rbac-modal-form">
              <div className="rbac-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Maria Clara Santos"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="rbac-form-group">
                <label>Username / Access ID</label>
                <input
                  type="text"
                  placeholder="e.g. maria.accountant"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
                <small className="rbac-field-hint">Used for sign in. Lowercase letters, numbers, dots.</small>
              </div>

              <div className="rbac-form-group">
                <div className="rbac-field-label-row">
                  <label>Initial Password</label>
                  <button
                    type="button"
                    className="rbac-password-gen-btn"
                    onClick={handleGeneratePassword}
                  >
                    Generate Secure
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Enter or generate password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>

              <div className="rbac-form-row-2col">
                <div className="rbac-form-group">
                  <label>Assign Role (RBAC)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="accountant">Head Cashier</option>
                    <option value="supervisor">Branch Supervisor</option>
                    <option value="staff">Terminal Staff</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>

                <div className="rbac-form-group">
                  <label>Branch / Station</label>
                  <input
                    type="text"
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    placeholder="e.g. LDN Branch"
                  />
                </div>
              </div>

              <div className="rbac-form-row-2col">
                <div className="rbac-form-group">
                  <label>Account Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">Active (Access Allowed)</option>
                    <option value="suspended">Suspended (Blocked)</option>
                  </select>
                </div>

                <div className="rbac-form-group">
                  <label>Email Notification (Optional)</label>
                  <input
                    type="email"
                    placeholder="user@luckybetplay.ph"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="rbac-modal-footer">
                <button
                  type="button"
                  className="rbac-secondary-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="rbac-primary-btn">
                  Save Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {}
      {}
      {}
      {editingUser && (
        <div
          className="rbac-modal-backdrop"
          onClick={() => setEditingUser(null)}
        >
          <div
            className="rbac-modal-window"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rbac-modal-header">
              <div className="rbac-modal-icon-badge">
                <SvgIcon name="edit" size={18} />
              </div>
              <div>
                <h3>Edit User Credential</h3>
                <p>Modify settings for @{editingUser.username}</p>
              </div>
              <button
                type="button"
                className="rbac-modal-close-btn"
                onClick={() => setEditingUser(null)}
              >
                <SvgIcon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="rbac-modal-form">
              <div className="rbac-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  required
                />
              </div>

              <div className="rbac-form-group">
                <label>Password (Leave as is to keep existing)</label>
                <input
                  type="text"
                  value={editingUser.password}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  required
                />
              </div>

              <div className="rbac-form-row-2col">
                <div className="rbac-form-group">
                  <label>Role</label>
                  <select
                    value={editingUser.role}
                    disabled={editingUser.username === 'admin'}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    <option value="accountant">Head Cashier</option>
                    <option value="supervisor">Branch Supervisor</option>
                    <option value="staff">Terminal Staff</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>

                <div className="rbac-form-group">
                  <label>Branch / Station</label>
                  <input
                    type="text"
                    value={editingUser.branch}
                    onChange={(e) => setEditingUser({ ...editingUser, branch: e.target.value })}
                  />
                </div>
              </div>

              <div className="rbac-form-group">
                <label>Status</label>
                <select
                  value={editingUser.status}
                  disabled={editingUser.username === 'admin'}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="rbac-modal-footer">
                <button
                  type="button"
                  className="rbac-secondary-btn"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="rbac-primary-btn">
                  Update Credential
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {}
      {}
      {}
      {deletingUser && (
        <div
          className="rbac-modal-backdrop"
          onClick={() => setDeletingUser(null)}
        >
          <div
            className="rbac-modal-window modal-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rbac-modal-header">
              <div className="rbac-modal-icon-badge danger">
                <SvgIcon name="trash" size={18} />
              </div>
              <div>
                <h3>Delete Credential?</h3>
                <p>Are you sure you want to remove <strong>@{deletingUser.username}</strong>?</p>
              </div>
            </div>

            <div className="rbac-confirm-body">
              <p>
                Revoking access for <strong>{deletingUser.name}</strong> ({deletingUser.roleLabel}) will immediately disconnect their workstation. This action is recorded in the security audit trail.
              </p>
            </div>

            <div className="rbac-modal-footer">
              <button
                type="button"
                className="rbac-secondary-btn"
                onClick={() => setDeletingUser(null)}
                disabled={isDeleting}
              >
                Keep Account
              </button>
              <button
                type="button"
                className="rbac-danger-btn"
                onClick={handleDeleteUser}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Revoke & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {}
      {}
      {showSqlModal && (
        <div className="rbac-modal-backdrop" onClick={() => setShowSqlModal(false)}>
          <div className="rbac-modal-window modal-sql-setup" onClick={(e) => e.stopPropagation()}>
            <div className="rbac-modal-header">
              <div className="rbac-modal-icon-badge info">
                <SvgIcon name="shieldCheck" size={18} />
              </div>
              <div>
                <h3>Cloud Directory Table Setup</h3>
                <p>Run this SQL script in your database console to activate dedicated cloud logins</p>
              </div>
            </div>

            <div className="rbac-sql-modal-body">
              <div className="sql-instruction-step">
                <strong>How to setup in 1 minute:</strong>
                <ol>
                  <li>Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase Dashboard</a> and go to the <strong>SQL Editor</strong>.</li>
                  <li>Click <strong>New Query</strong>, paste the script below, and click <strong>Run</strong>.</li>
                  <li>Once created, this workstation will automatically authenticate accounts directly from your cloud directory!</li>
                </ol>
              </div>
              <div className="sql-code-box">
                <pre>{SQL_SCRIPT_TEXT}</pre>
              </div>
            </div>

            <div className="rbac-modal-footer">
              <button
                type="button"
                className="rbac-secondary-btn"
                onClick={() => setShowSqlModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="rbac-primary-btn"
                onClick={() => {
                  navigator.clipboard.writeText(SQL_SCRIPT_TEXT)
                  showNotification('SQL Script copied to clipboard!')
                }}
              >
                <SvgIcon name="check" size={14} />
                Copy SQL Script
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      <ConfirmActionModal
        isOpen={showResetRolesConfirm}
        title="Reset Role Permissions Matrix?"
        message="Are you sure you want to reset the role permissions matrix back to default authorized settings? This will restore factory defaults for all roles."
        confirmText="Yes, Reset Matrix"
        cancelText="Cancel"
        confirmVariant="warning"
        isProcessing={isResettingRoles}
        processingText="Resetting Permissions..."
        onConfirm={handleConfirmResetRoles}
        onCancel={() => !isResettingRoles && setShowResetRolesConfirm(false)}
      />
    </div>
  )
}
