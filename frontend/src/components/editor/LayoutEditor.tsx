import { CollapsibleSection } from './CollapsibleSection'
import { CssValueInput } from './controls/CssValueInput'
import { NumberInput } from './controls/NumberInput'
import { SegmentedControl } from './controls/SegmentedControl'

interface LayoutEditorProps {
  display: string
  width: string
  height: string
  flexDirection: string
  alignItems: string
  justifyContent: string
  gap: string
  gridTemplateColumns: string
  gridTemplateRows: string
  gridGap: string
  flexWrap: string
  flexGrow: string
  flexShrink: string
  flexBasis: string
  minWidth: string
  maxWidth: string
  minHeight: string
  maxHeight: string
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

const FLEX_WRAP_OPTIONS = [
  { value: 'nowrap', label: 'No Wrap' },
  { value: 'wrap', label: 'Wrap' },
  { value: 'wrap-reverse', label: 'Reverse' },
]

export function LayoutEditor({
  display,
  width,
  height,
  flexDirection,
  alignItems,
  justifyContent,
  gap,
  gridTemplateColumns,
  gridTemplateRows,
  gridGap,
  flexWrap,
  flexGrow,
  flexShrink,
  flexBasis,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  onPropertyChange,
}: LayoutEditorProps) {
  const isFlexLayout = display === 'flex' || display === 'inline-flex'
  const isGridLayout = display === 'grid'
  const flexGrowNum = parseFloat(flexGrow) || 0
  const flexShrinkNum = parseFloat(flexShrink) || 1

  return (
    <CollapsibleSection title="Layout">

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

      <div className="editor-card-grid">
        <CssValueInput
          label="Min W"
          value={minWidth}
          placeholder="0"
          onChange={(v) => onPropertyChange('minWidth', v)}
        />
        <CssValueInput
          label="Max W"
          value={maxWidth}
          placeholder="none"
          onChange={(v) => onPropertyChange('maxWidth', v)}
        />
        <CssValueInput
          label="Min H"
          value={minHeight}
          placeholder="0"
          onChange={(v) => onPropertyChange('minHeight', v)}
        />
        <CssValueInput
          label="Max H"
          value={maxHeight}
          placeholder="none"
          onChange={(v) => onPropertyChange('maxHeight', v)}
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

          <SegmentedControl
            label="Flex Wrap"
            options={FLEX_WRAP_OPTIONS}
            value={flexWrap}
            onChange={(v) => onPropertyChange('flexWrap', v)}
          />

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

          <div className="editor-card-grid">
            <NumberInput
              label="Grow"
              value={flexGrowNum}
              min={0}
              max={10}
              step={1}
              onChange={(v) => onPropertyChange('flexGrow', String(v))}
            />
            <NumberInput
              label="Shrink"
              value={flexShrinkNum}
              min={0}
              max={10}
              step={1}
              onChange={(v) => onPropertyChange('flexShrink', String(v))}
            />
          </div>

          <CssValueInput
            label="Flex Basis"
            value={flexBasis}
            placeholder="auto"
            onChange={(v) => onPropertyChange('flexBasis', v)}
          />
        </>
      )}

      {isGridLayout && (
        <>
          <CssValueInput
            label="Columns"
            value={gridTemplateColumns}
            placeholder="1fr 1fr"
            onChange={(v) => onPropertyChange('gridTemplateColumns', v)}
          />

          <CssValueInput
            label="Rows"
            value={gridTemplateRows}
            placeholder="auto"
            onChange={(v) => onPropertyChange('gridTemplateRows', v)}
          />

          <CssValueInput
            label="Grid Gap"
            value={gridGap}
            placeholder="0px"
            onChange={(v) => onPropertyChange('gridGap', v)}
          />

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
        </>
      )}
    </CollapsibleSection>
  )
}
