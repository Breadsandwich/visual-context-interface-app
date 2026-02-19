import { useInspectorStore } from '../stores/inspectorStore'
import './FloatingWidget.css'

export function FloatingWidget() {
  const {
    mode,
    setMode,
    toggleSidebar,
    isSidebarOpen,
    selectedElements,
    uploadedImages,
    screenshotData,
    userPrompt,
    isInspectorReady,
    currentRoute,
    resetAll
  } = useInspectorStore()

  const hasContent = selectedElements.length > 0 || screenshotData !== null || userPrompt !== '' || uploadedImages.length > 0

  return (
    <div className={`floating-widget ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="widget-status">
        <span
          className={`status-indicator ${isInspectorReady ? 'ready' : 'not-ready'}`}
          aria-label={isInspectorReady ? 'Connected' : 'Disconnected'}
        />
        <span className="status-route">{currentRoute || '/'}</span>
      </div>

      <div className="widget-divider" />

      <div className="widget-tools">
        <button
          className={`widget-button ${mode === 'interaction' ? 'active' : ''}`}
          onClick={() => setMode('interaction')}
          title="Pointer"
          aria-label="Pointer mode"
          aria-pressed={mode === 'interaction'}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="M13 13l6 6" />
            </svg>
          </span>
        </button>

        <button
          className={`widget-button ${mode === 'inspection' ? 'active' : ''}`}
          onClick={() => setMode(mode === 'inspection' ? 'interaction' : 'inspection')}
          title="Inspect Element"
          aria-label="Inspect element mode"
          aria-pressed={mode === 'inspection'}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4V2" />
              <path d="M15 16v-2" />
              <path d="M8 9h2" />
              <path d="M20 9h2" />
              <path d="M17.8 11.8L19 13" />
              <path d="M15 9h.01" />
              <path d="M17.8 6.2L19 5" />
              <path d="M11 6.2L9.7 5" />
              <path d="M11 11.8L9.7 13" />
              <path d="M8 21l7.5-7.5" />
            </svg>
          </span>
        </button>

        <button
          className={`widget-button ${mode === 'screenshot' ? 'active' : ''}`}
          onClick={() => setMode(mode === 'screenshot' ? 'interaction' : 'screenshot')}
          title="Screenshot"
          aria-label="Screenshot mode"
          aria-pressed={mode === 'screenshot'}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
        </button>

        <button
          className={`widget-button ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => setMode(mode === 'edit' ? 'interaction' : 'edit')}
          title="Edit Element"
          aria-label="Edit element mode"
          aria-pressed={mode === 'edit'}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>
        </button>

        <button
          className={`widget-button ${isSidebarOpen ? 'active' : ''}`}
          onClick={toggleSidebar}
          title={isSidebarOpen ? 'Hide Panel' : 'Show Panel'}
          aria-label={isSidebarOpen ? 'Hide Panel' : 'Show Panel'}
          aria-expanded={isSidebarOpen}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
        </button>

        <button
          className={`widget-button ${hasContent ? 'widget-button-danger' : 'widget-button-disabled'}`}
          onClick={hasContent ? resetAll : undefined}
          title="Clear All"
          aria-label="Clear all selections and instructions"
          aria-disabled={!hasContent}
        >
          <span className="widget-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  )
}
