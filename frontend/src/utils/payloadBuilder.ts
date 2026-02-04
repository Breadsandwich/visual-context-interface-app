import type { OutputPayload } from '../types/inspector'

export function formatPayloadForClipboard(payload: OutputPayload): string {
  return JSON.stringify(payload, null, 2)
}

export function formatPayloadForDisplay(payload: OutputPayload): string {
  const lines: string[] = []

  lines.push('--- Visual Context Payload ---')
  lines.push(`Route: ${payload.route}`)
  lines.push(`Timestamp: ${payload.timestamp}`)

  if (payload.context) {
    lines.push('')
    lines.push('Element Context:')
    lines.push(`  Selector: ${payload.context.selector}`)
    lines.push(`  Tag: ${payload.context.tagName}`)
    if (payload.context.id) {
      lines.push(`  ID: ${payload.context.id}`)
    }
    if (payload.context.classes.length > 0) {
      lines.push(`  Classes: ${payload.context.classes.join(', ')}`)
    }
  }

  if (payload.visual) {
    lines.push('')
    lines.push(`Visual: [Screenshot captured - ${Math.round(payload.visual.length / 1024)}KB]`)
  }

  if (payload.prompt) {
    lines.push('')
    lines.push('User Prompt:')
    lines.push(`  "${payload.prompt}"`)
  }

  return lines.join('\n')
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
