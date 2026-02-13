#!/usr/bin/env node

/**
 * VCI MCP Server
 *
 * Exposes visual context captured by VCI as a tool for Claude Code.
 * Reads .vci/context.json and returns a formatted agent-ready prompt.
 *
 * Register with: claude mcp add vci-context -- node cli/mcp/server.js
 */

'use strict'

const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js')
const fs = require('fs')
const path = require('path')
const {
  DEFAULT_TOKEN_BUDGET,
  MIN_TOKEN_BUDGET,
  MAX_TOKEN_BUDGET,
  findContextFile,
  formatPayload,
  validatePayload,
  readContextFile,
} = require('../lib/formatter')

// ─── Path Safety ────────────────────────────────────────────────────

function isSafeProjectDir(dir) {
  const resolved = path.resolve(dir)
  const home = process.env.HOME || process.env.USERPROFILE || ''

  // Allow paths under home directory or current working directory
  if (home && resolved.startsWith(home)) return true
  if (resolved.startsWith(process.cwd())) return true

  return false
}

function getFileAge(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const ageMs = Date.now() - stat.mtimeMs
    const minutes = Math.floor(ageMs / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  } catch {
    return null
  }
}

// ─── MCP Server ─────────────────────────────────────────────────────

const server = new Server(
  { name: 'vci-context', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vci_get_context',
      description:
        'Get visual context captured by VCI (Visual Context Interface). ' +
        'Returns a formatted prompt with selected DOM elements, source file locations, ' +
        'design reference images, and screenshot analysis. Use this when the user ' +
        'mentions visual context, VCI, or wants you to reference what they captured in the inspector.',
      inputSchema: {
        type: 'object',
        properties: {
          project_dir: {
            type: 'string',
            description:
              'Absolute path to the project directory containing .vci/context.json. ' +
              'If omitted, auto-detects from CWD or nearest project root.',
          },
          budget: {
            type: 'number',
            description: `Maximum token budget for the output (default: ${DEFAULT_TOKEN_BUDGET}, range: ${MIN_TOKEN_BUDGET}-${MAX_TOKEN_BUDGET}).`,
          },
        },
        required: [],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'vci_get_context') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}. Available tools: vci_get_context` }],
      isError: true,
    }
  }

  const args = request.params.arguments || {}

  // Validate budget
  let budget = DEFAULT_TOKEN_BUDGET
  if (typeof args.budget === 'number') {
    if (args.budget < MIN_TOKEN_BUDGET || args.budget > MAX_TOKEN_BUDGET) {
      return {
        content: [{ type: 'text', text: `Invalid budget: must be between ${MIN_TOKEN_BUDGET} and ${MAX_TOKEN_BUDGET}` }],
        isError: true,
      }
    }
    budget = args.budget
  }

  // Validate project_dir safety
  let projectDir = null
  if (args.project_dir && typeof args.project_dir === 'string') {
    if (!isSafeProjectDir(args.project_dir)) {
      return {
        content: [{ type: 'text', text: 'Invalid project_dir: must be within home directory or current working directory' }],
        isError: true,
      }
    }
    projectDir = args.project_dir
  }

  const contextPath = findContextFile(projectDir)

  if (!contextPath) {
    return {
      content: [
        {
          type: 'text',
          text: 'No .vci/context.json found. Export visual context from VCI first ' +
            '(click "Send to ADOM" in the VCI sidebar).',
        },
      ],
      isError: true,
    }
  }

  try {
    const raw = readContextFile(contextPath)
    const payload = validatePayload(raw)
    const formatted = formatPayload(payload, budget)
    const age = getFileAge(contextPath)

    return {
      content: [
        {
          type: 'text',
          text: formatted + (age ? `\n*Context captured ${age} ago from ${contextPath}*\n` : ''),
        },
      ],
    }
  } catch (err) {
    let message = 'Error reading context: '

    if (err.code === 'ENOENT') {
      message += 'context.json not found'
    } else if (err instanceof SyntaxError) {
      message += `Invalid JSON in context.json: ${err.message}`
    } else if (err.code === 'EACCES') {
      message += 'Permission denied reading context.json'
    } else {
      message += err.message
    }

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    }
  }
})

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('VCI MCP server running')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
