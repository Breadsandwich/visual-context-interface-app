import type { OutputPayload } from '../types/inspector'

export function formatPayloadForClipboard(payload: OutputPayload): string {
  return JSON.stringify(payload, null, 2)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}

interface ExportResult {
  success: boolean
  path?: string
  error?: string
}

export async function exportToFile(payload: OutputPayload): Promise<ExportResult> {
  try {
    const response = await fetch('/api/export-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    })

    let result: { success?: boolean; error?: string; path?: string }
    try {
      result = await response.json()
    } catch {
      return { success: false, error: 'Invalid server response' }
    }

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || `HTTP ${response.status}` }
    }

    return { success: true, path: result.path }
  } catch {
    return { success: false, error: 'Network error' }
  }
}
