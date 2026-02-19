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

function SpinnerIcon() {
  return (
    <svg className="toast-icon toast-icon-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M6 6a2 2 0 1 1 2.5 1.94c-.36.12-.5.36-.5.73V9.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="#fff" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M10 6L6 10M6 6l4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ClarificationToast({ question, onSubmit, onSkip }: {
  question: string
  onSubmit: (response: string) => void
  onSkip: () => void
}) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(input.trim())
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="toast-clarification">
      <div className="toast-clarification-header">
        <QuestionIcon />
        <span className="toast-clarification-label">Clarification needed</span>
      </div>
      <p className="toast-clarification-question">{question}</p>
      <div className="toast-clarification-input-row">
        <input
          type="text"
          className="toast-clarification-input"
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          autoFocus
        />
        <button
          className="toast-clarification-submit"
          onClick={handleSubmit}
          disabled={!input.trim() || submitting}
        >
          Send
        </button>
        <button
          className="toast-clarification-skip"
          onClick={onSkip}
          disabled={submitting}
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function ProgressToast({ summary }: {
  summary: string
}) {
  return (
    <div className="toast-progress-content">
      <SpinnerIcon />
      <span className="toast-message">{summary}</span>
    </div>
  )
}

export function Toast() {
  const toastMessage = useInspectorStore((s) => s.toastMessage)
  const isToastPersistent = useInspectorStore((s) => s.isToastPersistent)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const agentClarification = useInspectorStore((s) => s.agentClarification)
  const agentProgress = useInspectorStore((s) => s.agentProgress)
  const widgetWidth = useWidgetWidth()

  const { submitClarification, dismissToast } = useInspectorStore.getState()

  // Clarification mode
  if (agentClarification) {
    const style = widgetWidth
      ? { maxWidth: `${Math.round(widgetWidth * 1.6)}px`, minWidth: '320px' }
      : { minWidth: '320px' }

    return (
      <div
        className={`toast toast-expanded ${isSidebarOpen ? 'sidebar-open' : ''}`}
        role="dialog"
        aria-label="Agent clarification"
        style={style}
      >
        <ClarificationToast
          question={agentClarification.question}
          onSubmit={async (response) => {
            await submitClarification(response)
          }}
          onSkip={async () => {
            await submitClarification('Proceed with your best judgment')
          }}
        />
      </div>
    )
  }

  // Progress mode (persistent toast with progress data)
  if (isToastPersistent && agentProgress.length > 0) {
    const latest = agentProgress[agentProgress.length - 1]
    const style = widgetWidth
      ? { maxWidth: `${Math.round(widgetWidth * 1.33)}px` }
      : undefined

    return (
      <div
        className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`}
        role="status"
        aria-live="polite"
        style={style}
      >
        <ProgressToast summary={latest.summary} />
      </div>
    )
  }

  // Completion/standard mode (existing behavior)
  if (!toastMessage) return null

  const style = widgetWidth
    ? { maxWidth: `${Math.round(widgetWidth * 1.33)}px` }
    : undefined

  return (
    <div className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`} role="status" aria-live="polite" style={style}>
      {isToastPersistent && <SpinnerIcon />}
      {!isToastPersistent && toastMessage === 'Work done' && <CheckIcon />}
      {!isToastPersistent && toastMessage?.startsWith('Agent error') && <ErrorIcon />}
      <span className="toast-message">{toastMessage}</span>
      {!isToastPersistent && (
        <button
          className="toast-close"
          onClick={() => dismissToast()}
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
