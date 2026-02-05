import { useInspectorStore } from '../stores/inspectorStore'
import type { InspectorMode } from '../types/inspector'
import './ModeToggle.css'

const modes: { value: InspectorMode; label: string; icon: string }[] = [
  { value: 'interaction', label: 'Interact', icon: '👆' },
  { value: 'inspection', label: 'Inspect', icon: '🪄' },
  { value: 'screenshot', label: 'Screenshot', icon: '📸' }
]

export function ModeToggle() {
  const { mode, setMode } = useInspectorStore()

  return (
    <div className="mode-toggle">
      {modes.map((m) => (
        <button
          key={m.value}
          className={`mode-button ${mode === m.value ? 'active' : ''}`}
          onClick={() => setMode(m.value)}
          title={m.label}
        >
          <span className="mode-icon">{m.icon}</span>
          <span className="mode-label">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
