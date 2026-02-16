import { useState, useEffect, useMemo } from 'react'

interface ChildContent {
  tag: string
  text: string
}

interface ContentEditorProps {
  value: string
  childContents: string
  onChange: (value: string) => void
}

export function ContentEditor({ value, childContents, onChange }: ContentEditorProps) {
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
    <div className="editor-section">
      <h4 className="editor-section-title">Content</h4>

      {parsedChildren.length > 1 ? (
        <div className="editor-child-contents">
          {parsedChildren.map((child, i) => (
            <div key={i} className="editor-child-content-item">
              <span className="editor-child-tag">&lt;{child.tag}&gt;</span>
              <div className="editor-child-text">{child.text}</div>
            </div>
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
    </div>
  )
}
