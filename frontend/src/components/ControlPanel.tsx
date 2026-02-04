import { ModeToggle } from './ModeToggle'
import { SelectionPreview } from './SelectionPreview'
import { InstructionInput } from './InstructionInput'
import { PayloadPreview } from './PayloadPreview'
import './ControlPanel.css'

export function ControlPanel() {
  return (
    <aside className="control-panel">
      <div className="control-section">
        <h2>Mode</h2>
        <ModeToggle />
      </div>

      <div className="control-section">
        <h2>Selection</h2>
        <SelectionPreview />
      </div>

      <div className="control-section">
        <h2>Instructions</h2>
        <InstructionInput />
      </div>

      <div className="control-section">
        <h2>Export</h2>
        <PayloadPreview />
      </div>
    </aside>
  )
}
