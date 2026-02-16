import type { ElementEdits } from '../types/inspector'

interface ApplyEditsResponse {
  success: boolean
  applied: Array<{ selector: string; property: string; value: string }>
  failed: Array<{ selector: string; property: string; value: string }>
  aiAssisted: ElementEdits[]
}

const PROXY_URL = import.meta.env.VITE_PROXY_URL || ''

export async function applyEditsToSource(edits: ElementEdits[]): Promise<ApplyEditsResponse> {
  const response = await fetch(`${PROXY_URL}/api/apply-edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(errorBody.error || `Apply edits failed: ${response.statusText}`)
  }

  const result: ApplyEditsResponse = await response.json()

  if (!result.success) {
    throw new Error('Apply edits returned unsuccessful result')
  }

  return result
}
