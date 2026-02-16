import { CollapsibleSection } from './CollapsibleSection'
import { SegmentedControl } from './controls/SegmentedControl'
import { NumberInput } from './controls/NumberInput'

interface TypographyEditorProps {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  textAlign: string
  textDecoration: string
  textTransform: string
  whiteSpace: string
  wordSpacing: string
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

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justify' },
]

const TEXT_DECORATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'underline', label: 'U̲' },
  { value: 'line-through', label: 'S̶' },
]

const TEXT_TRANSFORM_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'AB' },
  { value: 'lowercase', label: 'ab' },
  { value: 'capitalize', label: 'Ab' },
]

const WHITE_SPACE_OPTIONS = ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line']

export function TypographyEditor({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textAlign,
  textDecoration,
  textTransform,
  whiteSpace,
  wordSpacing,
  onPropertyChange,
}: TypographyEditorProps) {
  const fontSizeNum = parseFloat(fontSize) || 16
  const lineHeightNum = parseFloat(lineHeight) || 1.5
  const letterSpacingNum = parseFloat(letterSpacing) || 0
  const wordSpacingNum = parseFloat(wordSpacing) || 0

  return (
    <CollapsibleSection title="Typography">

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

      <SegmentedControl
        label="Text Align"
        options={TEXT_ALIGN_OPTIONS}
        value={textAlign}
        onChange={(v) => onPropertyChange('textAlign', v)}
      />

      <SegmentedControl
        label="Decoration"
        options={TEXT_DECORATION_OPTIONS}
        value={textDecoration.split(' ')[0]}
        onChange={(v) => onPropertyChange('textDecoration', v)}
      />

      <SegmentedControl
        label="Transform"
        options={TEXT_TRANSFORM_OPTIONS}
        value={textTransform}
        onChange={(v) => onPropertyChange('textTransform', v)}
      />

      <div className="editor-field">
        <label className="editor-label">White Space</label>
        <select
          className="editor-select"
          value={whiteSpace}
          onChange={(e) => onPropertyChange('whiteSpace', e.target.value)}
        >
          {WHITE_SPACE_OPTIONS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <NumberInput
        label="Word Gap"
        value={wordSpacingNum}
        min={-5}
        max={20}
        step={0.5}
        suffix="px"
        onChange={(v) => onPropertyChange('wordSpacing', `${v}px`)}
      />
    </CollapsibleSection>
  )
}
