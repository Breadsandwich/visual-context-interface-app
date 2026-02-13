import { useInspectorStore } from '../stores/inspectorStore'
import './Toast.css'

export function Toast() {
  const toastMessage = useInspectorStore((s) => s.toastMessage)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)

  if (!toastMessage) return null

  return (
    <div className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`} role="status" aria-live="polite">
      <span className="toast-message">{toastMessage}</span>
      <button
        className="toast-close"
        onClick={() => useInspectorStore.getState().dismissToast()}
        aria-label="Dismiss notification"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
