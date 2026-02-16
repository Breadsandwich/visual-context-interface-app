import { useState, useCallback, useRef } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { ColorPicker } from './ColorPicker'
import { NumberInput } from './controls/NumberInput'
import {
  parseShadows,
  serializeShadows,
  createDefaultShadow,
  type ShadowData,
} from './utils/shadowParser'

interface ShadowEditorProps {
  boxShadow: string
  onPropertyChange: (property: string, value: string) => void
}

export function ShadowEditor({ boxShadow, onPropertyChange }: ShadowEditorProps) {
  const [shadows, setShadows] = useState<ShadowData[]>(() => parseShadows(boxShadow))
  const shadowsRef = useRef(shadows)
  shadowsRef.current = shadows

  const commit = useCallback(
    (next: ShadowData[]) => {
      setShadows(next)
      onPropertyChange('boxShadow', serializeShadows(next))
    },
    [onPropertyChange]
  )

  const updateShadow = useCallback(
    (index: number, updates: Partial<ShadowData>) => {
      const next = shadowsRef.current.map((s, i) => (i === index ? { ...s, ...updates } : s))
      commit(next)
    },
    [commit]
  )

  const removeShadow = useCallback(
    (index: number) => {
      commit(shadowsRef.current.filter((_, i) => i !== index))
    },
    [commit]
  )

  const addShadow = useCallback(() => {
    commit([...shadowsRef.current, createDefaultShadow()])
  }, [commit])

  return (
    <CollapsibleSection title="Shadows" defaultOpen={false}>
      <div className="editor-card-list">
        {shadows.map((shadow, i) => (
          <div key={i} className="editor-card">
            <div className="editor-card-header">
              <span className="editor-card-title">Shadow {i + 1}</span>
              <button
                type="button"
                className="editor-card-delete"
                onClick={() => removeShadow(i)}
                title="Remove shadow"
              >
                x
              </button>
            </div>

            <ColorPicker
              label="Color"
              value={shadow.color}
              onChange={(v) => updateShadow(i, { color: v })}
            />

            <div className="editor-card-grid" style={{ marginTop: '0.375rem' }}>
              <NumberInput
                label="X"
                value={shadow.x}
                min={-100}
                max={100}
                step={1}
                suffix="px"
                onChange={(v) => updateShadow(i, { x: v })}
              />
              <NumberInput
                label="Y"
                value={shadow.y}
                min={-100}
                max={100}
                step={1}
                suffix="px"
                onChange={(v) => updateShadow(i, { y: v })}
              />
              <NumberInput
                label="Blur"
                value={shadow.blur}
                min={0}
                max={100}
                step={1}
                suffix="px"
                onChange={(v) => updateShadow(i, { blur: v })}
              />
              <NumberInput
                label="Spread"
                value={shadow.spread}
                min={-50}
                max={50}
                step={1}
                suffix="px"
                onChange={(v) => updateShadow(i, { spread: v })}
              />
            </div>

            <div style={{ marginTop: '0.375rem' }}>
              <button
                type="button"
                className={`editor-toggle-btn ${shadow.inset ? 'editor-toggle-btn-active' : ''}`}
                onClick={() => updateShadow(i, { inset: !shadow.inset })}
              >
                Inset
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="editor-add-button"
        onClick={addShadow}
        style={{ marginTop: shadows.length > 0 ? '0.375rem' : 0 }}
      >
        + Add shadow
      </button>
    </CollapsibleSection>
  )
}
