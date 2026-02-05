import { useInspectorStore } from '../stores/inspectorStore'
import './SelectionPreview.css'

export function SelectionPreview() {
  const { selectedElement, screenshotData, clearSelection, clearScreenshot } = useInspectorStore()

  if (!selectedElement && !screenshotData) {
    return (
      <div className="selection-preview empty">
        <p>No element selected</p>
        <p className="hint">Switch to Inspect mode and click an element</p>
      </div>
    )
  }

  return (
    <div className="selection-preview">
      {selectedElement && (
        <div className="element-info">
          <div className="info-header">
            <h3>Selected Element</h3>
            <button className="clear-button" onClick={clearSelection} aria-label="Clear selected element">
              Clear
            </button>
          </div>

          <div className="info-row">
            <span className="info-label">Selector:</span>
            <code className="info-value">{selectedElement.selector}</code>
          </div>

          <div className="info-row">
            <span className="info-label">Tag:</span>
            <code className="info-value">{selectedElement.tagName}</code>
          </div>

          {selectedElement.id && (
            <div className="info-row">
              <span className="info-label">ID:</span>
              <code className="info-value">#{selectedElement.id}</code>
            </div>
          )}

          {selectedElement.classes.length > 0 && (
            <div className="info-row">
              <span className="info-label">Classes:</span>
              <code className="info-value">.{selectedElement.classes.join('.')}</code>
            </div>
          )}

          <div className="html-preview">
            <span className="info-label">HTML:</span>
            <pre className="html-code">
              {selectedElement.outerHTML.substring(0, 500)}
              {selectedElement.outerHTML.length > 500 && '...'}
            </pre>
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
        </div>
      )}
    </div>
  )
}
