interface TypographyEditorProps {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  onPropertyChange: (property: string, value: string) => void
}

const FONT_FAMILIES = [
  'inherit',
  'system-ui',
  'Georgia',
  'Menlo',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
]

const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900']

export function TypographyEditor({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  onPropertyChange,
}: TypographyEditorProps) {
  const fontSizeNum = parseFloat(fontSize) || 16
  const lineHeightNum = parseFloat(lineHeight) || 1.5
  const letterSpacingNum = parseFloat(letterSpacing) || 0

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Typography</h4>

      <div className="editor-field">
        <label className="editor-label">Font Family</label>
        <select
          className="editor-select"
          value={fontFamily}
          onChange={(e) => onPropertyChange('fontFamily', e.target.value)}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label className="editor-label">Font Weight</label>
        <select
          className="editor-select"
          value={fontWeight}
          onChange={(e) => onPropertyChange('fontWeight', e.target.value)}
        >
          {FONT_WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className="editor-slider-row">
        <label className="editor-label">Font Size</label>
        <input
          type="range"
          className="editor-slider"
          min={8}
          max={72}
          step={1}
          value={fontSizeNum}
          onChange={(e) => onPropertyChange('fontSize', `${e.target.value}px`)}
        />
        <span className="editor-slider-value">{fontSizeNum}px</span>
      </div>

      <div className="editor-slider-row">
        <label className="editor-label">Line Height</label>
        <input
          type="range"
          className="editor-slider"
          min={0.5}
          max={3}
          step={0.1}
          value={lineHeightNum}
          onChange={(e) => onPropertyChange('lineHeight', e.target.value)}
        />
        <span className="editor-slider-value">{lineHeightNum}</span>
      </div>

      <div className="editor-slider-row">
        <label className="editor-label">Letter Spacing</label>
        <input
          type="range"
          className="editor-slider"
          min={-2}
          max={10}
          step={0.5}
          value={letterSpacingNum}
          onChange={(e) => onPropertyChange('letterSpacing', `${e.target.value}px`)}
        />
        <span className="editor-slider-value">{letterSpacingNum}px</span>
      </div>
    </div>
  )
}
