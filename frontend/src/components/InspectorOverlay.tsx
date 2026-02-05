import { FloatingWidget } from './FloatingWidget'
import { ExpandableSidebar } from './ExpandableSidebar'
import './InspectorOverlay.css'

export function InspectorOverlay() {
  return (
    <div className="inspector-overlay">
      <FloatingWidget />
      <ExpandableSidebar />
    </div>
  )
}
