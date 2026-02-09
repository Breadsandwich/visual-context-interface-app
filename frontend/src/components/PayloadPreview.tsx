import { useInspectorStore } from '../stores/inspectorStore'
import { formatPayloadForClipboard, copyToClipboard } from '../utils/payloadBuilder'
import './PayloadPreview.css'

export function PayloadPreview() {
  const { generatePayload, selectedElements, screenshotData, userPrompt, uploadedImages, showToast } = useInspectorStore()

  const hasContent = selectedElements.length > 0 || screenshotData || userPrompt || uploadedImages.length > 0

  const handleSendToAdom = async () => {
    const payload = generatePayload()
    const jsonPayload = formatPayloadForClipboard(payload)
    const success = await copyToClipboard(jsonPayload)
    if (success) {
      showToast('Clipboard exported to ADOM')
    } else {
      showToast('Failed to copy to clipboard')
    }
  }

  return (
    <div className="payload-preview">
      <button
        className="send-to-adom-button"
        onClick={handleSendToAdom}
        disabled={!hasContent}
      >
        Send to ADOM
      </button>
    </div>
  )
}
