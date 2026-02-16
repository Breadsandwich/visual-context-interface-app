interface SegmentOption {
  value: string
  label: string
  icon?: string
}

interface SegmentedControlProps {
  label: string
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
}

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  return (
    <div className="editor-field">
      <label className="editor-label">{label}</label>
      <div className="editor-segmented-control">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`editor-segment ${value === opt.value ? 'editor-segment-active' : ''}`}
            onClick={() => onChange(opt.value)}
            title={opt.label}
          >
            {opt.icon ?? opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
