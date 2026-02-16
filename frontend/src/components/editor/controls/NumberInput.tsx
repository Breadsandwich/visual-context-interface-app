import { useState, useCallback, useRef, useEffect } from 'react'

interface NumberInputProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

export function NumberInput({
  label,
  value,
  min = 0,
  max = 999,
  step = 1,
  suffix = '',
  onChange,
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value))
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartValue = useRef(0)

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  // Clean up cursor on unmount in case drag is active
  useEffect(() => {
    return () => {
      if (isDragging.current) {
        document.body.style.cursor = ''
      }
    }
  }, [])

  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, v)),
    [min, max]
  )

  const handleInputChange = (raw: string) => {
    setLocalValue(raw)
    const parsed = parseFloat(raw)
    if (!isNaN(parsed)) {
      onChange(clamp(parsed))
    }
  }

  const handleBlur = () => {
    const parsed = parseFloat(localValue)
    if (isNaN(parsed)) {
      setLocalValue(String(value))
    } else {
      const clamped = clamp(parsed)
      setLocalValue(String(clamped))
      onChange(clamped)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLLabelElement>) => {
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartValue.current = value
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'ew-resize'
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLLabelElement>) => {
    if (!isDragging.current) return
    const delta = (e.clientX - dragStartX.current) * step
    const next = clamp(Math.round((dragStartValue.current + delta) / step) * step)
    onChange(next)
  }

  const handlePointerUp = () => {
    isDragging.current = false
    document.body.style.cursor = ''
  }

  return (
    <div className="editor-number-input">
      <label
        className="editor-label editor-label-draggable"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {label}
      </label>
      <div className="editor-number-input-field">
        <input
          type="text"
          inputMode="numeric"
          className="editor-input editor-input-sm"
          value={localValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
        />
        {suffix && <span className="editor-number-suffix">{suffix}</span>}
      </div>
    </div>
  )
}
