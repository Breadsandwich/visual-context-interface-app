import { useState, useCallback, useRef } from 'react'
import { CollapsibleSection } from './CollapsibleSection'
import { NumberInput } from './controls/NumberInput'
import { parseFilter, serializeFilter, type FilterData } from './utils/filterParser'

interface EffectsEditorProps {
  opacity: string
  filter: string
  backdropFilter: string
  mixBlendMode: string
  onPropertyChange: (property: string, value: string) => void
}

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken',
  'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion',
]

export function EffectsEditor({
  opacity,
  filter,
  backdropFilter,
  mixBlendMode,
  onPropertyChange,
}: EffectsEditorProps) {
  const opacityNum = parseFloat(opacity) || 1
  const [filterData, setFilterData] = useState<FilterData>(() => parseFilter(filter))
  const filterRef = useRef(filterData)
  filterRef.current = filterData

  const backdropBlurMatch = backdropFilter.match(/blur\((\d+(?:\.\d+)?)px\)/)
  const backdropBlur = backdropBlurMatch ? parseFloat(backdropBlurMatch[1]) : 0

  const updateFilter = useCallback(
    (updates: Partial<FilterData>) => {
      const next = { ...filterRef.current, ...updates }
      setFilterData(next)
      onPropertyChange('filter', serializeFilter(next))
    },
    [onPropertyChange]
  )

  return (
    <CollapsibleSection title="Effects" defaultOpen={false}>
      <div className="editor-slider-row">
        <label className="editor-label">Opacity</label>
        <input
          type="range"
          className="editor-slider"
          min={0}
          max={1}
          step={0.05}
          value={opacityNum}
          onChange={(e) => onPropertyChange('opacity', e.target.value)}
        />
        <span className="editor-slider-value">{opacityNum}</span>
      </div>

      <NumberInput
        label="Blur"
        value={filterData.blur}
        min={0}
        max={50}
        step={1}
        suffix="px"
        onChange={(v) => updateFilter({ blur: v })}
      />

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Brightness"
          value={filterData.brightness}
          min={0}
          max={200}
          step={5}
          suffix="%"
          onChange={(v) => updateFilter({ brightness: v })}
        />
      </div>

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Contrast"
          value={filterData.contrast}
          min={0}
          max={200}
          step={5}
          suffix="%"
          onChange={(v) => updateFilter({ contrast: v })}
        />
      </div>

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Saturate"
          value={filterData.saturate}
          min={0}
          max={200}
          step={5}
          suffix="%"
          onChange={(v) => updateFilter({ saturate: v })}
        />
      </div>

      <div style={{ marginTop: '0.375rem' }}>
        <NumberInput
          label="Hue"
          value={filterData.hueRotate}
          min={0}
          max={360}
          step={5}
          suffix="deg"
          onChange={(v) => updateFilter({ hueRotate: v })}
        />
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <NumberInput
          label="BG Blur"
          value={backdropBlur}
          min={0}
          max={50}
          step={1}
          suffix="px"
          onChange={(v) => onPropertyChange('backdropFilter', v > 0 ? `blur(${v}px)` : 'none')}
        />
      </div>

      <div className="editor-field" style={{ marginTop: '0.5rem' }}>
        <label className="editor-label">Blend Mode</label>
        <select
          className="editor-select"
          value={mixBlendMode}
          onChange={(e) => onPropertyChange('mixBlendMode', e.target.value)}
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </CollapsibleSection>
  )
}
