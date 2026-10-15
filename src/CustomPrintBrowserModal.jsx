import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './App' 

export const PAPER_FORMATS = {
  a4: {
    id: 'a4',
    name: 'A4 Standard',
    widthMm: 210,
    heightMm: 297,
    widthPx: 794,
    heightPx: 1123,
    unitText: '210 × 297 mm (8.27 × 11.69 in)',
  },
  longBond: {
    id: 'longBond',
    name: 'Long Bond / Folio',
    widthMm: 216,
    heightMm: 330,
    widthPx: 816,
    heightPx: 1248,
    unitText: '8.5 × 13 in (216 × 330 mm)',
  },
  letter: {
    id: 'letter',
    name: 'US Letter',
    widthMm: 216,
    heightMm: 279,
    widthPx: 816,
    heightPx: 1056,
    unitText: '8.5 × 11 in (216 × 279 mm)',
  },
  legal: {
    id: 'legal',
    name: 'US Legal',
    widthMm: 216,
    heightMm: 356,
    widthPx: 816,
    heightPx: 1344,
    unitText: '8.5 × 14 in (216 × 356 mm)',
  },
  custom: {
    id: 'custom',
    name: 'Custom Dimensions',
    widthMm: 210,
    heightMm: 297,
    widthPx: 794,
    heightPx: 1123,
    unitText: 'User-Defined Format',
  },
}

export const MARGIN_PRESETS = {
  compact: { id: 'compact', name: 'Compact (4mm)', top: '4mm', right: '5mm', bottom: '4mm', left: '5mm', px: 15 },
  normal:  { id: 'normal',  name: 'Standard (8mm)', top: '8mm', right: '8mm', bottom: '8mm', left: '8mm', px: 30 },
  wide:    { id: 'wide',    name: 'Spacious (12mm)', top: '12mm', right: '12mm', bottom: '12mm', left: '12mm', px: 45 },
  zero:    { id: 'zero',    name: 'Zero Margins (0mm)', top: '0mm', right: '0mm', bottom: '0mm', left: '0mm', px: 0 },
}

let inMemoryPrintSettings = {
  paperFormat: 'a4',
  orientation: 'portrait',
  marginPreset: 'compact',
  autoFitOnePage: true,
  fontScale: 100,
  colorMode: 'color',
  showHeader: true,
  showSignatures: true,
  showFooterTag: true,
  customWidthMm: 210,
  customHeightMm: 297,
}

export function getSavedPrintSettings() {
  return { ...inMemoryPrintSettings }
}

