# Progress Toasts & Interactive Clarification — Design Document

**Date**: 2026-02-17
**Branch**: `feat/backend-behavior-v2`
**Status**: Approved

## Goal

Add detailed per-turn progress toast notifications during agent runs and interactive toast notifications that ask the user for clarification before the agent starts work, reducing instruction ambiguity.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| When to ask | Before starting work | Simpler — one pause point before edits |
| Clarification UI | Toast with inline input | Stays in existing UI pattern, minimal disruption |
| Progress granularity | Per-turn summary | Less noisy than per-tool-call, more useful than phase-based |
| Ambiguity detection | Always auto-detect | No extra UI toggle, agent decides |
| Icons | Inline SVG icons | No emojis — polished SVG icons for all toast states |

## Section 1: Agent State Machine

Agent run expands from 3 states to 5:

```
idle -> analyzing -> clarifying? -> running -> success/error
```

`_current_run` new fields:

| Field | Type | Description |
|-------|------|-------------|
| status | str | idle, analyzing, clarifying, running, success, error |
| clarification | dict or None | {question, context} when clarifying |
| user_response | str or None | User's answer to clarification |
| progress | list[dict] | Turn summaries: [{turn, summary, files_read, files_written}] |

Phase 1 (Analyze): Single Claude API call with analyze-only system prompt. Returns either proceed+plan or clarify+question. No tools used.

Phase 2 (Execute): Existing agentic loop. After each turn, builds a turn summary from tool calls and appends to progress list.

## Section 2: Backend Changes

### proxy/agent.py

**New analyze system prompt**: Instructs Claude to assess ambiguity and return structured JSON — either `{"action":"proceed","plan":"..."}` or `{"action":"clarify","question":"...","context":"..."}`.

**New functions:**
- `_run_analyze(formatted_prompt)` — single API call, parses JSON response, returns action
- `_resume_agent()` — called after user responds to clarification, appends answer to instruction, runs agentic loop
- `_build_turn_summary(turn, content, results, files_changed)` — extracts files_read, files_written, searches from tool call blocks, builds human-readable summary

**Updated `_run_agent`:**
1. Status -> analyzing
2. Call _run_analyze
3. If clarify -> status=clarifying, store question, return
4. If proceed -> status=running, store plan in progress
5. Agentic loop runs, appends turn summary after each turn

**New endpoint — POST /agent/respond:**
- Accepts `{response: string}`
- Validates status is clarifying
- Stores response, creates task for _resume_agent

**Updated GET /agent/status:**
- Now includes `progress` and `clarification` fields

### proxy/main.py

**New endpoint — POST /api/agent-respond:**
- Proxies to internal agent service POST /agent/respond
- Same pattern as existing /api/agent-status proxy

## Section 3: Frontend Changes

### inspectorStore.ts — New state

```
agentProgress: Array<{turn, summary, files_read, files_written}>
agentClarification: {question, context} | null
agentPlan: string | null
setAgentProgress, setAgentClarification, submitClarification, clearAgentState
```

### PayloadPreview.tsx — Updated polling

Handles new statuses:
- analyzing -> toast "Analyzing your request..."
- clarifying -> toast expands with question + input
- running -> toast shows latest progress summary
- success -> toast "Work done", reload iframe
- error -> toast shows error

On each poll, compares progress array length to detect new turn summaries.

### Toast.tsx — Three visual modes

**Progress mode** (analyzing/running):
- SVG spinner icon
- Latest progress summary message
- Small turn counter (e.g., "Turn 3/25")

**Clarification mode** (clarifying):
- SVG question-circle icon (no emojis)
- Question text displayed prominently
- Text input field for user response
- Submit button sends POST /api/agent-respond
- Skip button sends "Proceed with your best judgment"
- Toast stays persistent until user responds

**Completion mode** (existing, unchanged):
- Success: "Work done" auto-dismiss
- Error: error message auto-dismiss

### Toast.css — New styles

- Input field styling (matches existing form patterns)
- Submit/Skip button styling
- Turn counter styling
- Expanded toast height for clarification mode

## Section 4: What Changes vs. What Doesn't

### Changes
| Component | Change |
|-----------|--------|
| proxy/agent.py | New analyze phase, resume, turn summaries, /agent/respond, updated state |
| proxy/main.py | New /api/agent-respond proxy endpoint |
| frontend/src/stores/inspectorStore.ts | New agent progress/clarification state + actions |
| frontend/src/components/PayloadPreview.tsx | Updated polling for new statuses + progress |
| frontend/src/components/Toast.tsx | Three modes: progress, clarification (inline input), completion |
| frontend/src/components/Toast.css | Input field, buttons, turn counter styles |

### No Changes
- Agent tools (agent_tools.py)
- Backend scanner (backend_scanner.py)
- Formatter (formatter.py)
- Inspector (inspector.js)
- Export endpoint signature
