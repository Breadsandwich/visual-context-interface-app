import type { OutputPayload } from '../types/inspector'

export function formatClaudeCodePrompt(payload: OutputPayload): string {
  const output: Record<string, unknown> = {}

  if (payload.route) {
    output.route = payload.route
  }

  if (payload.screenshotFilePath) {
    output.screenshot = `@${payload.screenshotFilePath}`
  }

  if (payload.visualPrompt) {
    output.screenshotContext = payload.visualPrompt
  }

  if (payload.externalImages.length > 0) {
    output.images = payload.externalImages.map((img) => ({
      ref: img.claudeRef,
      filename: img.filename,
      linkedTo: img.linkedElementSelector ?? null,
    }))
  }

  if (payload.contexts.length > 0) {
    output.selectedElements = payload.contexts.map((ctx) => ({
      selector: ctx.selector,
      tagName: ctx.tagName,
      id: ctx.id || undefined,
      classes: ctx.classes.length > 0 ? ctx.classes : undefined,
      html: ctx.html,
      prompt: ctx.elementPrompt || undefined,
    }))
  }

  if (payload.prompt) {
    output.prompt = payload.prompt
  }

  output.timestamp = payload.timestamp

  return JSON.stringify(output, null, 2)
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
