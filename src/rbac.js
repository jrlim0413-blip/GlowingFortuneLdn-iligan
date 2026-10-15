import { saveSupabaseMatrixConfig } from './supabase.js'

export const PERMISSIONS = [
  {
    key: 'view_overview',
    label: 'Consolidated Overview & KPIs Tab',
    type: 'tab',
    tabName: 'Overview',
    targetView: 'overview',
    group: 'Workspaces',
    description: 'Executive KPI dashboard showing live gross turnover, hit payouts, and remittance due.',
  },
  {
    key: 'view_reports',
    label: 'Draw Gross & Turnover Reports Tab',
    type: 'tab',
    tabName: 'Draw Reports',
    targetView: 'reports',
    group: 'Workspaces',
    description: 'Draw-by-draw financial reports, supervisor audit rankings, and teller performance sheets.',
  },
  {
    key: 'manage_users',
    label: 'Users & RBAC Administration Tab',
    type: 'tab',
    tabName: 'Users & RBAC',
    targetView: 'rbac',
    group: 'Workspaces',
    description: 'Workstation credential administration and Role Permission Matrix management panel.',
  },
  {
    key: 'audit_logs',
    label: 'Activity & Security Audit Log Tab',
    type: 'tab',
    tabName: 'Activity Log',
    targetView: 'activity',
    group: 'Workspaces',
    description: 'Real-time security audit trail tracking logins, credential updates, and permission toggles.',
  },
  {
    key: 'manage_commissions',
    label: 'Agent Commissions & Supervisor Rates Tab',
    type: 'tab',
    tabName: 'Commissions',
    targetView: 'commissions',
    group: 'Workspaces',
    description: 'Configure baseline agent commission rates per supervisor and individual teller overrides.',
  },
  {
    key: 'print_statements',
    label: 'Print Remittance Statements',
    type: 'feature',
    featureName: 'Print Statements',
    group: 'Operations',
    parentTabs: ['view_overview', 'view_reports'],
    parentTabLabels: ['Overview Tab', 'Draw Reports Tab'],
    description: 'Generates official remittance statements and supervisor payout slips.',
  },
  {
    key: 'export_data',
    label: 'Export Financial Data (CSV)',
    type: 'feature',
    featureName: 'Export Data',
    group: 'Operations',
    parentTabs: ['view_overview', 'view_reports'],
    parentTabLabels: ['Overview Tab', 'Draw Reports Tab'],
    description: 'Downloads consolidated draw matrices and supervisor balance sheets to CSV format.',
  },
  {
    key: 'view_raw_feed',
    label: 'Technical API Raw Inspector',
    type: 'feature',
    featureName: 'Raw API Inspector',
    group: 'Technical',
    parentTabs: ['view_overview'],
    parentTabLabels: ['Overview Tab'],
    description: 'Inspects live incoming API payloads and raw database rows inside the Overview dashboard.',
  },
  {
    key: 'create_credentials',
    label: 'Add & Provision User Credentials',
    type: 'feature',
    featureName: 'Add Users',
    group: 'Administration',
    parentTabs: ['manage_users'],
    parentTabLabels: ['Users & RBAC Tab'],
    description: 'Allows provisioning new system users, passwords, branches, and assigning role privileges.',
  },
  {
    key: 'edit_commissions',
    label: 'Modify & Override Commission Rates',
    type: 'feature',
    featureName: 'Edit Rates & Overrides',
    group: 'Operations',
    parentTabs: ['manage_commissions'],
    parentTabLabels: ['Commissions Tab'],
    description: 'Enables changing baseline supervisor commission rates and setting individual agent custom percentages.',
  },
  {
    key: 'inspect_deficits',
    label: 'Inspect Shortage & Deficit Accounts',
    type: 'feature',
    featureName: 'Deficit Inspector',
    group: 'Operations',
    parentTabs: ['view_overview', 'view_reports'],
    parentTabLabels: ['Overview Tab', 'Draw Reports Tab'],
    description: 'Opens deep breakdown modal for negative balance tellers across specific draw rotations.',
  },
  {
    key: 'view_all_draws',
    label: 'View All PCSO Draw Rotations',
    type: 'feature',
    featureName: 'All Draw Rotations',
    group: 'Operations',
    parentTabs: ['view_reports'],
    parentTabLabels: ['Draw Reports Tab'],
    description: 'Enables inspection across 2:00PM, 5:00PM, and 9:00PM draw turnovers without restrictions.',
  },
  {
    key: 'change_theme',
    label: 'Toggle Dark / Light Display Mode',
    type: 'feature',
    featureName: 'Theme Switcher',
    group: 'General',
    parentTabs: ['view_overview', 'view_reports', 'manage_users', 'audit_logs', 'manage_commissions'],
    parentTabLabels: ['All Workspaces'],
    description: 'Allows toggling between sleek dark mode and high-contrast light mode UI.',
  },
]

