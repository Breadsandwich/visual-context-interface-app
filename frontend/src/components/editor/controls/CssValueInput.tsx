import { useState, useEffect } from 'react'

interface CssValueInputProps {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function CssValueInput({
  label,
  value,
  placeholder = 'auto',
  onChange,
}: CssValueInputProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (raw: string) => {
    setLocalValue(raw)
    onChange(raw)
  }

  const handleBlur = () => {
    if (localValue.trim() === '') {
      setLocalValue(value)
    }
  }

  return (
    <div className="editor-field">
      <label className="editor-label">{label}</label>
      <input
        type="text"
        className="editor-input"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
    </div>
  )
}
