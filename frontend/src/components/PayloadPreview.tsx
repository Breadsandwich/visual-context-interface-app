import { useState } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { formatPayloadForClipboard, copyToClipboard } from '../utils/payloadBuilder'
import './PayloadPreview.css'

export function PayloadPreview() {
  const { generatePayload, selectedElement, screenshotData, userPrompt } = useInspectorStore()
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const payload = generatePayload()
  const hasContent = selectedElement || screenshotData || userPrompt

  const handleExport = async () => {
    const jsonPayload = formatPayloadForClipboard(payload)

    const success = await copyToClipboard(jsonPayload)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleConsoleLog = () => {
    const jsonPayload = formatPayloadForClipboard(payload)
    // eslint-disable-next-line no-console
    console.log('Visual Context Payload:', payload)
    // eslint-disable-next-line no-console
    console.log('JSON:', jsonPayload)
  }

  return (
    <div className="payload-preview">
      <div className="payload-actions">
        <button
          className="export-button primary"
          onClick={handleExport}
          disabled={!hasContent}
        >
          {copied ? '✓ Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          className="export-button secondary"
          onClick={handleConsoleLog}
          disabled={!hasContent}
        >
          Log to Console
        </button>
        <button
          className="export-button secondary"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Hide' : 'Show'} JSON
        </button>
      </div>

      {showPreview && (
        <div className="json-preview">
          <pre>{formatPayloadForClipboard(payload)}</pre>
        </div>
      )}
    </div>
  )
}