export const PERMISSION_GROUPS = [
  { id: 'Workspaces', label: 'Workspace Menus & Navigation Tabs' },
  { id: 'Operations', label: 'Financial Operations & Actions' },
  { id: 'Administration', label: 'Security & Access Administration' },
  { id: 'Technical', label: 'Diagnostics & Developer Feeds' },
  { id: 'General', label: 'General Interface Preferences' },
]

export const DEFAULT_ROLES = {
  admin: {
    id: 'admin',
    label: 'System Administrator',
    badge: 'SUPERADMIN',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    description: 'Unrestricted master access to all workspaces, credential management, and audit logs.',
    permissions: PERMISSIONS.map((p) => p.key),
  },
  accountant: {
    id: 'accountant',
    label: 'Head Cashier / Accountant',
    badge: 'ACCOUNTING',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.35)',
    description: 'Access to financial overviews, draw turnover reports, agent statements, and print tools.',
    permissions: [
      'view_overview',
      'view_reports',
      'print_statements',
      'export_data',
      'manage_commissions',
      'edit_commissions',
      'inspect_deficits',
      'view_all_draws',
      'change_theme',
    ],
  },
  supervisor: {
    id: 'supervisor',
    label: 'Branch Supervisor',
    badge: 'SUPERVISOR',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
    description: 'Oversees zone turnover reports, supervisor statement printing, and draw results.',
    permissions: [
      'view_overview',
      'view_reports',
      'print_statements',
      'export_data',
      'inspect_deficits',
      'view_all_draws',
      'change_theme',
    ],
  },
  auditor: {
    id: 'auditor',
    label: 'Internal Compliance Auditor',
    badge: 'AUDITOR',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    description: 'Compliance auditor with read access to reports, turnover audit trails, and security logs.',
    permissions: [
      'view_overview',
      'view_reports',
      'audit_logs',
      'export_data',
      'inspect_deficits',
      'view_all_draws',
      'change_theme',
    ],
  },
  staff: {
    id: 'staff',
    label: 'Terminal Staff',
    badge: 'TERMINAL',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    description: 'Operational terminal assistant with access restricted to live overview metrics.',
    permissions: ['view_overview'],
  },
}

export const DEFAULT_USERS = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'adminpassword',
    name: 'Jay Ryan Lim',
    role: 'admin',
    roleLabel: 'System Administrator',
    branch: 'LDN HQ (All Zones)',
    status: 'active',
    lastLogin: 'Active Now',
    createdAt: '2026-01-15',
    avatar: 'JL',
    email: 'admin@glowingfortune.ph',
  },
  {
    id: 'usr_accountant',
    username: 'ldn.staff',
    password: 'luckybet2026',
    name: 'Elena Morales',
    role: 'accountant',
    roleLabel: 'Head Cashier',
    branch: 'LDN Branch',
    status: 'active',
    lastLogin: 'Today, 09:15 AM',
    createdAt: '2026-02-01',
    avatar: 'EM',
    email: 'elena.m@glowingfortune.ph',
  },
  {
    id: 'usr_supervisor',
    username: 'supervisor.carlos',
    password: 'luckybet2026',
    name: 'Carlos Tan',
    role: 'supervisor',
    roleLabel: 'Branch Supervisor',
    branch: 'LDN Central Zone',
    status: 'active',
    lastLogin: 'Yesterday, 04:30 PM',
    createdAt: '2026-02-10',
    avatar: 'CT',
    email: 'carlos.tan@glowingfortune.ph',
  },
  {
    id: 'usr_terminal',
    username: 'teller.ldn',
    password: 'luckybet2026',
    name: 'Rico Dela Cruz',
    role: 'staff',
    roleLabel: 'Terminal Staff',
    branch: 'LDN Terminal 01',
    status: 'active',
    lastLogin: '3 days ago',
    createdAt: '2026-02-20',
    avatar: 'RD',
    email: 'rico.staff@glowingfortune.ph',
  },
]

