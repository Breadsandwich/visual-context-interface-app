# Multi-Agent Architecture Design

**Date:** 2026-02-19
**Branch:** `feat/multi-agent-approach`
**Status:** Approved

## Overview

Pivot from a single full-stack agent to a multi-agent system with an orchestrator acting as a Technical Product Manager (TPM) that delegates tasks to specialized frontend and backend engineer agents, followed by a security/code review agent.

## Decisions

| Decision | Choice |
|----------|--------|
| Architecture | Orchestrator-as-Router with TPM role |
| File conflicts | Lock-based ownership assigned by orchestrator |
| Agent configs | JSON config files + separate system prompt `.md` files |
| Model selection | Per-agent in config (e.g., opus for orchestrator, sonnet for workers) |
| Orchestrator role | Analyzes request, breaks into subtasks, assigns file locks, spawns agents |
| Parallel execution | Yes, when tasks are independent (no shared file locks) |
| Toast UX | Stacked toasts, one per active agent |
| TDD | Agents write + run tests via `run_tests` tool |
| Review | Separate reviewer agent after workers complete |
| Replaceability | Swap prompts/tools/scope via config without code changes |

## Agent Configuration System

Agents are defined by JSON config files in `/proxy/agents/configs/`:

```
proxy/agents/configs/
  orchestrator.json
  frontend-engineer.json
  backend-engineer.json
  reviewer.json
```

System prompts live as separate markdown files in `/proxy/agents/prompts/`.

### Config Schema

```json
{
  "id": "frontend-engineer",
  "name": "Frontend Engineer",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/frontend-engineer.md",
  "tools": ["read_file", "write_file", "list_directory", "search_files", "run_tests"],
  "file_scope": {
    "allowed_patterns": ["src/**", "public/**", "*.html", "*.css", "*.tsx", "*.ts"],
    "blocked_patterns": ["api/**", "database.*", "models.*"]
  },
  "test_command": "npm test",
  "max_turns": 15,
  "max_tokens": 4096
}
```

The orchestrator config adds `"delegates_to": ["frontend-engineer", "backend-engineer"]` and `"review_agent": "reviewer"`.

## Orchestrator Flow (TPM)

```
1. VCI context arrives at proxy -> POST /api/export-context
2. Proxy triggers orchestrator agent
3. Orchestrator analyzes the request:
   a. Breaks down into subtasks
   b. Assigns each subtask to an agent
   c. Assigns file locks per agent (based on file_scope + task analysis)
   d. Determines execution strategy: parallel or sequential
4. Orchestrator spawns worker agents:
   - Independent tasks -> parallel execution
   - Dependent tasks -> sequential with handoff data
5. Each worker agent:
   a. Receives subtask + context + file locks
   b. Writes tests first (TDD)
   c. Implements to pass tests
   d. Runs test command from config
   e. Reports completion + files changed
6. Orchestrator collects results from all workers
7. Orchestrator spawns reviewer agent with all changes
8. Reviewer checks security + code quality
9. Orchestrator reports final status to frontend
```

### Orchestrator Structured Output

```json
{
  "tasks": [
    {
      "id": "task-1",
      "agent": "frontend-engineer",
      "description": "Add search input component with debounced onChange",
      "file_locks": ["src/components/SearchBar.tsx", "src/App.tsx"],
      "depends_on": []
    },
    {
      "id": "task-2",
      "agent": "backend-engineer",
      "description": "Add /api/search endpoint with query parameter",
      "file_locks": ["api/routes/search.py", "api/models.py"],
      "depends_on": []
    }
  ],
  "execution": "parallel"
}
```

## Backend Architecture

### Module Structure

```
proxy/agents/
  configs/                    # Agent JSON configs
    orchestrator.json
    frontend-engineer.json
    backend-engineer.json
    reviewer.json
  prompts/                    # System prompt markdown files
    orchestrator.md
    frontend-engineer.md
    backend-engineer.md
    reviewer.md
  orchestrator.py             # TPM logic: analyze, plan, delegate
  worker.py                   # Generic worker agent (runs any config)
  registry.py                 # Loads configs, creates agent instances
  file_lock.py                # Lock manager for file ownership
  state.py                    # Multi-agent state tracking
  tools.py                    # Shared tool definitions (from current agent_tools.py)
```

