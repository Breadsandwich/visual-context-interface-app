import { useState, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import './Toast.css'

function useWidgetWidth(): number | null {
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const widget = document.querySelector('.floating-widget')
    if (!widget) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(widget)
    setWidth(widget.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  return width
}

export function Toast() {
  const toastMessage = useInspectorStore((s) => s.toastMessage)
  const isToastPersistent = useInspectorStore((s) => s.isToastPersistent)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const widgetWidth = useWidgetWidth()

  if (!toastMessage) return null

  const style = widgetWidth
    ? { maxWidth: `${Math.round(widgetWidth * 1.33)}px` }
    : undefined

  return (
    <div className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`} role="status" aria-live="polite" style={style}>
      {isToastPersistent && <span className="toast-spinner" />}
      <span className="toast-message">{toastMessage}</span>
      {!isToastPersistent && (
        <button
          className="toast-close"
          onClick={() => useInspectorStore.getState().dismissToast()}
          aria-label="Dismiss notification"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
