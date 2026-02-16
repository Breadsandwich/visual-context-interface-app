import { useState, useEffect } from 'react'

interface ContentEditorProps {
  value: string
  onChange: (value: string) => void
}

export function ContentEditor({ value, onChange }: ContentEditorProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (newValue: string) => {
    setLocalValue(newValue)
    onChange(newValue)
  }

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Content</h4>
      <textarea
        className="editor-textarea"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        placeholder="Element text content..."
      />
    </div>
  )
}
