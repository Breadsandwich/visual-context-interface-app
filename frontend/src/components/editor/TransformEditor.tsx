import { useState, useCallback, useRef } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { NumberInput } from './controls/NumberInput'
import {
  parseTransform,
  serializeTransform,
  ORIGIN_LABELS,
  originToPercent,
  percentToOrigin,
  type TransformData,
} from './utils/transformParser'

interface TransformEditorProps {
  transform: string
  transformOrigin: string
  onPropertyChange: (property: string, value: string) => void
}

export function TransformEditor({
  transform,
  transformOrigin,
  onPropertyChange,
}: TransformEditorProps) {
  const [data, setData] = useState<TransformData>(() => parseTransform(transform))
  const dataRef = useRef(data)
  dataRef.current = data
  const [scaleLinked, setScaleLinked] = useState(true)

  const currentOrigin = percentToOrigin(transformOrigin)

  const update = useCallback(
    (updates: Partial<TransformData>) => {
      const next = { ...dataRef.current, ...updates }
      setData(next)
      onPropertyChange('transform', serializeTransform(next))
    },
    [onPropertyChange]
  )

  const handleScaleX = useCallback(
    (v: number) => {
      if (scaleLinked) {
        update({ scaleX: v, scaleY: v })
      } else {
        update({ scaleX: v })
      }
    },
    [scaleLinked, update]
  )

  const handleScaleY = useCallback(
    (v: number) => {
      if (scaleLinked) {
        update({ scaleX: v, scaleY: v })
      } else {
        update({ scaleY: v })
      }
    },
    [scaleLinked, update]
  )

  return (
    <CollapsibleSection title="Transform" defaultOpen={false}>
      <NumberInput
        label="Rotate"
        value={data.rotate}
        min={-360}
        max={360}
        step={1}
        suffix="deg"
        onChange={(v) => update({ rotate: v })}
      />

      <div className="editor-row" style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Scale X"
          value={data.scaleX}
          min={0.1}
          max={3}
          step={0.05}
          onChange={handleScaleX}
        />
        <button
          type="button"
          className={`editor-toggle-btn ${scaleLinked ? 'editor-toggle-btn-active' : ''}`}
          onClick={() => setScaleLinked((p) => !p)}
          title={scaleLinked ? 'Linked' : 'Unlinked'}
        >
          {scaleLinked ? 'Link' : 'Free'}
        </button>
      </div>

      {!scaleLinked && (
        <div style={{ marginTop: '0.375rem' }}>
          <NumberInput
            label="Scale Y"
            value={data.scaleY}
            min={0.1}
            max={3}
            step={0.05}
            onChange={handleScaleY}
          />
        </div>
      )}

      <div className="editor-card-grid" style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Move X"
          value={data.translateX}
          min={-500}
          max={500}
          step={1}
          suffix="px"
          onChange={(v) => update({ translateX: v })}
        />
        <NumberInput
          label="Move Y"
          value={data.translateY}
          min={-500}
          max={500}
          step={1}
          suffix="px"
          onChange={(v) => update({ translateY: v })}
        />
      </div>

      <div className="editor-card-grid" style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Skew X"
          value={data.skewX}
          min={-45}
          max={45}
          step={1}
          suffix="deg"
          onChange={(v) => update({ skewX: v })}
        />
        <NumberInput
          label="Skew Y"
          value={data.skewY}
          min={-45}
          max={45}
          step={1}
          suffix="deg"
          onChange={(v) => update({ skewY: v })}
        />
      </div>

      <div className="editor-field" style={{ marginTop: '0.5rem' }}>
        <label className="editor-label">Origin</label>
        <div className="editor-origin-grid">
          {ORIGIN_LABELS.map((label) => (
            <button
              key={label}
              type="button"
              className={`editor-origin-dot ${currentOrigin === label ? 'editor-origin-dot-active' : ''}`}
              onClick={() => onPropertyChange('transformOrigin', originToPercent(label))}
              title={label}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  )
}
