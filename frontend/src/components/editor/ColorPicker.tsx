import { useState, useEffect } from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return rgb

  const r = parseInt(match[1], 10)
  const g = parseInt(match[2], 10)
  const b = parseInt(match[3], 10)

  return (
    '#' +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const normalizedValue = value.startsWith('rgb') ? rgbToHex(value) : value
  const [textValue, setTextValue] = useState(normalizedValue)

  useEffect(() => {
    const next = value.startsWith('rgb') ? rgbToHex(value) : value
    setTextValue(next)
  }, [value])

  const handleColorInput = (newColor: string) => {
    setTextValue(newColor)
    onChange(newColor)
  }

  const handleTextChange = (newText: string) => {
    setTextValue(newText)
    if (isValidHex(newText)) {
      onChange(newText)
    }
  }

  const handleBlur = () => {
    if (!isValidHex(textValue)) {
      setTextValue(normalizedValue)
    }
  }

  return (
    <div className="editor-field">
      <label className="editor-label">{label}</label>
      <div className="editor-color-row">
        <input
          type="color"
          className="editor-color-swatch"
          value={isValidHex(normalizedValue) ? normalizedValue : '#000000'}
          onChange={(e) => handleColorInput(e.target.value)}
        />
        <input
          type="text"
          className="editor-color-text"
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="#000000"
        />
      </div>
    </div>
  )
}
