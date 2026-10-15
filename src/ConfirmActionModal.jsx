import React from 'react'
import { createPortal } from 'react-dom'
import './ConfirmActionModal.css'

export default function ConfirmActionModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  details = null,
  confirmText = 'Yes, Proceed',
  cancelText = 'Cancel',
  confirmVariant = 'danger', 
  isProcessing = false,
  processingText = 'Processing...',
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null

  return createPortal(
    <div className="confirm-modal-overlay" onClick={isProcessing ? undefined : onCancel}>
      <div className="confirm-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-modal-icon-badge variant-${confirmVariant}`}>
          {isProcessing ? (
            <div className="confirm-spinner-ring"></div>
          ) : confirmVariant === 'danger' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          ) : confirmVariant === 'success' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          ) : confirmVariant === 'warning' ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>

        {details && (
          <div className="confirm-modal-details-card">
            {typeof details === 'string' ? <p style={{ margin: 0 }}>{details}</p> : details}
          </div>
        )}

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-btn-cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-btn-action variant-${confirmVariant}`}
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <span className="confirm-btn-spinner"></span>
                <span>{processingText}</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
