import { useEffect, useCallback } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { useEditorStore } from '../stores/editorStore'
import { useVisionAnalysis } from '../hooks/useVisionAnalysis'
import './SelectionPreview.css'

export function SelectionPreview() {
  const {
    selectedElements,
    screenshotData,
    clearSelection,
    clearScreenshot,
    removeSelectedElement,
    elementPrompts,
    setElementPrompt,
    screenshotPrompt,
    setScreenshotPrompt
  } = useInspectorStore()

  const elementEdits = useInspectorStore((s) => s.elementEdits)
  const screenshotAnalysis = useInspectorStore((s) => s.screenshotAnalysis)
  const screenshotAnalysisStatus = useInspectorStore((s) => s.screenshotAnalysisStatus)

  const { analyzeScreenshot, cancelScreenshotAnalysis } = useVisionAnalysis()

  const handleEditElement = useCallback((selector: string) => {
    const savedEdits = useInspectorStore.getState().elementEdits[selector]
    if (savedEdits && savedEdits.length > 0) {
      const editorState = useEditorStore.getState()
      for (const edit of savedEdits) {
        editorState.addEdit(selector, edit)
      }
    }
    useEditorStore.getState().setActiveElement(selector)
    useInspectorStore.getState().setMode('edit')
    useInspectorStore.getState().openSidebar()
  }, [])

  useEffect(() => {
    if (!screenshotData) return
    analyzeScreenshot(screenshotData)
    return () => cancelScreenshotAnalysis()
  }, [screenshotData, analyzeScreenshot, cancelScreenshotAnalysis])

  if (selectedElements.length === 0 && !screenshotData) {
    return (
      <div className="selection-preview empty">
        <p>No elements selected</p>
        <p className="hint">Switch to Inspect mode and click elements to select</p>
      </div>
    )
  }

  return (
    <div className="selection-preview">
      {selectedElements.length > 0 && (
        <div className="elements-section">
          <div className="elements-header">
            <span className="elements-count">
              {selectedElements.length} Element{selectedElements.length !== 1 ? 's' : ''} Selected
            </span>
            <button className="clear-all-button" onClick={clearSelection}>
              Clear All
            </button>
          </div>

          <div className="element-cards">
            {selectedElements.map((element, index) => (
              <div key={element.selector} className="element-card">
                <div className="card-top">
                  <span className="card-number">{index + 1}</span>
                  <code className="card-selector">{element.selector}</code>
                  <button
                    className="card-remove"
                    onClick={() => removeSelectedElement(element.selector)}
                    aria-label={`Remove ${element.selector}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="card-pills">
                  <span className="pill pill-tag">{element.tagName}</span>
                  {element.id && <span className="pill pill-id">#{element.id}</span>}
                  {element.classes.map((cls) => (
                    <span key={cls} className="pill pill-class">.{cls}</span>
                  ))}
                </div>
                <div className="card-actions">
                  {(elementEdits[element.selector]?.length ?? 0) > 0 && (
                    <span className="card-edits-badge">
                      {elementEdits[element.selector].length} edit{elementEdits[element.selector].length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    className="card-edit-button"
                    onClick={() => handleEditElement(element.selector)}
                    title="Edit element"
                    aria-label={`Edit ${element.selector}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M8.5 1.5l2 2L4 10H2v-2l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <textarea
                  className="card-prompt"
                  value={elementPrompts[element.selector] ?? ''}
                  onChange={(e) => setElementPrompt(element.selector, e.target.value)}
                  placeholder="Instructions for this element..."
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {screenshotData && (
        <div className="screenshot-preview">
          <div className="info-header">
            <h3>Screenshot</h3>
            <button className="clear-button" onClick={clearScreenshot} aria-label="Clear screenshot">
              Clear
            </button>
          </div>
          <img src={screenshotData} alt="Captured screenshot" />

          {screenshotAnalysisStatus === 'analyzing' && (
            <div className="analysis-status analyzing" role="status" aria-live="polite">
              <span className="analysis-spinner" />
              <span>Analyzing with Claude Vision...</span>
            </div>
          )}
          {screenshotAnalysisStatus === 'complete' && screenshotAnalysis && (
            <div className="analysis-result" role="status" aria-live="polite">
              <p className="analysis-description">{screenshotAnalysis.description}</p>
              <div className="analysis-meta">
                <span className="analysis-badge">{screenshotAnalysis.contentType}</span>
                {screenshotAnalysis.uiElements.length > 0 && (
                  <span className="analysis-badge">{screenshotAnalysis.uiElements.length} UI elements</span>
                )}
              </div>
            </div>
          )}
          {screenshotAnalysisStatus === 'error' && (
            <div className="analysis-status error" role="alert">
              <span>Analysis failed</span>
              <button
                className="analysis-retry"
                onClick={() => analyzeScreenshot(screenshotData)}
              >
                Retry
              </button>
            </div>
          )}

          <textarea
            className="card-prompt screenshot-prompt"
            value={screenshotPrompt}
            onChange={(e) => setScreenshotPrompt(e.target.value)}
            placeholder="Instructions for this screenshot..."
            rows={2}
          />
        </div>
      )}
    </div>
  )
}
