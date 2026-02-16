import { FloatingWidget } from './FloatingWidget'
import { ExpandableSidebar } from './ExpandableSidebar'
import './InspectorOverlay.css'

interface InspectorOverlayProps {
  applyEdit: (selector: string, property: string, value: string) => void
  revertEdits: () => void
  revertElement: (selector: string) => void
  getComputedStyles: (selector: string) => void
}

export function InspectorOverlay({ applyEdit, revertEdits, revertElement, getComputedStyles }: InspectorOverlayProps) {
  return (
    <div className="inspector-overlay">
      <FloatingWidget />
      <ExpandableSidebar
        applyEdit={applyEdit}
        revertEdits={revertEdits}
        revertElement={revertElement}
        getComputedStyles={getComputedStyles}
      />
    </div>
  )
}
