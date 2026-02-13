/**
 * VCI Prompt Formatter — shared formatting logic
 *
 * Used by both the CLI (vci-format.js) and MCP server (mcp/server.js).
 */

'use strict'

const fs = require('fs')
const path = require('path')

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 4000
const MAX_TOKEN_BUDGET = 100000
const MIN_TOKEN_BUDGET = 100
const CHARS_PER_TOKEN = 4
const MAX_HTML_LENGTH = 500
const MAX_CONTEXT_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const PROJECT_ROOT_MARKERS = ['package.json', '.git', 'Cargo.toml', 'go.mod', 'pyproject.toml']

// ─── Project Root Detection ─────────────────────────────────────────

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root

  while (dir !== root) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir
      }
    }
    dir = path.dirname(dir)
  }
  return null
}

function findContextFile(projectDir) {
  if (projectDir) {
    const resolved = path.resolve(projectDir)
    const explicit = path.join(resolved, '.vci', 'context.json')
    if (fs.existsSync(explicit)) return explicit
    return null
  }

  const localPath = path.join(process.cwd(), '.vci', 'context.json')
  if (fs.existsSync(localPath)) return localPath

  const projectRoot = findProjectRoot(process.cwd())
  if (projectRoot) {
    const rootPath = path.join(projectRoot, '.vci', 'context.json')
    if (fs.existsSync(rootPath)) return rootPath
  }

  return null
}

// ─── Token Budget ───────────────────────────────────────────────────

function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function truncateToTokenBudget(text, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN
  if (text.length <= maxChars) return text
  const marker = '...'
  return text.substring(0, Math.max(0, maxChars - marker.length)) + marker
}

// ─── Element Formatting ─────────────────────────────────────────────

function formatSourceRef(ctx) {
  if (!ctx || !ctx.sourceFile) return null
  const line = ctx.sourceLine ? `:${ctx.sourceLine}` : ''
  return `${ctx.sourceFile}${line}`
}

function formatElement(ctx, index) {
  const lines = []
  const tag = `<${ctx.tagName}>`
  const sourceRef = formatSourceRef(ctx)
  const component = ctx.componentName ? ` (${ctx.componentName})` : ''

  if (sourceRef) {
    lines.push(`${index + 1}. **\`${tag}\` in \`${sourceRef}\`**${component}`)
  } else {
    lines.push(`${index + 1}. **\`${tag}\`**${component}`)
  }

  lines.push(`   - Selector: \`${ctx.selector}\``)

  if (ctx.elementPrompt) {
    lines.push(`   - Instruction: ${ctx.elementPrompt}`)
  }

  return lines
}

function formatVisionSummary(analysis) {
  if (!analysis) return null
  const parts = []
  if (analysis.description) parts.push(analysis.description)
  if (analysis.colorPalette && analysis.colorPalette.length > 0) {
    parts.push(`Colors: ${analysis.colorPalette.join(', ')}`)
  }
  if (analysis.uiElements && analysis.uiElements.length > 0) {
    parts.push(`UI elements: ${analysis.uiElements.join(', ')}`)
  }
  return parts.join('\n  - ')
}

function collectSourceFiles(contexts) {
  const files = new Set()
  for (const ctx of contexts) {
    const ref = formatSourceRef(ctx)
    if (ref) files.add(ref)
  }
  return Array.from(files)
}

// ─── Section Builders ───────────────────────────────────────────────

function buildHeader(payload) {
  const lines = ['## Visual Context\n']
  if (payload.route) lines.push(`The user is working on \`${payload.route}\`.\n`)
  if (payload.prompt) lines.push(`> ${payload.prompt}\n`)
  return lines.join('\n') + '\n'
}

function buildElements(contexts, includeHtml) {
  if (!contexts || contexts.length === 0) return ''
  const lines = ['### Selected Elements\n']

  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i]
    lines.push(...formatElement(ctx, i))

    if (includeHtml && ctx.html) {
      const truncatedHtml = ctx.html.length > MAX_HTML_LENGTH
        ? ctx.html.substring(0, MAX_HTML_LENGTH) + '...'
        : ctx.html
      lines.push(`   - HTML: \`${truncatedHtml}\``)
    }

    lines.push('')
  }

  return lines.join('\n') + '\n'
}

