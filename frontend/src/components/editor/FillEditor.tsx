import { useState, useCallback, useRef } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { ColorPicker } from './ColorPicker'
import { NumberInput } from './controls/NumberInput'
import { SegmentedControl } from './controls/SegmentedControl'

interface FillEditorProps {
  color: string
  backgroundColor: string
  backgroundImage: string
  onPropertyChange: (property: string, value: string) => void
}

type FillMode = 'solid' | 'gradient'
type GradientType = 'linear' | 'radial'

const GRADIENT_TYPE_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
]

function parseGradient(css: string): {
  type: GradientType
  angle: number
  startColor: string
  endColor: string
} {
  const defaults = { type: 'linear' as GradientType, angle: 135, startColor: '#4361ee', endColor: '#7b2ff7' }
  if (!css || css === 'none') return defaults

  const linearMatch = css.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/)
  if (linearMatch) {
    return {
      type: 'linear',
      angle: parseInt(linearMatch[1], 10),
      startColor: linearMatch[2].trim(),
      endColor: linearMatch[3].trim(),
    }
  }

  const radialMatch = css.match(/radial-gradient\(circle,\s*([^,]+),\s*([^)]+)\)/)
  if (radialMatch) {
    return {
      type: 'radial',
      angle: 0,
      startColor: radialMatch[1].trim(),
      endColor: radialMatch[2].trim(),
    }
  }

  return defaults
}

function serializeGradient(type: GradientType, angle: number, start: string, end: string): string {
  if (type === 'radial') return `radial-gradient(circle, ${start}, ${end})`
  return `linear-gradient(${angle}deg, ${start}, ${end})`
}

export function FillEditor({
  color,
  backgroundColor,
  backgroundImage,
  onPropertyChange,
}: FillEditorProps) {
  const hasGradient = backgroundImage !== '' && backgroundImage !== 'none'
  const [fillMode, setFillMode] = useState<FillMode>(hasGradient ? 'gradient' : 'solid')
  const [gradient, setGradient] = useState(() => parseGradient(backgroundImage))
  const gradientRef = useRef(gradient)
  gradientRef.current = gradient

  const updateGradient = useCallback(
    (updates: Partial<typeof gradient>) => {
      const next = { ...gradientRef.current, ...updates }
      setGradient(next)
      onPropertyChange(
        'backgroundImage',
        serializeGradient(next.type, next.angle, next.startColor, next.endColor)
      )
    },
    [onPropertyChange]
  )

  const handleFillModeChange = (mode: string) => {
    const nextMode = mode as FillMode
    setFillMode(nextMode)
    if (nextMode === 'solid') {
      onPropertyChange('backgroundImage', 'none')
    } else {
      updateGradient({})
    }
  }

  return (
    <CollapsibleSection title="Fill">
      <ColorPicker
        label="Text"
        value={color}
        onChange={(v) => onPropertyChange('color', v)}
      />

      <div style={{ marginTop: '0.5rem' }}>
        <SegmentedControl
          label="Background"
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          value={fillMode}
          onChange={handleFillModeChange}
        />
      </div>

      {fillMode === 'solid' ? (
        <div style={{ marginTop: '0.375rem' }}>
          <ColorPicker
            label="Color"
            value={backgroundColor}
            onChange={(v) => onPropertyChange('backgroundColor', v)}
          />
        </div>
      ) : (
        <div style={{ marginTop: '0.375rem' }}>
          <div
            className="editor-gradient-preview"
            style={{
              background: serializeGradient(
                gradient.type,
                gradient.angle,
                gradient.startColor,
                gradient.endColor
              ),
            }}
          />

          <SegmentedControl
            label="Type"
            options={GRADIENT_TYPE_OPTIONS}
            value={gradient.type}
            onChange={(v) => updateGradient({ type: v as GradientType })}
          />

          {gradient.type === 'linear' && (
            <div style={{ marginTop: '0.375rem' }}>
              <NumberInput
                label="Angle"
                value={gradient.angle}
                min={0}
                max={360}
                step={1}
                suffix="deg"
                onChange={(v) => updateGradient({ angle: v })}
              />
            </div>
          )}

          <div style={{ marginTop: '0.375rem' }}>
            <ColorPicker
              label="Start"
              value={gradient.startColor}
              onChange={(v) => updateGradient({ startColor: v })}
            />
          </div>

          <div style={{ marginTop: '0.375rem' }}>
            <ColorPicker
              label="End"
              value={gradient.endColor}
              onChange={(v) => updateGradient({ endColor: v })}
            />
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}
