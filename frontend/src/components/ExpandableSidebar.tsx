import { useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { useEditorStore } from '../stores/editorStore'
import { SelectionPreview } from './SelectionPreview'
import { ImageUpload } from './ImageUpload'
import { InstructionInput } from './InstructionInput'
import { PayloadPreview } from './PayloadPreview'
import { EditorPanel } from './EditorPanel'
import './ExpandableSidebar.css'

interface ExpandableSidebarProps {
  applyEdit: (selector: string, property: string, value: string) => void
  revertEdits: () => void
  revertElement: (selector: string) => void
  getComputedStyles: (selector: string) => void
}

export function ExpandableSidebar({ applyEdit, revertEdits, revertElement, getComputedStyles }: ExpandableSidebarProps) {
  const { isSidebarOpen, closeSidebar, mode } = useInspectorStore()
  const activeElement = useEditorStore((s) => s.activeElement)
  const isEditMode = mode === 'edit'
  const showBackArrow = isEditMode && activeElement !== null

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
      aria-label={isEditMode ? 'Editor Panel' : 'Context Panel'}
      aria-hidden={!isSidebarOpen}
    >
      <div className="sidebar-header">
        {showBackArrow ? (
          <button
            className="sidebar-back"
            onClick={() => useEditorStore.getState().setActiveElement(null)}
            title="Back to selection"
            aria-label="Back to selection"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        ) : (
          <div className="sidebar-header-spacer" />
        )}
        <h2>{isEditMode ? 'Editor' : 'Context Panel'}</h2>
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
        {isEditMode ? (
          <EditorPanel
            applyEdit={applyEdit}
            revertEdits={revertEdits}
            revertElement={revertElement}
            getComputedStyles={getComputedStyles}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  )
}
