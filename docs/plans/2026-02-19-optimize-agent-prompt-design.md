# Agent Prompt Optimization Design

**Date:** 2026-02-19
**Branch:** `feat/optimize-agent-prompt`
**Goal:** Reduce agent turn count from 12-25+ to 8-10 for cross-cutting tasks

## Problem

The VCI agent takes 12-25+ turns to complete tasks involving frontend and backend changes.
Analysis of a 12-turn run (add assignee feature) revealed:

- **Wrong path guessing** (turn 1): Agent tried `app/src/pages/Tasks.jsx` before finding `src/pages/Tasks.jsx`
- **Empty thinking turns** (turns 2-3): Two turns with zero tool calls
- **Sequential reads** (turns 4-7): Files read one at a time instead of batched
- **No useful plan** (turn 0): "Proceeding with best judgment" provides no roadmap
- **Post-hoc verification** (turn 11): Reading `useTasks.js` after editing, just to check

Only 3 of 12 turns were productive (actual writes that mattered).

## Approach: Prompt Engineering + Targeted File Pre-loading

### 1. System Prompt Rewrite (`proxy/agent.py`)

Add behavioral directives to `AGENT_SYSTEM_PROMPT`:

- **Planning phase**: Before any tool calls, output a brief plan of which files to read/write
- **Parallel tool use**: "Use parallel tool calls. Read all needed files in one turn."
- **Trust prompt paths**: "Files in 'Files to Modify' and 'Backend Structure' have correct paths. Do NOT guess."
- **No empty turns**: "Every turn must include at least one tool call."
- **Front-load reads**: "Read ALL files first, then make edits. Don't alternate read-write-read."
- **Pre-loaded content**: "When file contents appear under 'Pre-loaded Files', use them directly."

### 2. Targeted File Pre-loading (`proxy/formatter.py`)

New `_build_preloaded_files()` section builder:

- Collects all referenced file paths from `contexts` (source files) and `backendMap` (endpoints, models)
- Reads each file from disk within `VCI_OUTPUT_DIR`
- **Size threshold**: Only files under 200 lines
- **Total token cap**: 5000 tokens across all pre-loaded files
- Files rendered as fenced code blocks with language detection
- Inserted into formatted prompt as `### Pre-loaded Files` section

Multi-pass budget gains a new pass: drop pre-loaded files before dropping images/screenshots.

### 3. Analyze Phase Improvement (`proxy/agent.py`)

Update `ANALYZE_SYSTEM_PROMPT` to require structured plans:

```json
{"action": "proceed", "plan": "1. Read Tasks.jsx\n2. Add assignee field\n3. Update Tasks.css"}
```

Inject the plan into the agent's starting context so it has a roadmap.

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `proxy/agent.py` | Rewrite system prompt, update analyze prompt, inject plan | ~40 |
| `proxy/formatter.py` | Add pre-load builder, update multi-pass strategy | ~50 |

## Thresholds

| Setting | Value | Rationale |
|---------|-------|-----------|
| Pre-load line limit | 200 lines | Covers backend files and small components |
| Pre-load token cap | 5000 tokens | Conservative cost control |
| Max turns | 15 (unchanged) | Safety cap stays the same |

## Expected Outcome

For the assignee task (12 turns currently):
- Eliminate wrong-path read (turn 1): -1 turn
- Eliminate empty thinking turns (turns 2-3): -2 turns
- Eliminate redundant reads via pre-loading (turns 4-7 compressed): -2 turns
- Better planning reduces post-hoc verification: -1 turn

**Expected: 6-8 turns** for this class of task.