### Key Refactoring

- `agent.py` splits into `orchestrator.py` + `worker.py`
- `agent_tools.py` moves to `agents/tools.py` (adds `run_tests` tool)
- New `registry.py` loads configs from JSON at startup
- New `file_lock.py` manages per-run file ownership
- New `state.py` tracks multiple concurrent agent runs

### API Changes

| Endpoint | Change |
|----------|--------|
| `POST /agent/run` | Now starts orchestrator, returns `run_id` |
| `GET /agent/status` | Returns orchestrator + all worker statuses |
| `GET /agent/status/{agent_id}` | New: individual agent status |
| `POST /agent/respond` | Routes clarification to correct agent |

### Multi-Agent State

```python
{
  "run_id": "run-abc123",
  "status": "running",
  "orchestrator": {
    "status": "delegating",
    "plan": {...}
  },
  "workers": {
    "frontend-engineer-1": {
      "status": "running",
      "agent_config": "frontend-engineer",
      "task": "Add search bar...",
      "turns": 3,
      "progress": [...],
      "files_changed": [...]
    },
    "backend-engineer-1": {
      "status": "running",
      "agent_config": "backend-engineer",
      "task": "Add /search endpoint...",
      "turns": 2,
      "progress": [...],
      "files_changed": [...]
    }
  },
  "reviewer": null
}
```

## Stacked Toast Notifications (Frontend)

### Store Changes

```typescript
// New multi-agent state
agentWorkers: Record<string, {
  agentId: string
  agentName: string
  status: 'running' | 'success' | 'error' | 'clarifying'
  progress: Array<{turn, summary, files_read, files_written}>
  clarification: {question, context} | null
  task: string
}>
orchestratorStatus: 'idle' | 'planning' | 'delegating' | 'reviewing' | 'done' | 'error'
orchestratorPlan: object | null
```

### Toast Behavior

- When `Object.keys(agentWorkers).length > 1`: render stacked toasts
- Each toast shows: agent name badge + current action + mini progress
- Toasts stack from bottom, newest on top
- Each toast has its own close/dismiss
- Clarification toasts (interactive) float above progress toasts
- When all workers finish + review complete: single "All done" toast

### Polling Changes

- Poll `/api/agent-status` at 2s interval (unchanged)
- Response now includes all worker statuses
- Store updates all workers atomically per poll
- Individual worker completion does not stop polling (wait for orchestrator "done")

## TDD Integration

### `run_tests` Tool

```python
{
  "name": "run_tests",
  "description": "Run the test suite for this agent's scope.",
  "input_schema": {
    "type": "object",
    "properties": {
      "test_path": {
        "type": "string",
        "description": "Optional specific test file or directory"
      }
    }
  }
}
```

- Uses `test_command` from agent config
- Runs inside target app Docker container via `docker exec`
- Returns stdout/stderr + pass/fail count
- Timeout: 60 seconds per run
- Output truncated to 4000 chars
- Agent system prompts instruct: write test -> run (expect fail) -> implement -> run (expect pass)

## Review Agent

After all workers complete, the orchestrator spawns the reviewer:

- Receives: all files changed by all workers + original task description
- Reads every changed file
- Checks: OWASP top 10, hardcoded secrets, injection vectors, code quality, cross-agent consistency, test coverage
- Outputs structured review:

```json
{
  "verdict": "approve" | "request_changes",
  "issues": [
    {"severity": "critical", "file": "...", "line": 12, "message": "..."}
  ],
  "summary": "..."
}
```

- If `request_changes`: reported to user (re-dispatch to workers is a future enhancement)
- Shows as a "Review" badge toast while running

## File Lock Manager

- Orchestrator assigns file locks at plan time based on `file_scope` + task analysis
- Each worker receives its lock set as part of the task payload
- `write_file` tool validates against the lock set before writes
- If a worker needs a file outside its locks, the write is rejected with a clear error message
- Locks are per-run, released when the run completes
