import { useState, useEffect, useRef } from 'react'
import { verifyUserCredentials, getDeletedUsernames, getUserEffectivePermissions } from './rbac'
import {
  isSupabaseConfigured,
  verifyCredentialsInSupabaseTable,
  syncMatrixPermissionsFromSupabase,
  signInWithSupabase,
  signUpWithSupabase,
  formatSupabaseEmail,
  createCloudSession,
} from './supabase'
import './LoginPage.css'


function SvgIcon({ name, size = 16, className = '' }) {
  const icons = {
    user: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ),
    chart: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    shieldCheck: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    logIn: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </>
    ),
    check: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
    alertCircle: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
    chevronLeft: (
      <>
        <polyline points="15 18 9 12 15 6" />
      </>
    ),
    chevronRight: (
      <>
        <polyline points="9 18 15 12 9 6" />
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </>
    ),
    calendar: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    badgeCheck: (
      <>
        <path d="M12 2l3.09 3.26 4.41.64-1.18 4.3 2.18 3.92-3.32 2.98.05 4.5-4.48 1.05-3.09 3.25-3.09-3.25-4.48-1.05.05-4.5-3.32-2.98 2.18-3.92-1.18-4.3 4.41-.64L12 2z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    palette: (
      <>
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z" />
      </>
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {icons[name] || null}
    </svg>
  )
}

