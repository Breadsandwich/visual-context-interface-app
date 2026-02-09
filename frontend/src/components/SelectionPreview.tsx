import { useInspectorStore } from '../stores/inspectorStore'
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
