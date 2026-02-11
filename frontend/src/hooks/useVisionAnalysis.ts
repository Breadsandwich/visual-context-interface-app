import { useCallback, useRef } from 'react'
import { analyzeImageWithVision } from '../services/visionApi'
import { useInspectorStore } from '../stores/inspectorStore'

export function useVisionAnalysis() {
  const screenshotAbortRef = useRef<AbortController | null>(null)

  const setScreenshotAnalysis = useInspectorStore((s) => s.setScreenshotAnalysis)
  const setScreenshotAnalysisStatus = useInspectorStore((s) => s.setScreenshotAnalysisStatus)
  const setImageVisionAnalysis = useInspectorStore((s) => s.setImageVisionAnalysis)
  const setImageAnalysisStatus = useInspectorStore((s) => s.setImageAnalysisStatus)
  const showToast = useInspectorStore((s) => s.showToast)

  const analyzeScreenshot = useCallback(async (imageDataUrl: string) => {
    if (screenshotAbortRef.current) {
      screenshotAbortRef.current.abort()
    }

    const controller = new AbortController()
    screenshotAbortRef.current = controller
    setScreenshotAnalysisStatus('analyzing')

    try {
      const analysis = await analyzeImageWithVision(
        imageDataUrl,
        'This is a screenshot captured from a web application being inspected.',
        controller.signal
      )
      setScreenshotAnalysis(analysis)
      setScreenshotAnalysisStatus('complete')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScreenshotAnalysisStatus('error')
      showToast('Vision analysis failed — using local analysis')
    }
  }, [setScreenshotAnalysis, setScreenshotAnalysisStatus, showToast])

  const analyzeUploadedImage = useCallback(async (
    imageId: string,
    imageDataUrl: string,
    filename: string
  ) => {
    setImageAnalysisStatus(imageId, 'analyzing')

    try {
      const analysis = await analyzeImageWithVision(
        imageDataUrl,
        `This is a reference image uploaded by the user. Filename: ${filename}`
      )
      setImageVisionAnalysis(imageId, analysis)
      setImageAnalysisStatus(imageId, 'complete')
    } catch (error) {
      setImageAnalysisStatus(imageId, 'error')
      const detail = error instanceof Error ? error.message : 'Unknown error'
      showToast(`Vision analysis failed for ${filename}: ${detail}`)
    }
  }, [setImageVisionAnalysis, setImageAnalysisStatus, showToast])

  const cancelScreenshotAnalysis = useCallback(() => {
    if (screenshotAbortRef.current) {
      screenshotAbortRef.current.abort()
      screenshotAbortRef.current = null
    }
  }, [])

  return { analyzeScreenshot, analyzeUploadedImage, cancelScreenshotAnalysis }
}
