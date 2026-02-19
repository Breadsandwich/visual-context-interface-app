import { CollapsibleSection } from './CollapsibleSection'
import { SegmentedControl } from './controls/SegmentedControl'

interface OverflowEditorProps {
  overflowX: string
  overflowY: string
  cursor: string
  onPropertyChange: (property: string, value: string) => void
}

const OVERFLOW_OPTIONS = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'auto', label: 'Auto' },
]

const CURSOR_OPTIONS = [
  'default', 'pointer', 'grab', 'text', 'crosshair', 'not-allowed', 'move', 'wait',
]

export function OverflowEditor({
  overflowX,
  overflowY,
  cursor,
  onPropertyChange,
}: OverflowEditorProps) {
  return (
    <CollapsibleSection title="Overflow" defaultOpen={false}>
      <SegmentedControl
        label="Overflow X"
        options={OVERFLOW_OPTIONS}
        value={overflowX}
        onChange={(v) => onPropertyChange('overflowX', v)}
      />

      <div style={{ marginTop: '0.375rem' }}>
        <SegmentedControl
          label="Overflow Y"
          options={OVERFLOW_OPTIONS}
          value={overflowY}
          onChange={(v) => onPropertyChange('overflowY', v)}
        />
      </div>

      <div className="editor-field" style={{ marginTop: '0.375rem' }}>
        <label className="editor-label">Cursor</label>
        <select
          className="editor-select"
          value={cursor}
          onChange={(e) => onPropertyChange('cursor', e.target.value)}
        >
          {CURSOR_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </CollapsibleSection>
  )
}