export const DEFAULT_AUDIT_LOGS = [
  {
    id: 'log_01',
    timestamp: 'Today, 09:30 AM',
    action: 'SESSION_AUTHENTICATION',
    actor: 'admin',
    details: 'System Administrator authenticated from 256-bit SSL Gateway',
    severity: 'info',
  },
  {
    id: 'log_02',
    timestamp: 'Today, 08:45 AM',
    action: 'RBAC_CREDENTIAL_VERIFIED',
    actor: 'ldn.staff',
    details: 'Accounting credentials verified for LDN draw turnover',
    severity: 'success',
  },
  {
    id: 'log_03',
    timestamp: 'Yesterday, 09:00 PM',
    action: 'DRAW_RECONCILIATION',
    actor: 'system',
    details: 'Evening 7:00 PM & 9:00 PM draw matrix balanced at 99.98% accuracy',
    severity: 'info',
  },
]

let inMemoryRoles = DEFAULT_ROLES
let inMemoryUserPerms = {}
let inMemoryUsers = DEFAULT_USERS
let inMemoryDeleted = new Set()
let inMemoryAuditLogs = [...DEFAULT_AUDIT_LOGS]

export function setInMemoryRoles(roles) {
  if (roles && typeof roles === 'object') {
    inMemoryRoles = roles
  }
}

export function setInMemoryUserPerms(perms) {
  if (perms && typeof perms === 'object') {
    inMemoryUserPerms = perms
  }
}

export function setInMemoryUsers(users) {
  if (Array.isArray(users)) {
    inMemoryUsers = users
  }
}

export function getRbacRoles() {
  return inMemoryRoles
}

export function saveRbacRoles(roles) {
  inMemoryRoles = roles
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('luckybet_rbac_change', { detail: { roles } }))
  }

  saveSupabaseMatrixConfig({
    roles,
    userPerms: inMemoryUserPerms,
  }).catch((err) => {
    console.warn('Supabase cloud roles sync failed:', err)
  })
}

export function getUserCustomPermissionsMap() {
  return inMemoryUserPerms
}

export function saveUserCustomPermissionsMap(map) {
  inMemoryUserPerms = map
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('luckybet_rbac_change', { detail: { userPerms: map } }))
  }

  saveSupabaseMatrixConfig({
    roles: inMemoryRoles,
    userPerms: map,
  }).catch((err) => {
    console.warn('Supabase cloud user perms sync failed:', err)
  })
}

export function getUserCustomPermissions(username) {
  if (!username) return null
  const clean = username.trim().toLowerCase()
  return Array.isArray(inMemoryUserPerms[clean]) ? inMemoryUserPerms[clean] : null
}

export function setUserCustomPermissions(username, permissions) {
  if (!username) return
  const clean = username.trim().toLowerCase()
  const map = { ...inMemoryUserPerms }
  if (permissions === null || permissions === undefined) {
    delete map[clean]
  } else {
    map[clean] = permissions
  }
  saveUserCustomPermissionsMap(map)
}

export function clearUserCustomPermissions(username) {
  setUserCustomPermissions(username, null)
}

export function getDeletedUsernames() {
  return Array.from(inMemoryDeleted)
}

export function recordDeletedUsername(username) {
  if (!username) return
  inMemoryDeleted.add(username.trim().toLowerCase())
}

export function unmarkDeletedUsername(username) {
  if (!username) return
  inMemoryDeleted.delete(username.trim().toLowerCase())
}

export function sanitizeBranchString(str) {
  if (typeof str !== 'string') return str
  return str.replace(/Mandaue/gi, 'LDN')
}

export function getRbacUsers() {
  return inMemoryUsers
    .map((u) => {
      const newBranch = sanitizeBranchString(u.branch)
      const newEmail = u.email ? u.email.replace(/luckybetplay\.ph/gi, 'glowingfortune.ph') : u.email
      const newUsername = u.username ? u.username.replace(/^mandaue\.staff$/i, 'ldn.staff').replace(/^teller\.mandaue$/i, 'teller.ldn') : u.username
      return {
        ...u,
        username: newUsername,
        branch: newBranch,
        email: newEmail,
      }
    })
    .filter((u) => !inMemoryDeleted.has(u.username.toLowerCase()))
}

export function saveRbacUsers(users) {
  if (Array.isArray(users)) {
    inMemoryUsers = users
  }
}

