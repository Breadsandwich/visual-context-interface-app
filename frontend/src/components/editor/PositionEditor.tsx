import { CollapsibleSection } from './CollapsibleSection'
import { SegmentedControl } from './controls/SegmentedControl'
import { CssValueInput } from './controls/CssValueInput'
import { NumberInput } from './controls/NumberInput'

interface PositionEditorProps {
  position: string
  top: string
  right: string
  bottom: string
  left: string
  zIndex: string
  onPropertyChange: (property: string, value: string) => void
}

const POSITION_OPTIONS = [
  { value: 'static', label: 'Static' },
  { value: 'relative', label: 'Relative' },
  { value: 'absolute', label: 'Absolute' },
  { value: 'fixed', label: 'Fixed' },
]

export function PositionEditor({
  position,
  top,
  right,
  bottom,
  left,
  zIndex,
  onPropertyChange,
}: PositionEditorProps) {
  const showOffsets = position !== 'static'
  const zIndexNum = parseInt(zIndex, 10) || 0

  return (
    <CollapsibleSection title="Position" defaultOpen={false}>
      <SegmentedControl
        label="Position"
        options={POSITION_OPTIONS}
        value={position}
        onChange={(v) => onPropertyChange('position', v)}
      />

      {showOffsets && (
        <div className="editor-card-grid" style={{ marginTop: '0.375rem' }}>
          <CssValueInput
            label="Top"
            value={top}
            placeholder="auto"
            onChange={(v) => onPropertyChange('top', v)}
          />
          <CssValueInput
            label="Right"
            value={right}
            placeholder="auto"
            onChange={(v) => onPropertyChange('right', v)}
          />
          <CssValueInput
            label="Bottom"
            value={bottom}
            placeholder="auto"
            onChange={(v) => onPropertyChange('bottom', v)}
          />
          <CssValueInput
            label="Left"
            value={left}
            placeholder="auto"
            onChange={(v) => onPropertyChange('left', v)}
          />
        </div>
      )}

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Z-Index"
          value={zIndexNum}
          min={-100}
          max={1000}
          step={1}
          onChange={(v) => onPropertyChange('zIndex', String(v))}
        />
      </div>
    </CollapsibleSection>
  )
}
