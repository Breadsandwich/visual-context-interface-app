import { useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { SelectionPreview } from './SelectionPreview'
import { ImageUpload } from './ImageUpload'
import { InstructionInput } from './InstructionInput'
import { PayloadPreview } from './PayloadPreview'
import './ExpandableSidebar.css'

export function ExpandableSidebar() {
  const { isSidebarOpen, closeSidebar } = useInspectorStore()

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        closeSidebar()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isSidebarOpen, closeSidebar])

  return (
    <aside
      className={`expandable-sidebar ${isSidebarOpen ? 'open' : ''}`}
      role="complementary"
      aria-label="Context Panel"
      aria-hidden={!isSidebarOpen}
    >
      <div className="sidebar-header">
        <h2>Context Panel</h2>
        <button
          className="sidebar-close"
          onClick={closeSidebar}
          title="Close Panel (Escape)"
          aria-label="Close Panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section">
          <h3>Selection</h3>
          <SelectionPreview />
        </div>

        <div className="sidebar-section">
          <h3>Reference Images</h3>
          <ImageUpload />
        </div>

        <div className="sidebar-section">
          <h3>Instructions</h3>
          <InstructionInput />
        </div>

        <div className="sidebar-section">
          <h3>Export</h3>
          <PayloadPreview />
        </div>
      </div>
    </aside>
  )
}
