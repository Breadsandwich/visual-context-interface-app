#!/usr/bin/env node

/**
 * VCI Prompt Formatter CLI
 *
 * Reads .vci/context.json and outputs an optimized, natural-language
 * prompt for an AI coding agent. Pipe-friendly (stdout).
 *
 * Usage:
 *   vci format                  # auto-detect project root
 *   vci format --budget 2000    # custom token budget
 *   vci format --file path.json # explicit input file
 *   vci format --watch          # re-output on change
 */

'use strict'

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
} = require('./lib/formatter')

// ─── CLI Argument Parsing ───────────────────────────────────────────

function parseArgs(argv) {
  const args = { budget: DEFAULT_TOKEN_BUDGET, file: null, watch: false }
  let i = 2 // skip node and script path

  while (i < argv.length) {
    switch (argv[i]) {
      case '--budget':
        args.budget = parseInt(argv[++i], 10)
        if (isNaN(args.budget) || args.budget < MIN_TOKEN_BUDGET || args.budget > MAX_TOKEN_BUDGET) {
          process.stderr.write(`Error: --budget must be between ${MIN_TOKEN_BUDGET} and ${MAX_TOKEN_BUDGET}\n`)
          process.exit(1)
        }
        break
      case '--file':
        args.file = argv[++i]
        break
      case '--watch':
        args.watch = true
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        process.stderr.write(`Unknown argument: ${argv[i]}\n`)
        process.exit(1)
    }
    i++
  }

  return args
}

function printUsage() {
  process.stderr.write(`
Usage: vci format [options]

Options:
  --budget <n>    Token budget (default: ${DEFAULT_TOKEN_BUDGET}, range: ${MIN_TOKEN_BUDGET}-${MAX_TOKEN_BUDGET})
  --file <path>   Path to context.json (default: auto-detect)
  --watch         Re-output when context.json changes
  --help, -h      Show this help

Examples:
  claude "$(node cli/vci-format.js)"
  node cli/vci-format.js | claude
  node cli/vci-format.js --budget 2000
`)
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv)

  // Resolve context file — CLI handles explicit --file differently
  let contextPath
  if (args.file) {
    if (!fs.existsSync(args.file)) {
      process.stderr.write(`Error: File not found: ${args.file}\n`)
      process.exit(1)
    }
    contextPath = path.resolve(args.file)
  } else {
    contextPath = findContextFile(null)
    if (!contextPath) {
      process.stderr.write('Error: No .vci/context.json found. Run VCI export first.\n')
      process.exit(1)
    }
  }

  function run() {
    try {
      const raw = readContextFile(contextPath)
      const payload = validatePayload(raw)
      const output = formatPayload(payload, args.budget)
      process.stdout.write(output)
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`)
      process.exit(1)
    }
  }

  if (args.watch) {
    process.stderr.write(`Watching ${contextPath} for changes...\n`)
    run()

    let debounceTimer = null
    const watcher = fs.watch(contextPath, (eventType) => {
      if (eventType !== 'change') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        process.stderr.write('\n--- Context updated ---\n')
        try {
          run()
        } catch (_err) {
          // Don't exit on watch errors — file may be mid-write
        }
        debounceTimer = null
      }, 200)
    })

    process.on('SIGINT', () => {
      watcher.close()
      if (debounceTimer) clearTimeout(debounceTimer)
      process.exit(0)
    })
  } else {
    run()
  }
}

main()
