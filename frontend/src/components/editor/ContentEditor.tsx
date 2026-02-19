import { useState, useEffect, useMemo } from 'react'
import { CollapsibleSection } from './CollapsibleSection'

interface ChildContent {
  tag: string
  text: string
  selector: string
}

interface ContentEditorProps {
  value: string
  childContents: string
  onChange: (value: string) => void
  onChildChange: (selector: string, value: string, original: string, tagName: string) => void
}

export function ContentEditor({ value, childContents, onChange, onChildChange }: ContentEditorProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const parsedChildren = useMemo((): ChildContent[] => {
    if (!childContents) return []
    try {
      return JSON.parse(childContents)
    } catch {
      return []
    }
  }, [childContents])

  const handleChange = (newValue: string) => {
    setLocalValue(newValue)
    onChange(newValue)
  }

  return (
    <CollapsibleSection title="Content">
      {parsedChildren.length > 1 ? (
        <div className="editor-child-contents">
          {parsedChildren.map((child, i) => (
            <ChildContentItem
              key={child.selector || i}
              child={child}
              onChildChange={onChildChange}
            />
          ))}
        </div>
      ) : (
        <textarea
          className="editor-textarea"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          rows={3}
          placeholder="Element text content..."
        />
      )}
    </CollapsibleSection>
  )
}

function ChildContentItem({
  child,
  onChildChange,
}: {
  child: ChildContent
  onChildChange: (selector: string, value: string, original: string, tagName: string) => void
}) {
  const [localText, setLocalText] = useState(child.text)

  useEffect(() => {
    setLocalText(child.text)
  }, [child.text])

  const handleBlur = () => {
    if (localText !== child.text) {
      onChildChange(child.selector, localText, child.text, child.tag)
    }
  }

  return (
    <div className="editor-child-content-item">
      <span className="editor-child-tag">&lt;{child.tag}&gt;</span>
      <textarea
        className="editor-child-textarea"
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onBlur={handleBlur}
        rows={2}
      />
    </div>
  )
}