export default function LoginPage({ onLoginSuccess, branchName = 'LDN' }) {
  const [username, setUsername] = useState('ldn.staff')
  const [password, setPassword] = useState('luckybet2026')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loginSuccessState, setLoginSuccessState] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showForgotModal, setShowForgotModal] = useState(false)

  const [colorTheme, setColorTheme] = useState('obsidian')

  const [activeSlide, setActiveSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const autoPlayRef = useRef(null)

  const slides = [
    {
      id: 'brand',
      eyebrow: 'AUTHORIZED GAMING OPERATOR',
      tag: 'PCSO COMPLIANT',
      title: 'Glowing Fortune Corporation',
      subtitle:
        'Official accounting workstation and certified draw sales auditing engine for authorized STL staff.',
      type: 'brand',
    },
    {
      id: 'matrix',
      eyebrow: 'DAILY FINANCIAL OPERATIONS',
      tag: '3 DRAWS SCHEDULE',
      title: 'Automated Sales Matrix',
      subtitle:
        'Real-time turnover auditing across Morning, Afternoon, and Evening rotations with automatic deficit tracking.',
      type: 'matrix',
    },
    {
      id: 'statement',
      eyebrow: 'SUPERVISOR FINANCIAL LEDGER',
      tag: 'CONFIDENTIAL ACCESS',
      title: 'Supervisor Balance Sheet',
      subtitle:
        'Granular per-agent accounting, automated commission calculation, and protected remittance ledgers restricted to authorized staff.',
      type: 'statement',
    },
  ]

  useEffect(() => {
    if (isPaused || loginSuccessState) return
    autoPlayRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length)
    }, 5500)
    return () => clearInterval(autoPlayRef.current)
  }, [isPaused, loginSuccessState, slides.length])

  useEffect(() => {
    if (isSupabaseConfigured) {
      syncMatrixPermissionsFromSupabase().catch(() => void 0)
    }
  }, [])

  const handleNextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % slides.length)
  }

  const handlePrevSlide = () => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }


  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    const cleanUsername = username.trim()
    const cleanPassword = password.trim()

    if (!cleanUsername || !cleanPassword) {
      setErrorMsg('Please enter both your username and password.')
      return
    }

    setSubmitting(true)
    let loginSuccess = false
    let authUser = null
    const configuredToken = import.meta.env.VITE_AUTHORIZATION

    try {
      if (isSupabaseConfigured) {
        try {
          const tableResult = await verifyCredentialsInSupabaseTable(cleanUsername, cleanPassword)
          if (tableResult.success && tableResult.account) {
            await syncMatrixPermissionsFromSupabase().catch(() => void 0)
            const acc = tableResult.account
            const isAdmin = acc.role === 'admin' || cleanUsername.toLowerCase().includes('admin')
            const effectivePerms = getUserEffectivePermissions({ username: acc.username, role: acc.role })
            loginSuccess = true
            authUser = {
              id: acc.id,
              username: acc.username,
              name: acc.name,
              role: acc.role,
              roleLabel: acc.roleLabel || (isAdmin ? 'System Administrator' : 'Head Cashier'),
              branch: acc.branch || branchName,
              token: configuredToken || 'rbac-token-' + acc.id,
              provider: 'supabase_table',
              permissions: effectivePerms,
              loginTime: new Date().toISOString(),
            }
          } else if (tableResult.wrongPassword) {
            setErrorMsg('Invalid password. Please check your credentials and try again.')
            setSubmitting(false)
            return
          } else if (tableResult.inactive) {
            setErrorMsg(tableResult.error || `Access Denied: The account "${cleanUsername}" is currently deactivated. Please contact your system administrator.`)
            setSubmitting(false)
            return
          } else if (tableResult.notFound) {
            setErrorMsg(`Access Denied: Account "${cleanUsername}" is not registered in the credentials directory.`)
            setSubmitting(false)
            return
          }
        } catch (tableErr) {
          console.warn('Dedicated Cloud table check error, checking RBAC directory:', tableErr)
        }
      }

      const deletedUsernames = getDeletedUsernames()
      if (deletedUsernames.includes(cleanUsername.toLowerCase())) {
        setErrorMsg(`Access Denied: Account "${cleanUsername}" has been removed from authorized credentials.`)
        setSubmitting(false)
        return
      }

      if (!loginSuccess) {
        const rbacMatch = verifyUserCredentials(cleanUsername, cleanPassword)
        if (rbacMatch?.deactivated) {
          setErrorMsg(`Access Denied: The account "${cleanUsername}" is currently deactivated. Please contact your system administrator.`)
          setSubmitting(false)
          return
        }
        if (rbacMatch) {
          loginSuccess = true
          authUser = {
            ...rbacMatch,
            branch: rbacMatch.branch || branchName,
            token: configuredToken || rbacMatch.token || 'rbac-token-' + rbacMatch.id,
            provider: 'rbac',
          }
        }
      }

      if (!loginSuccess) {
        try {
          const loginUrl = (typeof window !== 'undefined' && window.location.protocol.startsWith('http'))
            ? new URL('/api/proxy?action=login', window.location.origin)
            : new URL('https://stl-ldn-api.com/api/accountant/login')
          const res = await fetch(loginUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              username: cleanUsername,
              password: cleanPassword,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            if (data?.success && data?.data?.token) {
              loginSuccess = true
              authUser = {
                username: cleanUsername,
                name: data.data.name || cleanUsername.toUpperCase(),
                role: 'accountant',
                roleLabel: 'Head Cashier',
                branch: branchName,
                token: data.data.token,
                provider: 'api',
                loginTime: new Date().toISOString(),
              }
            }
          }
        } catch (err) { void err }
      }

      if (!loginSuccess) {
        setErrorMsg('Access Denied: Account not found or incorrect password. Only accounts configured in RBAC can log in.')
      }

      if (loginSuccess && authUser) {
        setLoginSuccessState(true)

        await createCloudSession(authUser)

        setTimeout(() => {
          if (typeof onLoginSuccess === 'function') {
            onLoginSuccess(authUser)
          }
        }, 550)
      } else {
        setErrorMsg('Invalid credentials. Please verify your Access ID and password.')
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred during login. Please retry.')
    } finally {
      if (!loginSuccess) {
        setSubmitting(false)
      }
    }
  }

  return (
    <div
      className={`stl-login-screen theme-${colorTheme} ${
        loginSuccessState ? 'login-transitioning' : ''
      }`}
    >
      <div className="stl-login-container">
        {}
        {}
        {}
        <section
          className="stl-hero-panel"
          aria-label="STL LDN Interactive Showcase"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {}
          <div className="stl-hero-glow-orb-top" aria-hidden="true" />
          <div className="stl-hero-glow-orb-mid" aria-hidden="true" />
          <div className="stl-hero-ambient-grid" aria-hidden="true" />

          {}
          <div className="stl-corner-stl-bg-emblem" aria-hidden="true">
            <div className="stl-corner-glow-orb" />
            <div className="stl-corner-ring" />
            <img
              src="/stl-logo.png"
              alt="STL Official Background Emblem"
              className="stl-corner-bg-img"
            />
          </div>

          {}
          <header className="stl-hero-header">
            <div className="stl-header-right-tools">
              {}
              <div className="stl-theme-switcher-bar" title="Change Background Atmosphere">
                <span className="stl-theme-label">
                  <SvgIcon name="palette" size={13} />
                  <span>Theme:</span>
                </span>
                <div className="stl-theme-pills">
                  <button
                    type="button"
                    className={`stl-theme-btn ${colorTheme === 'obsidian' ? 'active' : ''}`}
                    onClick={() => setColorTheme('obsidian')}
                    title="Midnight Obsidian Theme (Deep Dark Mode with Radiant Gold)"
                  >
                    <span className="stl-theme-swatch swatch-obsidian" />
                    <span>Obsidian</span>
                  </button>
                  <button
                    type="button"
                    className={`stl-theme-btn ${colorTheme === 'royal' ? 'active' : ''}`}
                    onClick={() => setColorTheme('royal')}
                    title="Royal Cobalt Theme (Vibrant Corporate Blue)"
                  >
                    <span className="stl-theme-swatch swatch-royal" />
                    <span>Royal</span>
                  </button>
                  <button
                    type="button"
                    className={`stl-theme-btn ${colorTheme === 'aurora' ? 'active' : ''}`}
                    onClick={() => setColorTheme('aurora')}
                    title="Aurora Navy Theme (Deep Indigo & Cyan Glow)"
                  >
                    <span className="stl-theme-swatch swatch-aurora" />
                    <span>Aurora</span>
                  </button>
                  <button
                    type="button"
                    className={`stl-theme-btn ${colorTheme === 'executive' ? 'active' : ''}`}
                    onClick={() => setColorTheme('executive')}
                    title="Executive Slate Theme (Refined High-Contrast Dual Canvas)"
                  >
                    <span className="stl-theme-swatch swatch-executive" />
                    <span>Slate</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {}
          <div className="stl-carousel-viewport">
            <div className="stl-carousel-track">
              {slides.map((slide, idx) => {
                const isActive = idx === activeSlide
                return (
                  <div
                    key={slide.id}
                    className={`stl-carousel-slide ${isActive ? 'active' : ''}`}
                    aria-hidden={!isActive}
                  >
                    <div className="stl-hero-intro">
                      <div className="stl-slide-tag-row">
                        <span className="stl-slide-eyebrow">
                          <span className="slide-eyebrow-dot" />
                          {slide.eyebrow}
                        </span>
                        <span className="stl-slide-badge">{slide.tag}</span>
                      </div>
                      <h1 className="stl-hero-title">
                        {slide.id === 'brand' ? (
                          <>
                            <span className="hero-title-main">Glowing</span>{' '}
                            <span className="hero-title-accent">Fortune</span>
                          </>
                        ) : slide.id === 'matrix' ? (
                          <>
                            <span className="hero-title-main">Automated Sales</span>{' '}
                            <span className="hero-title-cyan">Matrix</span>
                          </>
                        ) : (
                          <>
                            <span className="hero-title-main">Supervisor</span>{' '}
                            <span className="hero-title-gold">Balance Sheet</span>
                          </>
                        )}
                      </h1>
                      {}
                      <div className="stl-hero-accent-bars" aria-hidden="true">
                        <span className="stl-accent-bar bar-gold" />
                        <span className="stl-accent-bar bar-blue" />
                      </div>
                      <p className="stl-hero-subtitle">{slide.subtitle}</p>
                    </div>

                    {}
                    <div className="stl-emblem-card-wrapper">
                      {slide.type === 'brand' && (
                        <div className="stl-emblem-glass-card brand-showcase-card">
                          <div className="stl-glass-sheen" aria-hidden="true" />
                          <div className="stl-emblem-glow-backing" aria-hidden="true" />
                          <div className="stl-emblem-solar-ring" aria-hidden="true" />
                          <div className="stl-solar-corona-glow" aria-hidden="true" />
                          <img
                            src="/glowing-fortune-logo.png"
                            alt="Glowing Fortune Corporation"
                            className="lb-hero-emblem-img"
                          />
                          <div className="stl-emblem-floating-chip chip-left">
                            <img src="/pcso-logo.png" alt="PCSO Logo" className="pcso-micro-chip-logo" />
                            <span>PCSO Certified</span>
                          </div>
                          <div className="stl-emblem-floating-chip chip-right">
                            <SvgIcon name="shieldCheck" size={13} />
                            <span>10-Ball Audit</span>
                          </div>
                        </div>
                      )}

                      {slide.type === 'matrix' && (
                        <div className="stl-emblem-glass-card matrix-showcase-card">
                          <div className="stl-glass-sheen" aria-hidden="true" />
                          <div className="matrix-card-header">
                            <span className="matrix-card-title">Daily Draw Matrix Status</span>
                            <span className="matrix-card-live-tag">Today Active</span>
                          </div>
                          <div className="matrix-mini-grid">
                            <div className="matrix-mini-item">
                              <div className="matrix-mini-time">
                                <strong>10:30 AM &amp; 2:00 PM</strong>
                                <span>1st Draw Rotation</span>
                              </div>
                              <span className="matrix-mini-badge solvent">BALANCED • 99.4%</span>
                            </div>
                            <div className="matrix-mini-item">
                              <div className="matrix-mini-time">
                                <strong>3:00 PM &amp; 5:00 PM</strong>
                                <span>2nd Draw Rotation</span>
                              </div>
                              <span className="matrix-mini-badge solvent">BALANCED</span>
                            </div>
                            <div className="matrix-mini-item highlight">
                              <div className="matrix-mini-time">
                                <strong>7:00 PM &amp; 9:00 PM</strong>
                                <span>3rd Draw Rotation</span>
                              </div>
                              <span className="matrix-mini-badge active">LIVE AUDITING</span>
                            </div>
                          </div>
                          <div className="matrix-mini-footer">
                            <div className="matrix-progress-bar">
                              <div className="matrix-progress-fill" style={{ width: '88%' }} />
                            </div>
                            <span className="matrix-footer-text">88% of daily turnover reconciled</span>
                          </div>
                        </div>
                      )}

                      {slide.type === 'statement' && (
                        <div className="stl-emblem-glass-card statement-showcase-card confidential-statement">
                          <div className="stl-glass-sheen" aria-hidden="true" />
                          <div className="statement-preview-header">
                            <div className="statement-preview-header-left">
                              <div className="statement-preview-icon confidential-icon">
                                <SvgIcon name="lock" size={17} />
                              </div>
                              <div className="statement-header-titles">
                                <div className="statement-header-badge-row">
                                  <strong>Supervisor Balance Sheet</strong>
                                  <span className="statement-confidential-chip">
                                    <span className="confidential-pulse-dot" />
                                    CONFIDENTIAL
                                  </span>
                                </div>
                                <span className="statement-header-subtitle">Restricted Remittance Ledger</span>
                              </div>
                            </div>
                          </div>

                          <div className="statement-preview-kpis">
                            <div className="statement-kpi-box confidential-kpi-box">
                              <div className="kpi-header-row">
                                <small>TOTAL GROSS</small>
                                <SvgIcon name="lock" size={10} className="kpi-micro-lock" />
                              </div>
                              <strong className="kpi-masked">••••••••••</strong>
                              <span className="kpi-lock-note">RESTRICTED</span>
                            </div>
                            <div className="statement-kpi-box confidential-kpi-box">
                              <div className="kpi-header-row">
                                <small>HITS PAYOUT</small>
                                <SvgIcon name="lock" size={10} className="kpi-micro-lock" />
                              </div>
                              <strong className="kpi-masked">••••••••••</strong>
                              <span className="kpi-lock-note">RESTRICTED</span>
                            </div>
                            <div className="statement-kpi-box confidential-kpi-box highlight-protected">
                              <div className="kpi-header-row">
                                <small>NET REMITTANCE</small>
                                <SvgIcon name="shieldCheck" size={11} className="kpi-micro-lock shield" />
                              </div>
                              <strong className="kpi-masked highlight">••••••••••</strong>
                              <span className="kpi-lock-note protected">PROTECTED</span>
                            </div>
                          </div>

                          <div className="statement-security-footer">
                            <div className="statement-security-notice">
                              <SvgIcon name="shieldCheck" size={12} className="security-notice-icon" />
                              <span>Financial data masked for security. RBAC sign-in required.</span>
                            </div>
                            <div className="statement-agent-pills">
                              <span className="agent-pill-confidential">
                                <SvgIcon name="lock" size={10} /> 256-Bit Encrypted
                              </span>
                              <span className="agent-pill-clean">
                                <SvgIcon name="badgeCheck" size={10} /> Audit-Grade Ledger
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {}
            <div className="stl-carousel-controls-bar">
              <div className="stl-carousel-nav-btns">
                <button
                  type="button"
                  className="stl-carousel-nav-btn"
                  onClick={handlePrevSlide}
                  aria-label="Previous slide"
                  title="Previous slide"
                >
                  <SvgIcon name="chevronLeft" size={16} />
                </button>
                <button
                  type="button"
                  className="stl-carousel-nav-btn"
                  onClick={handleNextSlide}
                  aria-label="Next slide"
                  title="Next slide"
                >
                  <SvgIcon name="chevronRight" size={16} />
                </button>
              </div>

              <div className="stl-carousel-indicators" role="tablist">
                {slides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeSlide}
                    className={`stl-indicator-pill ${idx === activeSlide ? 'active' : ''}`}
                    onClick={() => setActiveSlide(idx)}
                    title={`Go to slide ${idx + 1}: ${s.title}`}
                  >
                    <span className="stl-indicator-name">{s.title.split(' ')[0]}</span>
                    {idx === activeSlide && !isPaused && (
                      <span className="stl-indicator-progress-timer" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {}
          <div className="stl-hero-features-row">
            {}
            <div className="stl-telemetry-bento-card bento-card-1">
              <div className="bento-ambient-glow glow-cyan" />
              <div className="bento-top-badge-row">
                <span className="bento-status-pill pill-live">
                  <span className="bento-live-pulse" /> LIVE AUDITING
                </span>
                <span className="bento-tag-sub">PCSO 10-BALL</span>
              </div>
              <div className="bento-stat-hero">
                <span className="bento-stat-big stat-gradient-cyan">99.98%</span>
                <span className="bento-stat-variance">0.00% Variance</span>
              </div>
              <div className="bento-desc-label">Turnover &amp; Draw Reconciliation</div>
              <div className="bento-segments-row" title="Continuous Draw Verification">
                <div className="bento-seg-bars">
                  <span className="seg-bar done" title="10:30 AM Draw - Settled" />
                  <span className="seg-bar done" title="2:00 PM Draw - Settled" />
                  <span className="seg-bar done" title="3:00 PM Draw - Settled" />
                  <span className="seg-bar done" title="5:00 PM Draw - Settled" />
                  <span className="seg-bar done" title="7:00 PM Draw - Settled" />
                  <span className="seg-bar active-scan" title="9:00 PM Draw - In Progress" />
                </div>
                <span className="seg-count-text">6 Draws Verified</span>
              </div>
            </div>

            {}
            <div className="stl-telemetry-bento-card bento-card-2">
              <div className="bento-ambient-glow glow-amber" />
              <div className="bento-top-badge-row">
                <span className="bento-status-pill pill-ledger">
                  <SvgIcon name="shieldCheck" size={12} /> REPORT INTEGRITY
                </span>
                <span className="bento-tag-sub">100% RELIABLE</span>
              </div>
              <div className="bento-stat-hero">
                <span className="bento-stat-big stat-gradient-gold">100%</span>
                <span className="bento-stat-unit">Reliability</span>
              </div>
              <div className="bento-desc-label">Tamper-Proof &amp; Verified Reports</div>
              <div className="bento-trust-pills-row">
                <span className="bento-trust-badge solvent">
                  <SvgIcon name="check" size={11} /> Zero Discrepancy
                </span>
                <span className="bento-trust-badge balance">Audit-Certified</span>
              </div>
            </div>

            {}
            <div className="stl-telemetry-bento-card bento-card-3">
              <div className="bento-ambient-glow glow-blue" />
              <div className="bento-top-badge-row">
                <span className="bento-status-pill pill-schedule">
                  <SvgIcon name="calendar" size={12} /> DRAW ROTATIONS
                </span>
                <span className="bento-tag-sub">TODAY ACTIVE</span>
              </div>
              <div className="bento-stat-hero">
                <span className="bento-stat-big stat-gradient-blue">3</span>
                <span className="bento-stat-unit">Daily Rotations</span>
              </div>
              <div className="bento-desc-label">Morning • Midday • Evening</div>
              <div className="bento-rotations-timeline">
                <div className="bento-rot-chip done">
                  <span className="chip-time">10:30 &bull; 2:00</span>
                  <span className="chip-label">1st</span>
                </div>
                <div className="bento-rot-chip done">
                  <span className="chip-time">3:00 &bull; 5:00</span>
                  <span className="chip-label">2nd</span>
                </div>
                <div className="bento-rot-chip live">
                  <span className="chip-time">7:00 &bull; 9:00</span>
                  <span className="chip-label pulse">LIVE</span>
                </div>
              </div>
            </div>
          </div>



          {}
          <div className="stl-corner-pcso-bg-emblem" aria-hidden="true">
            <div className="pcso-corner-glow-orb" />
            <div className="pcso-corner-ring" />
            <img
              src="/pcso-logo.png"
              alt="PCSO Official Background Emblem"
              className="pcso-corner-bg-img"
            />
          </div>
        </section>

        {}
        {}
        {}
        <section className="stl-auth-panel" aria-label="Staff Login Portal">
          <div className="stl-auth-card">
            {}
            <div className="stl-auth-card-top-beam" aria-hidden="true" />

            {}
            <div className="stl-auth-card-emblem-wrap">
              <div className="stl-auth-circle-container">
                <div className="stl-circle-glow-orb" aria-hidden="true" />
                <div className="stl-circle-halo-ring" aria-hidden="true" />
                <img
                  src="/stl-logo.png"
                  alt="STL Official Logo"
                  className="stl-auth-circle-logo"
                />
              </div>
            </div>

            {}
            <div className="stl-card-header">

              <div className="stl-card-titles">
                <span className="stl-card-welcome-eyebrow">PCSO AUTHORIZED OPERATOR</span>
                <h2 className="stl-card-heading">Staff Workstation</h2>
                <p className="stl-card-subheading">
                  Use assigned workstation credentials to access authorized accounting audits &amp; ledgers.
                </p>
                {isSupabaseConfigured && (
                  <div className="stl-auth-cloud-badge">
                    <span className="cloud-badge-dot" />
                    <span>Dedicated Cloud Authentication Active</span>
                  </div>
                )}
              </div>
            </div>



            {}
            {errorMsg && (
              <div className="stl-auth-error-banner" role="alert">
                <SvgIcon name="alertCircle" size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {}
            <form className="stl-login-form" onSubmit={handleSubmit} noValidate>
              {}
              <div className="stl-form-group">
                <label className="stl-form-label" htmlFor="stl-username-input">
                  Username, Email or Access ID
                </label>
                <div className="stl-input-box">
                  <span className="stl-input-lead-icon">
                    <SvgIcon name="user" size={16} />
                  </span>
                  <input
                    id="stl-username-input"
                    type="text"
                    className="stl-text-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ldn.staff or your email"
                    autoComplete="username"
                    required
                  />
                  <div className="stl-input-focus-glow" />
                </div>
              </div>

              {}
              <div className="stl-form-group">
                <label className="stl-form-label" htmlFor="stl-password-input">
                  Password
                </label>
                <div className="stl-input-box">
                  <span className="stl-input-lead-icon">
                    <SvgIcon name="lock" size={16} />
                  </span>
                  <input
                    id="stl-password-input"
                    type={showPassword ? 'text' : 'password'}
                    className="stl-text-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="stl-password-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <SvgIcon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                  <div className="stl-input-focus-glow" />
                </div>
              </div>

              {}
              <div className="stl-form-options-row">
                <label className="stl-checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="stl-checkbox"
                  />
                  <span className="stl-checkbox-text">Keep session active</span>
                </label>

                <button
                  type="button"
                  className="stl-forgot-link"
                  onClick={() => setShowForgotModal(true)}
                >
                  Forgot password?
                </button>
              </div>

              {}
              <button
                type="submit"
                className={`stl-submit-btn ${loginSuccessState ? 'btn-success-state' : ''}`}
                disabled={submitting || loginSuccessState}
              >
                {loginSuccessState ? (
                  <>
                    <SvgIcon name="check" size={17} />
                    <span>Access Granted — Loading Terminal...</span>
                  </>
                ) : submitting ? (
                  <>
                    <span className="stl-btn-spinner" aria-hidden="true" />
                    <span>Authenticating terminal...</span>
                  </>
                ) : (
                  <>
                    <SvgIcon name="logIn" size={16} />
                    <span>Sign In to System</span>
                  </>
                )}
                <div className="stl-btn-shimmer" />
              </button>
            </form>


          </div>
        </section>
      </div>

      {}
      {showForgotModal && (
        <div
          className="stl-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          onClick={() => setShowForgotModal(false)}
        >
          <div
            className="stl-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stl-modal-header">
              <div className="stl-modal-icon">
                <SvgIcon name="lock" size={20} />
              </div>
              <h3 id="forgot-modal-title">Password Assistance</h3>
              <button
                type="button"
                className="stl-modal-close-btn"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close modal"
              >
                <SvgIcon name="x" size={16} />
              </button>
            </div>
            <div className="stl-modal-body">
              <p>
                Terminal credentials for <strong>STL {branchName}</strong> are governed by the Chief Accounting Officer.
              </p>
              <div className="stl-modal-tip-box">
                <strong>Evaluation Credentials:</strong>
                <span>
                  Username: <code>ldn.staff</code>
                  <br />
                  Password: <code>luckybet2026</code>
                </span>
              </div>
              <p className="stl-modal-subtext">
                For security resets, please approach the Branch Administration Terminal Supervisor.
              </p>
            </div>
            <div className="stl-modal-footer">
              <button
                type="button"
                className="stl-modal-confirm-btn"
                onClick={() => {
                  handleFillDemo()
                  setShowForgotModal(false)
                }}
              >
                Auto-fill Credentials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
