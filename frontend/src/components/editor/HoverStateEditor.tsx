type InteractionState = 'normal' | 'hover' | 'focus' | 'active'

interface HoverStateEditorProps {
  activeState: InteractionState
  onStateChange: (state: InteractionState) => void
}

const STATES: { value: InteractionState; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'hover', label: 'Hover' },
  { value: 'focus', label: 'Focus' },
  { value: 'active', label: 'Active' },
]

export function HoverStateEditor({ activeState, onStateChange }: HoverStateEditorProps) {
  return (
    <div className="editor-state-tabs">
      {STATES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`editor-state-tab ${activeState === s.value ? 'editor-state-tab-active' : ''}`}
          onClick={() => onStateChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

export type { InteractionState }
