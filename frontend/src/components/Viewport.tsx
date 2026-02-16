import { useRef, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { usePostMessage } from '../hooks/usePostMessage'
import { useAreaSelection } from '../hooks/useAreaSelection'
import './Viewport.css'

const proxyUrl = import.meta.env.VITE_PROXY_URL || ''

export function Viewport() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { mode } = useInspectorStore()
  const iframeReloadTrigger = useInspectorStore((s) => s.iframeReloadTrigger)
  const { captureScreenshot } = usePostMessage(iframeRef)

  useEffect(() => {
    if (iframeReloadTrigger > 0 && iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }, [iframeReloadTrigger])

  const { containerRef, isSelecting, selectionRect, handleMouseDown } = useAreaSelection({
    enabled: mode === 'screenshot',
    onSelectionComplete: (region) => {
      captureScreenshot(region)
    }
  })

  return (
    <div className="viewport">
      <div
        ref={containerRef}
        className={`viewport-container ${mode === 'screenshot' ? 'screenshot-mode' : ''}`}
        onMouseDown={mode === 'screenshot' ? handleMouseDown : undefined}
      >
        <iframe
          ref={iframeRef}
          src={`${proxyUrl}/proxy/`}
          className={`viewport-iframe ${mode === 'screenshot' ? 'no-pointer-events' : ''}`}
          title="Target Application"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
        {isSelecting && selectionRect && (
          <div
            className="selection-overlay"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height
            }}
          />
        )}
        {mode === 'screenshot' && !isSelecting && (
          <div className="screenshot-hint">
            Drag to select an area for screenshot
          </div>
        )}
      </div>
    </div>
  )
}