function buildImages(images, includeVision) {
  if (!images || images.length === 0) return ''
  const lines = ['### Design References\n']

  for (const img of images) {
    lines.push(`- **${img.filename}** (${img.dimensions})`)

    if (img.linkedElementSelector) {
      lines.push(`  - Linked to: \`${img.linkedElementSelector}\``)
    }

    if (includeVision) {
      const summary = formatVisionSummary(img.visionAnalysis)
      if (summary) {
        lines.push(`  - ${summary}`)
      } else if (img.description) {
        lines.push(`  - ${img.description}`)
      }
    } else if (img.description) {
      lines.push(`  - ${img.description}`)
    }

    lines.push('')
  }

  return lines.join('\n') + '\n'
}

function buildScreenshot(payload) {
  if (!payload.visualAnalysis) return ''
  const lines = ['### Screenshot Analysis\n']
  const summary = formatVisionSummary(payload.visualAnalysis)

  if (summary) lines.push(summary)
  if (payload.visualPrompt) lines.push(`\n> ${payload.visualPrompt}`)

  lines.push('')
  return lines.join('\n') + '\n'
}

function buildFilesToModify(contexts) {
  if (!contexts || contexts.length === 0) return ''
  const sourceFiles = collectSourceFiles(contexts)
  if (sourceFiles.length === 0) return ''

  const lines = ['### Files to Modify\n']
  for (const file of sourceFiles) {
    lines.push(`- \`${file}\``)
  }
  lines.push('')
  return lines.join('\n') + '\n'
}

// ─── Main Formatter ─────────────────────────────────────────────────

/**
 * Build the formatted prompt using a multi-pass budget strategy.
 *
 * Pass 1: Full fidelity (HTML + vision analysis)
 * Pass 2: Strip HTML from elements
 * Pass 3: Simplify vision summaries in images
 * Pass 4: Drop images and screenshot entirely
 * Pass 5: Hard truncate as last resort
 *
 * Always preserved: user prompt, source file paths, element selectors.
 */
function formatPayload(payload, budget) {
  const maxChars = budget * CHARS_PER_TOKEN

  const header = buildHeader(payload)
  const elementsFull = buildElements(payload.contexts, true)
  const elementsLite = buildElements(payload.contexts, false)
  const imagesFull = buildImages(payload.externalImages, true)
  const imagesLite = buildImages(payload.externalImages, false)
  const screenshot = buildScreenshot(payload)
  const filesToModify = buildFilesToModify(payload.contexts)

  const full = header + elementsFull + imagesFull + screenshot + filesToModify
  if (full.length <= maxChars) return full

  const pass2 = header + elementsLite + imagesFull + screenshot + filesToModify
  if (pass2.length <= maxChars) return pass2

  const pass3 = header + elementsLite + imagesLite + screenshot + filesToModify
  if (pass3.length <= maxChars) return pass3

  const pass4 = header + elementsLite + filesToModify
  if (pass4.length <= maxChars) return pass4

  return truncateToTokenBudget(pass4, budget)
}

/**
 * Validate and normalize a raw payload object.
 * Returns a new object (never mutates the input).
 */
function validatePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid payload: must be a JSON object')
  }

  return {
    route: typeof raw.route === 'string' ? raw.route : null,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : null,
    contexts: Array.isArray(raw.contexts) ? raw.contexts : [],
    externalImages: Array.isArray(raw.externalImages) ? raw.externalImages : [],
    visualAnalysis: raw.visualAnalysis || null,
    visualPrompt: typeof raw.visualPrompt === 'string' ? raw.visualPrompt : null,
    timestamp: raw.timestamp || null,
  }
}

/**
 * Read and parse context.json, with file size validation.
 */
function readContextFile(filePath) {
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_CONTEXT_FILE_SIZE) {
    throw new Error(`Context file too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

module.exports = {
  DEFAULT_TOKEN_BUDGET,
  MAX_TOKEN_BUDGET,
  MIN_TOKEN_BUDGET,
  findProjectRoot,
  findContextFile,
  estimateTokens,
  truncateToTokenBudget,
  formatPayload,
  validatePayload,
  readContextFile,
}
