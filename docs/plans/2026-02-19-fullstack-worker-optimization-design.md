# Full-Stack Worker Optimization Design

## Problem

The multi-agent approach (orchestrator + frontend-engineer + backend-engineer + reviewer) produced friction during live runs:

1. **Wasted output** -- backend agent generated ~1000 lines of markdown docs, verification scripts, and demo files nobody requested
2. **Sequential execution** -- backend finished all work before frontend started, no parallelism achieved
3. **No coordination** -- agents worked in isolation with no feedback between them
4. **Overhead** -- splitting a coherent full-stack feature across two agents added complexity without proportional benefit

## Decision

Replace the two specialist workers (frontend-engineer, backend-engineer) with a single **fullstack-engineer** worker. Keep the orchestrator as a planner and the reviewer as a quality gate.

## Design

### Agent Configuration

**New:** `proxy/agents/configs/fullstack-engineer.json`

- Combined file scope: `api/**`, `*.py`, `src/**`, `*.tsx`, `*.jsx`, `*.css`, `*.ts`, `*.js`, `*.html`, `public/**`
- Blocked patterns: `*.md`, `*.txt`, `*.log` (prevents documentation noise)
- `test_commands`: `{"backend": "python -m pytest", "frontend": "npm test"}` (replaces single `test_command`)
- 40 max turns, 4096 max tokens

**New:** `proxy/agents/prompts/fullstack-engineer.md`

- Combined React + FastAPI expertise
- TDD workflow
- Explicit rule: NEVER create documentation, verification, or demo files

**Remove:** `frontend-engineer.json`, `backend-engineer.json`, and their prompt files.

### Orchestrator Changes

- Update `delegates_to` in orchestrator config: `["fullstack-engineer"]`
- Update orchestrator system prompt: one worker, single comprehensive task, step-by-step plan
- No code changes to orchestrator.py -- existing plan/delegate/review pipeline works as-is

### Tool Layer Hard Block

In `proxy/agents/tools.py`, `execute_write_file` rejects:

- Files with extensions: `.md`, `.txt`, `.log`, `.rst`
- Files with stems starting with: `demo_`, `verify_`, `verification_`, `check_`

Returns a clear error message so the agent redirects effort to source code.

### run_tests Tool Update

- Accept a `suite` parameter (`"backend"` or `"frontend"`)
- Look up command from `test_commands` dict in agent config
- Backward-compatible: falls back to `test_command` string if `test_commands` dict is absent

### Frontend

No changes. The existing multi-agent toast stack renders correctly with a single worker (shows one toast).

### Testing

- Update existing worker/orchestrator tests for new config shape
- Add tool-level tests for the `.md`/`.txt` hard block
- Add `run_tests` suite parameter tests

## Architecture (After)

```
VCI Context --> Orchestrator (plan) --> Full-Stack Worker (execute) --> Reviewer (verify)
                     |                        |                            |
               1 LLM call              up to 40 turns                read-only audit
               structured plan         backend + frontend             security + quality
```

## Trade-offs

| Kept | Dropped |
|------|---------|
| Orchestrator planning step | Specialist agent separation |
| Reviewer quality gate | Parallel worker execution |
| File lock system (for future multi-agent) | Frontend/backend scope isolation |
| Multi-agent toast UI (works with 1 worker) | - |
