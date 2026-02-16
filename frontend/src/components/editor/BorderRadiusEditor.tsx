import { useState, useCallback } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { NumberInput } from './controls/NumberInput'

interface BorderRadiusEditorProps {
  borderTopLeftRadius: string
  borderTopRightRadius: string
  borderBottomRightRadius: string
  borderBottomLeftRadius: string
  onPropertyChange: (property: string, value: string) => void
}

const CORNERS = [
  { prop: 'borderTopLeftRadius', label: 'TL', row: 1, col: 1 },
  { prop: 'borderTopRightRadius', label: 'TR', row: 1, col: 3 },
  { prop: 'borderBottomRightRadius', label: 'BR', row: 3, col: 3 },
  { prop: 'borderBottomLeftRadius', label: 'BL', row: 3, col: 1 },
] as const

export function BorderRadiusEditor({
  borderTopLeftRadius,
  borderTopRightRadius,
  borderBottomRightRadius,
  borderBottomLeftRadius,
  onPropertyChange,
}: BorderRadiusEditorProps) {
  const [linked, setLinked] = useState(true)

  const values: Record<string, number> = {
    borderTopLeftRadius: parseFloat(borderTopLeftRadius) || 0,
    borderTopRightRadius: parseFloat(borderTopRightRadius) || 0,
    borderBottomRightRadius: parseFloat(borderBottomRightRadius) || 0,
    borderBottomLeftRadius: parseFloat(borderBottomLeftRadius) || 0,
  }

  const handleChange = useCallback(
    (prop: string, value: number) => {
      if (linked) {
        for (const corner of CORNERS) {
          onPropertyChange(corner.prop, `${value}px`)
        }
      } else {
        onPropertyChange(prop, `${value}px`)
      }
    },
    [linked, onPropertyChange]
  )

  return (
    <CollapsibleSection title="Corners" defaultOpen={false}>
      <div className="editor-corners-visual" style={{
        '--tl': `${values.borderTopLeftRadius}px`,
        '--tr': `${values.borderTopRightRadius}px`,
        '--br': `${values.borderBottomRightRadius}px`,
        '--bl': `${values.borderBottomLeftRadius}px`,
      } as React.CSSProperties}>
        {CORNERS.map((c) => (
          <div
            key={c.prop}
            style={{ gridRow: c.row, gridColumn: c.col }}
          >
            <NumberInput
              label={c.label}
              value={values[c.prop]}
              min={0}
              max={100}
              step={1}
              suffix="px"
              onChange={(v) => handleChange(c.prop, v)}
            />
          </div>
        ))}
        <div className="editor-corners-box" />
      </div>

      <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
        <button
          type="button"
          className={`editor-toggle-btn ${linked ? 'editor-toggle-btn-active' : ''}`}
          onClick={() => setLinked((p) => !p)}
          title={linked ? 'Linked (all corners)' : 'Unlinked (independent)'}
        >
          {linked ? 'Linked' : 'Each'}
        </button>
      </div>
    </CollapsibleSection>
  )
}
