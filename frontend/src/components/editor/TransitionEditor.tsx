import { useState } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { NumberInput } from './controls/NumberInput'

interface TransitionEditorProps {
  transition: string
  onPropertyChange: (property: string, value: string) => void
}

const TRANSITION_PROPERTIES = [
  'all', 'opacity', 'transform', 'background-color',
  'color', 'box-shadow', 'border-color', 'width', 'height',
]

const TIMING_FUNCTIONS = [
  'ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out',
]

function parseTransition(css: string): {
  property: string
  duration: number
  timing: string
  delay: number
} {
  const defaults = { property: 'all', duration: 0.3, timing: 'ease', delay: 0 }
  if (!css || css === 'none' || css === 'all 0s ease 0s') return defaults

  // Only parse the first transition segment (multi-property support is not yet implemented)
  const firstSegment = css.split(',')[0].trim()
  const parts = firstSegment.split(/\s+/)
  const prop = TRANSITION_PROPERTIES.includes(parts[0]) ? parts[0] : 'all'
  const dur = parseFloat(parts[1]) || 0.3
  const timing = TIMING_FUNCTIONS.includes(parts[2]) ? parts[2] : 'ease'
  const del = parseFloat(parts[3]) || 0

  return { property: prop, duration: dur, timing, delay: del }
}

function serializeTransition(property: string, duration: number, timing: string, delay: number): string {
  return `${property} ${duration}s ${timing} ${delay}s`
}

export function TransitionEditor({ transition, onPropertyChange }: TransitionEditorProps) {
  const [data, setData] = useState(() => parseTransition(transition))

  const update = (updates: Partial<typeof data>) => {
    const next = { ...data, ...updates }
    setData(next)
    onPropertyChange('transition', serializeTransition(next.property, next.duration, next.timing, next.delay))
  }

  return (
    <CollapsibleSection title="Transition" defaultOpen={false}>
      <div className="editor-field">
        <label className="editor-label">Property</label>
        <select
          className="editor-select"
          value={data.property}
          onChange={(e) => update({ property: e.target.value })}
        >
          {TRANSITION_PROPERTIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Duration"
          value={data.duration}
          min={0}
          max={5}
          step={0.05}
          suffix="s"
          onChange={(v) => update({ duration: v })}
        />
      </div>

      <div className="editor-field" style={{ marginTop: '0.375rem' }}>
        <label className="editor-label">Timing</label>
        <select
          className="editor-select"
          value={data.timing}
          onChange={(e) => update({ timing: e.target.value })}
        >
          {TIMING_FUNCTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Delay"
          value={data.delay}
          min={0}
          max={5}
          step={0.05}
          suffix="s"
          onChange={(v) => update({ delay: v })}
        />
      </div>
    </CollapsibleSection>
  )
}
