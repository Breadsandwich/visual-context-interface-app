import { CollapsibleSection } from './CollapsibleSection'

interface SpacingEditorProps {
  marginTop: string
  marginRight: string
  marginBottom: string
  marginLeft: string
  paddingTop: string
  paddingRight: string
  paddingBottom: string
  paddingLeft: string
  onPropertyChange: (property: string, value: string) => void
}

interface SpacingInputProps {
  value: string
  property: string
  position: string
  type: string
  onPropertyChange: (property: string, value: string) => void
}

function SpacingInput({ value, property, position, type, onPropertyChange }: SpacingInputProps) {
  const numericValue = parseFloat(value) || 0

  return (
    <input
      type="number"
      className={`spacing-input spacing-${type}-${position}`}
      value={numericValue}
      onChange={(e) => onPropertyChange(property, `${e.target.value}px`)}
      aria-label={`${type} ${position}`}
    />
  )
}

export function SpacingEditor({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  onPropertyChange,
}: SpacingEditorProps) {
  return (
    <CollapsibleSection title="Spacing">

      <div className="spacing-box-model">
        <div className="spacing-margin-box">
          <span className="spacing-label-corner">margin</span>
          <SpacingInput
            value={marginTop}
            property="marginTop"
            position="top"
            type="margin"
            onPropertyChange={onPropertyChange}
          />
          <SpacingInput
            value={marginRight}
            property="marginRight"
            position="right"
            type="margin"
            onPropertyChange={onPropertyChange}
          />
          <SpacingInput
            value={marginBottom}
            property="marginBottom"
            position="bottom"
            type="margin"
            onPropertyChange={onPropertyChange}
          />
          <SpacingInput
            value={marginLeft}
            property="marginLeft"
            position="left"
            type="margin"
            onPropertyChange={onPropertyChange}
          />

          <div className="spacing-padding-box">
            <span className="spacing-label-corner">padding</span>
            <SpacingInput
              value={paddingTop}
              property="paddingTop"
              position="top"
              type="padding"
              onPropertyChange={onPropertyChange}
            />
            <SpacingInput
              value={paddingRight}
              property="paddingRight"
              position="right"
              type="padding"
              onPropertyChange={onPropertyChange}
            />
            <SpacingInput
              value={paddingBottom}
              property="paddingBottom"
              position="bottom"
              type="padding"
              onPropertyChange={onPropertyChange}
            />
            <SpacingInput
              value={paddingLeft}
              property="paddingLeft"
              position="left"
              type="padding"
              onPropertyChange={onPropertyChange}
            />

            <div className="spacing-element-box">el</div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