export function CustomPrintBrowserModal({
  isOpen,
  onClose,
  group,
  allSupervisors = [],
  selectedDate,
  branchName,
  canPrint = true,
  currentUser = null,
  onSelectSupervisor,
  children,
}) {
  const [settings, setSettings] = useState(getSavedPrintSettings)
  const [viewZoom, setViewZoom] = useState(100)
  const [computedFitScale, setComputedFitScale] = useState(100)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const stageRef = useRef(null)
  const pageFrameRef = useRef(null)

  useEffect(() => {
    inMemoryPrintSettings = { ...settings }
  }, [settings])

  const currentPaper = useMemo(() => {
    if (settings.paperFormat === 'custom') {
      const wMm = Number(settings.customWidthMm) || 210
      const hMm = Number(settings.customHeightMm) || 297
      return {
        id: 'custom',
        name: `Custom (${wMm} × ${hMm} mm)`,
        widthMm: wMm,
        heightMm: hMm,
        widthPx: Math.round(wMm * 3.7795),
        heightPx: Math.round(hMm * 3.7795),
        unitText: `${wMm} × ${hMm} mm`,
      }
    }
    return PAPER_FORMATS[settings.paperFormat] || PAPER_FORMATS.a4
  }, [settings.paperFormat, settings.customWidthMm, settings.customHeightMm])

  const currentMargin = MARGIN_PRESETS[settings.marginPreset] || MARGIN_PRESETS.compact

  useLayoutEffect(() => {
    if (!isOpen || !pageFrameRef.current) return

    let raf = 0
    const measurePage = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const frameEl = pageFrameRef.current
        if (!frameEl) return

        const contentH = frameEl.scrollHeight || 0
        const marginPx = currentMargin.px * 2
        const paperMaxH = (settings.orientation === 'landscape' ? currentPaper.widthPx : currentPaper.heightPx) - marginPx

        if (contentH > 0 && paperMaxH > 0) {
          const ratio = paperMaxH / contentH
          const pct = Math.min(100, Math.max(50, Math.floor(ratio * 100)))
          setComputedFitScale(pct)
        }
      })
    }

    measurePage()
    const resizeObs = new ResizeObserver(measurePage)
    if (pageFrameRef.current) resizeObs.observe(pageFrameRef.current)

    return () => {
      cancelAnimationFrame(raf)
      resizeObs.disconnect()
    }
  }, [isOpen, settings, currentPaper, currentMargin, group])

  const activeScale = settings.autoFitOnePage ? computedFitScale : settings.fontScale

  const handlePrintDocument = () => {
    if (!canPrint) {
      alert(`Access Restricted: Printing statements is locked for @${currentUser?.username || 'user'} in the Role Matrix.`)
      return
    }

    document.body.classList.add('custom-print-active')

    window.print()

    setTimeout(() => {
      document.body.classList.remove('custom-print-active')
    }, 1000)
  }

  if (!isOpen) return null

  const dynamicPageCss = `
    @page {
      size: ${currentPaper.id === 'custom' ? `${currentPaper.widthMm}mm ${currentPaper.heightMm}mm` : `${currentPaper.name.split(' ')[0]} ${settings.orientation}`} !important;
      margin: ${currentMargin.top} ${currentMargin.right} ${currentMargin.bottom} ${currentMargin.left} !important;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        ${settings.colorMode === 'bw' ? 'filter: grayscale(100%) !important;' : ''}
      }
      .statement-sheet {
        zoom: ${activeScale / 100} !important;
      }
      ${!settings.showHeader ? '.statement-modal-controls-bar, .statement-header-branding { display: none !important; }' : ''}
      ${!settings.showSignatures ? '.statement-signatures-section { display: none !important; }' : ''}
      ${!settings.showFooterTag ? '.statement-print-footer-tag { display: none !important; }' : ''}
    }
  `

  const modalNode = (
    <div className="custom-print-browser-backdrop" onClick={onClose}>
      <style>{dynamicPageCss}</style>

      <div className="custom-print-browser-shell" onClick={(e) => e.stopPropagation()}>
        
        {}
        <div className="custom-print-topbar no-print">
          <div className="print-topbar-left">
            <button
              type="button"
              className={`sidebar-toggle-btn ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Custom Print Settings Panel"
            >
              <Icon name="sliders" size={16} />
              <span>Print Format Config</span>
            </button>
            <div className="print-doc-title-group">
              <span className="print-doc-badge">Custom Print Studio Engine</span>
              <h2 className="print-doc-title">
                {group?.supervisor || 'ALL SUPERVISORS CONSOLIDATED'} &bull; {selectedDate || 'Daily Statement'}
              </h2>
            </div>
          </div>

          <div className="print-topbar-center">
            {}
            {allSupervisors.length > 1 && onSelectSupervisor && (
              <div className="print-supervisor-select-wrap">
                <Icon name="user" size={13} />
                <select
                  value={group?.supervisor}
                  onChange={(e) => {
                    if (e.target.value === 'ALL SUPERVISORS (CONSOLIDATED)') {
                      onSelectSupervisor({
                        supervisor: 'ALL SUPERVISORS (CONSOLIDATED)',
                        agents: allSupervisors.flatMap((s) => s.agents.map((a) => ({ ...a, teller: `${a.teller} (${s.supervisor})` }))),
                      })
                    } else {
                      const found = allSupervisors.find((s) => s.supervisor === e.target.value)
                      if (found) onSelectSupervisor(found)
                    }
                  }}
                  className="print-supervisor-dropdown"
                >
                  <option value="ALL SUPERVISORS (CONSOLIDATED)">ALL SUPERVISORS (CONSOLIDATED)</option>
                  <optgroup label="Individual Supervisors">
                    {allSupervisors.map((s) => (
                      <option key={s.supervisor} value={s.supervisor}>
                        {s.supervisor} ({s.agents.length} agents)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            {}
            <div className="stage-zoom-controls">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setViewZoom(Math.max(40, viewZoom - 10))}
                title="Zoom Out"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="zoom-text">{viewZoom}%</span>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setViewZoom(Math.min(160, viewZoom + 10))}
                title="Zoom In"
              >
                <Icon name="plus" size={13} />
              </button>
              <button
                type="button"
                className="zoom-btn reset-zoom-btn"
                onClick={() => setViewZoom(100)}
                title="Reset Zoom to 100%"
              >
                100%
              </button>
            </div>
          </div>

          <div className="print-topbar-right">
            <button
              type="button"
              className={`print-primary-btn ${!canPrint ? 'is-perm-locked' : ''}`}
              onClick={handlePrintDocument}
              title={canPrint ? "Send directly to printer or save to PDF with custom settings" : "Printing is locked for your account"}
            >
              <Icon name={canPrint ? "print" : "lock"} size={16} />
              <span>{canPrint ? "Print Document" : "Print Locked"}</span>
            </button>
            <button
              type="button"
              className="print-close-btn"
              onClick={onClose}
              title="Close Print Studio (Esc)"
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {}
        <div className="custom-print-body">

          {}
          {sidebarOpen && (
            <aside className="custom-print-sidebar no-print">
              <div className="sidebar-section">
                <h3 className="sidebar-section-title">
                  <Icon name="fileText" size={14} />
                  Paper &amp; Media Format
                </h3>
                <div className="setting-control-group">
                  <label htmlFor="paper-format-select">Paper Size Preset:</label>
                  <select
                    id="paper-format-select"
                    value={settings.paperFormat}
                    onChange={(e) => setSettings({ ...settings, paperFormat: e.target.value })}
                    className="setting-select"
                  >
                    <option value="a4">A4 Standard (210 × 297 mm)</option>
                    <option value="longBond">Long Bond / Folio (8.5 × 13 in)</option>
                    <option value="letter">US Letter (8.5 × 11 in)</option>
                    <option value="legal">US Legal (8.5 × 14 in)</option>
                    <option value="custom">Custom Dimensions...</option>
                  </select>
                  <small className="setting-help-text">{currentPaper.unitText}</small>
                </div>

                {settings.paperFormat === 'custom' && (
                  <div className="setting-custom-dims-row">
                    <div className="dim-field">
                      <label htmlFor="custom-width">Width (mm):</label>
                      <input
                        id="custom-width"
                        type="number"
                        min="100"
                        max="500"
                        value={settings.customWidthMm}
                        onChange={(e) => setSettings({ ...settings, customWidthMm: e.target.value })}
                        className="setting-input-num"
                      />
                    </div>
                    <div className="dim-field">
                      <label htmlFor="custom-height">Height (mm):</label>
                      <input
                        id="custom-height"
                        type="number"
                        min="100"
                        max="600"
                        value={settings.customHeightMm}
                        onChange={(e) => setSettings({ ...settings, customHeightMm: e.target.value })}
                        className="setting-input-num"
                      />
                    </div>
                  </div>
                )}

                <div className="setting-control-group" style={{ marginTop: '12px' }}>
                  <label>Orientation:</label>
                  <div className="segmented-toggle-group">
                    <button
                      type="button"
                      className={`seg-btn ${settings.orientation === 'portrait' ? 'active' : ''}`}
                      onClick={() => setSettings({ ...settings, orientation: 'portrait' })}
                    >
                      Portrait (Vertical)
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${settings.orientation === 'landscape' ? 'active' : ''}`}
                      onClick={() => setSettings({ ...settings, orientation: 'landscape' })}
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-section-title">
                  <Icon name="sliders" size={14} />
                  Margins &amp; Spacing
                </h3>
                <div className="setting-control-group">
                  <label htmlFor="margin-preset-select">Page Margins:</label>
                  <select
                    id="margin-preset-select"
                    value={settings.marginPreset}
                    onChange={(e) => setSettings({ ...settings, marginPreset: e.target.value })}
                    className="setting-select"
                  >
                    <option value="compact">Compact (4mm / 5mm)</option>
                    <option value="normal">Standard (8mm)</option>
                    <option value="wide">Spacious (12mm)</option>
                    <option value="zero">Zero Margins (0mm)</option>
                  </select>
                </div>
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-section-title">
                  <Icon name="sparkles" size={14} />
                  Fit &amp; Scale Mode
                </h3>
                <div className="setting-control-group">
                  <label className="checkbox-setting-label">
                    <input
                      type="checkbox"
                      checked={settings.autoFitOnePage}
                      onChange={(e) => setSettings({ ...settings, autoFitOnePage: e.target.checked })}
                    />
                    <span>Smart Auto-Fit to 1 Single Page</span>
                  </label>
                  <small className="setting-help-text">
                    {settings.autoFitOnePage
                      ? `Calculated Scale: ${computedFitScale}% (Auto-scaled to fit ${currentPaper.name})`
                      : 'Standard 100% scale (Content flows naturally across pages)'}
                  </small>
                </div>

                {!settings.autoFitOnePage && (
                  <div className="setting-control-group" style={{ marginTop: '10px' }}>
                    <div className="slider-label-row">
                      <label htmlFor="custom-scale-slider">Custom Scale:</label>
                      <span>{settings.fontScale}%</span>
                    </div>
                    <input
                      id="custom-scale-slider"
                      type="range"
                      min="50"
                      max="125"
                      value={settings.fontScale}
                      onChange={(e) => setSettings({ ...settings, fontScale: Number(e.target.value) })}
                      className="setting-slider"
                    />
                  </div>
                )}
              </div>

              <div className="sidebar-section">
                <h3 className="sidebar-section-title">
                  <Icon name="eye" size={14} />
                  Sections Visibility &amp; Style
                </h3>
                <div className="checkbox-group-stack">
                  <label className="checkbox-setting-label">
                    <input
                      type="checkbox"
                      checked={settings.showHeader}
                      onChange={(e) => setSettings({ ...settings, showHeader: e.target.checked })}
                    />
                    <span>Header Banner &amp; Metadata</span>
                  </label>
                  <label className="checkbox-setting-label">
                    <input
                      type="checkbox"
                      checked={settings.showSignatures}
                      onChange={(e) => setSettings({ ...settings, showSignatures: e.target.checked })}
                    />
                    <span>Signatures Block</span>
                  </label>
                  <label className="checkbox-setting-label">
                    <input
                      type="checkbox"
                      checked={settings.showFooterTag}
                      onChange={(e) => setSettings({ ...settings, showFooterTag: e.target.checked })}
                    />
                    <span>Audit Footer Timestamp</span>
                  </label>
                </div>

                <div className="setting-control-group" style={{ marginTop: '12px' }}>
                  <label>Color Output Mode:</label>
                  <div className="segmented-toggle-group">
                    <button
                      type="button"
                      className={`seg-btn ${settings.colorMode === 'color' ? 'active' : ''}`}
                      onClick={() => setSettings({ ...settings, colorMode: 'color' })}
                    >
                      Full Color
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${settings.colorMode === 'bw' ? 'active' : ''}`}
                      onClick={() => setSettings({ ...settings, colorMode: 'bw' })}
                    >
                      Monochrome / B&amp;W
                    </button>
                  </div>
                </div>
              </div>

              <div className="sidebar-reset-box">
                <button
                  type="button"
                  className="reset-defaults-btn"
                  onClick={() => setSettings(getSavedPrintSettings())}
                >
                  Reset Settings to Defaults
                </button>
              </div>
            </aside>
          )}

          {}
          <main className="custom-print-stage" ref={stageRef}>
            <div
              className="paper-viewport-transform"
              style={{
                transform: `scale(${viewZoom / 100})`,
                transformOrigin: 'top center',
              }}
            >
              {}
              <div
                className={`visual-paper-sheet ${settings.colorMode === 'bw' ? 'mode-monochrome' : ''}`}
                style={{
                  width: `${settings.orientation === 'landscape' ? currentPaper.heightPx : currentPaper.widthPx}px`,
                  minHeight: `${settings.orientation === 'landscape' ? currentPaper.widthPx : currentPaper.heightPx}px`,
                  padding: `${currentMargin.top} ${currentMargin.right} ${currentMargin.bottom} ${currentMargin.left}`,
                }}
              >
                <div className="paper-printable-content-area" ref={pageFrameRef}>
                  {children}
                </div>
              </div>
            </div>
          </main>

        </div>
      </div>
    </div>
  )

  return createPortal(modalNode, document.body)
}

export default CustomPrintBrowserModal
