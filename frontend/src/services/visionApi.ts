import type { VisionAnalysis } from '../types/inspector'

interface AnalyzeImageResponse {
  success: boolean
  data?: VisionAnalysis
  error?: string
}

export async function analyzeImageWithVision(
  imageDataUrl: string,
  context: string = '',
  signal?: AbortSignal
): Promise<VisionAnalysis> {
  const response = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_data_url: imageDataUrl,
      context,
    }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(errorBody.error || `HTTP ${response.status}`)
  }

  const result: AnalyzeImageResponse = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Analysis failed')
  }

  if (!result.data) {
    throw new Error('Analysis returned no data')
  }

  return result.data
}