export function getAuditLogs() {
  return inMemoryAuditLogs
}

export function addAuditLog(action, details, actor = 'current_user', severity = 'info') {
  const now = new Date()
  const timeStr = `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  const newEntry = {
    id: `log_${Date.now()}`,
    timestamp: timeStr,
    action,
    actor,
    details,
    severity,
  }
  inMemoryAuditLogs = [newEntry, ...inMemoryAuditLogs].slice(0, 50)
  return inMemoryAuditLogs
}

export function verifyUserCredentials(username, password) {
  const users = getRbacUsers()
  const cleanUser = String(username || '').trim().toLowerCase()
  const cleanPass = String(password || '').trim()

  const deleted = getDeletedUsernames()
  if (deleted.includes(cleanUser)) {
    return null
  }

  const userRecord = users.find((u) => u.username.toLowerCase() === cleanUser)
  if (userRecord && (userRecord.status === 'suspended' || userRecord.status === 'inactive')) {
    if (userRecord.password === cleanPass) {
      return { deactivated: true, username: userRecord.username }
    }
  }

  const match = users.find(
    (u) =>
      u.status === 'active' &&
      u.username.toLowerCase() === cleanUser &&
      u.password === cleanPass
  )

  if (match) {
    const roles = getRbacRoles()
    const roleDef = roles[match.role] || DEFAULT_ROLES[match.role] || DEFAULT_ROLES.staff
    return {
      id: match.id,
      username: match.username,
      name: match.name,
      role: match.role,
      roleLabel: roleDef.label,
      roleBadge: roleDef.badge,
      permissions: getUserEffectivePermissions(match, roles),
      branch: match.branch,
      avatar: match.avatar || match.name.substring(0, 2).toUpperCase(),
      email: match.email,
      loginTime: new Date().toISOString(),
      token: 'rbac-token-' + match.id,
    }
  }

  return null
}

export function getUserEffectivePermissions(user, roles = null) {
  if (!user) return []
  const username = String(user.username || '').trim().toLowerCase()
  const custom = getUserCustomPermissions(username)
  if (Array.isArray(custom)) {
    return custom
  }
  if (Array.isArray(user.customPermissions)) {
    return user.customPermissions
  }
  const activeRoles = roles || getRbacRoles()
  const roleDef = activeRoles[user.role] || DEFAULT_ROLES[user.role] || DEFAULT_ROLES.staff
  return roleDef?.permissions || []
}

export function isTabPermission(key) {
  const p = PERMISSIONS.find((item) => item.key === key)
  return p?.type === 'tab'
}

export function isFeaturePermission(key) {
  const p = PERMISSIONS.find((item) => item.key === key)
  return p?.type === 'feature'
}

export function getPermissionMeta(key) {
  return (
    PERMISSIONS.find((item) => item.key === key) || {
      key,
      label: key,
      type: 'feature',
      group: 'General',
      parentTabs: [],
      parentTabLabels: [],
      description: '',
    }
  )
}

export function areFeatureParentTabsDisabled(permKey, activePermissions = []) {
  const meta = getPermissionMeta(permKey)
  if (meta.type !== 'feature') return false
  const parentTabs = meta.parentTabs || []
  if (parentTabs.length === 0) return false
  const hasActiveParent = parentTabs.some((tabKey) => activePermissions.includes(tabKey))
  return !hasActiveParent
}

export function getAffectedFeaturesWhenTabDisabled(tabKey, currentPerms = []) {
  const remainingWithoutTab = currentPerms.filter((k) => k !== tabKey)
  return PERMISSIONS.filter((p) => {
    if (p.type !== 'feature' || !p.parentTabs?.includes(tabKey)) return false
    if (!currentPerms.includes(p.key)) return false
    const hasRemainingParent = p.parentTabs.some((pt) => remainingWithoutTab.includes(pt))
    return !hasRemainingParent
  })
}

export function hasPermission(currentUser, permKey, roles = null) {
  if (!currentUser) return false
  const perms = getUserEffectivePermissions(currentUser, roles)
  if (!perms.includes(permKey)) return false

  const meta = getPermissionMeta(permKey)
  if (meta.type === 'feature' && meta.parentTabs?.length > 0) {
    const hasParentTab = meta.parentTabs.some((tabKey) => perms.includes(tabKey))
    if (!hasParentTab) return false
  }

  return true
}
