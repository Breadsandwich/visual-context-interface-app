interface LayoutEditorProps {
  display: string
  width: string
  height: string
  flexDirection: string
  alignItems: string
  justifyContent: string
  gap: string
  opacity: string
  onPropertyChange: (property: string, value: string) => void
}

const DISPLAY_OPTIONS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none']

const FLEX_DIRECTION_OPTIONS = ['row', 'row-reverse', 'column', 'column-reverse']

const ALIGN_OPTIONS = ['stretch', 'flex-start', 'flex-end', 'center', 'baseline']

const JUSTIFY_OPTIONS = [
  'flex-start',
  'flex-end',
  'center',
  'space-between',
  'space-around',
  'space-evenly',
]

export function LayoutEditor({
  display,
  width,
  height,
  flexDirection,
  alignItems,
  justifyContent,
  gap,
  opacity,
  onPropertyChange,
}: LayoutEditorProps) {
  const opacityNum = parseFloat(opacity) || 1
  const isFlexLayout = display === 'flex' || display === 'inline-flex'

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Layout</h4>

      <div className="editor-field">
        <label className="editor-label">Display</label>
        <select
          className="editor-select"
          value={display}
          onChange={(e) => onPropertyChange('display', e.target.value)}
        >
          {DISPLAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label className="editor-label">Width</label>
        <input
          type="text"
          className="editor-input"
          value={width}
          onChange={(e) => onPropertyChange('width', e.target.value)}
          placeholder="auto"
        />
      </div>

      <div className="editor-field">
        <label className="editor-label">Height</label>
        <input
          type="text"
          className="editor-input"
          value={height}
          onChange={(e) => onPropertyChange('height', e.target.value)}
          placeholder="auto"
        />
      </div>

      {isFlexLayout && (
        <>
          <div className="editor-field">
            <label className="editor-label">Flex Direction</label>
            <select
              className="editor-select"
              value={flexDirection}
              onChange={(e) => onPropertyChange('flexDirection', e.target.value)}
            >
              {FLEX_DIRECTION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-label">Align Items</label>
            <select
              className="editor-select"
              value={alignItems}
              onChange={(e) => onPropertyChange('alignItems', e.target.value)}
            >
              {ALIGN_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-label">Justify Content</label>
            <select
              className="editor-select"
              value={justifyContent}
              onChange={(e) => onPropertyChange('justifyContent', e.target.value)}
            >
              {JUSTIFY_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-label">Gap</label>
            <input
              type="text"
              className="editor-input"
              value={gap}
              onChange={(e) => onPropertyChange('gap', e.target.value)}
              placeholder="0px"
            />
          </div>
        </>
      )}

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
    </div>
  )
}
