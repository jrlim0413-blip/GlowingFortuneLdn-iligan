import React, { useState, useEffect, useRef } from 'react'
import './FacebookProfileDropdown.css'

function SvgIcon({ name, size = 18, className = '' }) {
  const icons = {
    moon: (
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
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
    switchProfile: (
      <>
        <path d="M7 16V4M7 4L3 8M7 4L11 8" />
        <path d="M17 8V20M17 20L21 16M17 20L13 16" />
      </>
    ),
    shieldCheck: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    activity: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    ),
    percent: (
      <>
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </>
    ),
    logOut: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    ),
    chevronRight: (
      <path d="m9 18 6-6-6-6" />
    ),
    chevronDown: (
      <path d="m6 9 6 6 6-6" />
    ),
    check: (
      <polyline points="20 6 9 17 4 12" />
    ),
    rotateCcw: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
  }

  return (
    <svg
      className={`fb-svg-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] || null}
    </svg>
  )
}

export default function FacebookProfileDropdown({
  currentUser,
  allUsers = [],
  userPermissions = [],
  totalPermissionsCount = 10,
  isDarkMode = false,
  onToggleDarkMode,
  onSwitchUser,
  onReturnToAdmin,
  onLogout,
  onNavigateView,
  canSwitchAccounts = true,
  can = () => true,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const userInitials = currentUser?.avatar || (currentUser?.username ? currentUser.username.substring(0, 2).toUpperCase() : 'AC')
  const userFullName = currentUser?.name || 'Accountant'
  const userRoleText = currentUser?.roleLabel || currentUser?.role || 'Staff'

  const otherAccounts = allUsers.filter((u) => u.username !== currentUser?.username)

  return (
    <div className="fb-profile-container" ref={dropdownRef}>
      {}
      <button
        type="button"
        className={`fb-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Open user account menu"
      >
        <div className="fb-trigger-avatar">
          {userInitials}
          <div className="fb-avatar-badge-icon">
            <SvgIcon name="chevronDown" size={10} />
          </div>
        </div>

        <div className="fb-trigger-info">
          <div className="fb-trigger-name-row">
            <span className="fb-trigger-name">{userFullName}</span>
            <span className="fb-trigger-perm-pill">
              {userPermissions.length}/{totalPermissionsCount} Perms
            </span>
          </div>
          <span className="fb-trigger-role">
            @{currentUser?.username || 'user'} &bull; {userRoleText}
          </span>
        </div>

        <div className={`fb-chevron-indicator ${isOpen ? 'rotated' : ''}`}>
          <SvgIcon name="chevronDown" size={14} />
        </div>
      </button>

      {}
      {isOpen && (
        <div className="fb-dropdown-menu" role="menu" aria-orientation="vertical">
          {}
          <div className="fb-card fb-active-profile-card">
            <div className="fb-profile-card-top">
              <div className="fb-large-avatar">
                {userInitials}
              </div>
              <div className="fb-profile-details">
                <strong className="fb-profile-name">{userFullName}</strong>
                <span className="fb-profile-role-sub">
                  @{currentUser?.username || 'user'} &bull; {userRoleText}
                </span>
                <span className="fb-profile-branch">
                  {(currentUser?.branch ? currentUser.branch.replace(/Mandaue/gi, 'LDN') : 'LDN Branch')}
                </span>
              </div>
            </div>

            <div className="fb-perms-status-bar">
              <span className="fb-perms-pill">
                <SvgIcon name="shieldCheck" size={13} />
                <span>{userPermissions.length} of {totalPermissionsCount} Permissions Active</span>
              </span>
            </div>

            {}
            {currentUser?.simulatedFromAdmin && (
              <button
                type="button"
                className="fb-return-admin-btn"
                onClick={() => {
                  onReturnToAdmin()
                  setIsOpen(false)
                }}
                title="Exit simulation and return to Admin account"
              >
                <SvgIcon name="rotateCcw" size={14} />
                <span>Return to Administrator</span>
              </button>
            )}
          </div>

          {}
          {canSwitchAccounts && otherAccounts.length > 0 && (
            <div className="fb-account-switcher-section">
              <div className="fb-section-header">
                <div className="fb-section-title">
                  <div className="fb-icon-circle mini">
                    <SvgIcon name="switchProfile" size={13} />
                  </div>
                  <span>Switch Account</span>
                </div>
                {can('manage_users') && (
                  <button
                    type="button"
                    className="fb-see-all-link"
                    onClick={() => {
                      onNavigateView('rbac')
                      setIsOpen(false)
                    }}
                  >
                    Role Matrix
                  </button>
                )}
              </div>

              <div className="fb-accounts-list">
                {otherAccounts.map((account) => {
                  const accInitials = account.avatar || account.name.substring(0, 2).toUpperCase()
                  return (
                    <button
                      key={account.id || account.username}
                      type="button"
                      className="fb-account-item"
                      onClick={() => {
                        onSwitchUser(account)
                        setIsOpen(false)
                      }}
                      title={`Simulate logging in as ${account.name} (@${account.username})`}
                    >
                      <div className="fb-account-avatar">
                        {accInitials}
                      </div>
                      <div className="fb-account-info">
                        <span className="fb-account-name">{account.name}</span>
                        <span className="fb-account-role">
                          @{account.username} &bull; {account.roleLabel || account.role}
                        </span>
                      </div>
                      <div className="fb-switch-pill">
                        <span>Switch</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="fb-menu-divider" />

          {}
          <div className="fb-menu-items-list">
            {}
            <div className="fb-menu-item fb-menu-toggle-item">
              <div className="fb-menu-item-left">
                <div className="fb-icon-circle icon-darkmode">
                  <SvgIcon name={isDarkMode ? 'moon' : 'sun'} size={18} />
                </div>
                <div className="fb-menu-item-text">
                  <strong className="fb-item-title">Dark Mode</strong>
                  <span className="fb-item-desc">
                    {isDarkMode ? 'Dark appearance is ON' : 'Off'}
                  </span>
                </div>
              </div>

              {}
              <label
                className={`ios-switch-cell ${isDarkMode ? 'is-granted' : 'is-denied'}`}
                title="Toggle Dark Mode"
              >
                <input
                  type="checkbox"
                  className="ios-switch-input"
                  checked={isDarkMode}
                  onChange={onToggleDarkMode}
                />
                <span className="ios-switch-control">
                  <span className="ios-switch-track">
                    <span className="ios-switch-thumb" />
                  </span>
                  <span className="ios-switch-state-text">
                    {isDarkMode ? 'ON' : 'OFF'}
                  </span>
                </span>
              </label>
            </div>

            {}
            {can('manage_commissions') && (
              <button
                type="button"
                className="fb-menu-item"
                onClick={() => {
                  onNavigateView('commissions')
                  setIsOpen(false)
                }}
              >
                <div className="fb-menu-item-left">
                  <div className="fb-icon-circle icon-commissions">
                    <SvgIcon name="percent" size={17} />
                  </div>
                  <div className="fb-menu-item-text">
                    <strong className="fb-item-title">Agent Commissions</strong>
                    <span className="fb-item-desc">Supervisor rates &amp; agent overrides</span>
                  </div>
                </div>
                <SvgIcon name="chevronRight" size={16} className="fb-item-chevron" />
              </button>
            )}

            {}
            {can('manage_users') && (
              <button
                type="button"
                className="fb-menu-item"
                onClick={() => {
                  onNavigateView('rbac')
                  setIsOpen(false)
                }}
              >
                <div className="fb-menu-item-left">
                  <div className="fb-icon-circle icon-rbac">
                    <SvgIcon name="shieldCheck" size={18} />
                  </div>
                  <div className="fb-menu-item-text">
                    <strong className="fb-item-title">Users &amp; RBAC Matrix</strong>
                    <span className="fb-item-desc">Role permissions &amp; account control</span>
                  </div>
                </div>
                <SvgIcon name="chevronRight" size={16} className="fb-item-chevron" />
              </button>
            )}

            {}
            {can('audit_logs') && (
              <button
                type="button"
                className="fb-menu-item"
                onClick={() => {
                  onNavigateView('activity')
                  setIsOpen(false)
                }}
              >
                <div className="fb-menu-item-left">
                  <div className="fb-icon-circle icon-logs">
                    <SvgIcon name="activity" size={17} />
                  </div>
                  <div className="fb-menu-item-text">
                    <strong className="fb-item-title">Activity &amp; Audit Trail</strong>
                    <span className="fb-item-desc">Real-time security log inspection</span>
                  </div>
                </div>
                <SvgIcon name="chevronRight" size={16} className="fb-item-chevron" />
              </button>
            )}

            {}
            <button
              type="button"
              className="fb-menu-item fb-menu-logout-item"
              onClick={() => {
                setIsOpen(false)
                onLogout()
              }}
            >
              <div className="fb-menu-item-left">
                <div className="fb-icon-circle icon-logout">
                  <SvgIcon name="logOut" size={17} />
                </div>
                <div className="fb-menu-item-text">
                  <strong className="fb-item-title">Log Out</strong>
                  <span className="fb-item-desc">Sign out of your session</span>
                </div>
              </div>
              <SvgIcon name="chevronRight" size={16} className="fb-item-chevron" />
            </button>
          </div>

          {}
          <div className="fb-dropdown-footer">
            <span>Glowing Fortune Corporation &bull; LDN Branch</span>
          </div>
        </div>
      )}
    </div>
  )
}
