import { useState, useCallback } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { ColorPicker } from './ColorPicker'
import { NumberInput } from './controls/NumberInput'
import { SegmentedControl } from './controls/SegmentedControl'

interface StrokeEditorProps {
  borderColor: string
  borderWidth: string
  borderStyle: string
  onPropertyChange: (property: string, value: string) => void
}

const BORDER_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' },
]

export function StrokeEditor({
  borderColor,
  borderWidth,
  borderStyle,
  onPropertyChange,
}: StrokeEditorProps) {
  const [linked, setLinked] = useState(true)
  const widthNum = parseFloat(borderWidth) || 0

  const handleWidthChange = useCallback(
    (value: number) => {
      if (linked) {
        onPropertyChange('borderWidth', `${value}px`)
      }
    },
    [linked, onPropertyChange]
  )

  return (
    <CollapsibleSection title="Stroke" defaultOpen={false}>
      <ColorPicker
        label="Color"
        value={borderColor}
        onChange={(v) => onPropertyChange('borderColor', v)}
      />

      <div style={{ marginTop: '0.375rem' }}>
        <SegmentedControl
          label="Style"
          options={BORDER_STYLE_OPTIONS}
          value={borderStyle}
          onChange={(v) => onPropertyChange('borderStyle', v)}
        />
      </div>

      <div className="editor-row" style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Width"
          value={widthNum}
          min={0}
          max={20}
          step={1}
          suffix="px"
          onChange={handleWidthChange}
        />
        <button
          type="button"
          className={`editor-toggle-btn ${linked ? 'editor-toggle-btn-active' : ''}`}
          onClick={() => setLinked((p) => !p)}
          title={linked ? 'Linked (all sides)' : 'Unlinked'}
        >
          {linked ? 'All' : 'Each'}
        </button>
      </div>
    </CollapsibleSection>
  )
}
