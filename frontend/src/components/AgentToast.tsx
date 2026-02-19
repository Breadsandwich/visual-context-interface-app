import './AgentToast.css'

function SpinnerIcon() {
  return (
    <svg className="toast-icon toast-icon-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
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

interface AgentToastProps {
  agentName: string
  status: 'running' | 'success' | 'error' | 'clarifying'
  summary: string
  task: string
}

export function AgentToast({ agentName, status, summary, task }: AgentToastProps) {
  return (
    <div className={`agent-toast agent-toast-${status}`} role="status" aria-live="polite">
      <div className="agent-toast-header">
        <span className="agent-toast-badge">{agentName}</span>
        {status === 'running' && <SpinnerIcon />}
        {status === 'success' && <CheckIcon />}
        {status === 'error' && <ErrorIcon />}
      </div>
      <span className="agent-toast-summary">{summary || task}</span>
    </div>
  )
}
