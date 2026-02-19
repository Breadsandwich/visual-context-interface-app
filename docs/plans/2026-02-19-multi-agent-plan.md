# Multi-Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single full-stack agent with a multi-agent system where an orchestrator (Technical PM) delegates tasks to specialized frontend and backend engineer agents, followed by a security/code review agent, with stacked toast notifications for concurrent agent progress.

**Architecture:** An orchestrator agent analyzes VCI context, breaks it into scoped subtasks, and spawns specialized worker agents (frontend-engineer, backend-engineer) in parallel with lock-based file ownership. After workers complete, a reviewer agent runs security and code quality checks. Each agent is defined by a JSON config file with separate system prompt markdown files, making agents replaceable by editing configs.

**Tech Stack:** Python (FastAPI, asyncio, anthropic SDK), React + TypeScript + Zustand (frontend), JSON config files for agent definitions.

---

## Phase 1: Branch Setup & Agent Config System

### Task 1: Create branch and directory structure

**Files:**
- Create: `proxy/agents/__init__.py`
- Create: `proxy/agents/configs/` (directory)
- Create: `proxy/agents/prompts/` (directory)

**Step 1: Create the feature branch**

Run: `git checkout -b feat/multi-agent-approach`
Expected: Switched to new branch

**Step 2: Create directory structure**

Run:
```bash
mkdir -p proxy/agents/configs proxy/agents/prompts
touch proxy/agents/__init__.py
```

**Step 3: Commit**

```bash
git add proxy/agents/__init__.py
git commit -m "chore: scaffold multi-agent directory structure"
```

---

### Task 2: Create agent config files

**Files:**
- Create: `proxy/agents/configs/orchestrator.json`
- Create: `proxy/agents/configs/frontend-engineer.json`
- Create: `proxy/agents/configs/backend-engineer.json`
- Create: `proxy/agents/configs/reviewer.json`

**Step 1: Write orchestrator config**

Create `proxy/agents/configs/orchestrator.json`:
```json
{
  "id": "orchestrator",
  "name": "Orchestrator",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/orchestrator.md",
  "tools": [],
  "delegates_to": ["frontend-engineer", "backend-engineer"],
  "review_agent": "reviewer",
  "max_tokens": 4096
}
```

**Step 2: Write frontend-engineer config**

Create `proxy/agents/configs/frontend-engineer.json`:
```json
{
  "id": "frontend-engineer",
  "name": "Frontend Engineer",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/frontend-engineer.md",
  "tools": ["read_file", "write_file", "list_directory", "search_files", "run_tests"],
  "file_scope": {
    "allowed_patterns": ["src/**", "public/**", "*.html", "*.css", "*.tsx", "*.ts", "*.jsx", "*.js"],
    "blocked_patterns": ["api/**", "database.*", "models.*", "routes/**"]
  },
  "test_command": "npm test",
  "max_turns": 15,
  "max_tokens": 4096
}
```

**Step 3: Write backend-engineer config**

Create `proxy/agents/configs/backend-engineer.json`:
```json
{
  "id": "backend-engineer",
  "name": "Backend Engineer",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/backend-engineer.md",
  "tools": ["read_file", "write_file", "list_directory", "search_files", "run_tests"],
  "file_scope": {
    "allowed_patterns": ["api/**", "*.py", "models.*", "routes/**", "database.*"],
    "blocked_patterns": ["src/**", "public/**", "*.tsx", "*.jsx", "*.css"]
  },
  "test_command": "python -m pytest",
  "max_turns": 15,
  "max_tokens": 4096
}
```

**Step 4: Write reviewer config**

Create `proxy/agents/configs/reviewer.json`:
```json
{
  "id": "reviewer",
  "name": "Security & Code Reviewer",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/reviewer.md",
  "tools": ["read_file", "list_directory", "search_files"],
  "max_turns": 5,
  "max_tokens": 4096
}
```

**Step 5: Commit**

```bash
git add proxy/agents/configs/
git commit -m "feat: add agent config files for orchestrator, frontend, backend, reviewer"
```

---

### Task 3: Create agent system prompts

**Files:**
- Create: `proxy/agents/prompts/orchestrator.md`
- Create: `proxy/agents/prompts/frontend-engineer.md`
- Create: `proxy/agents/prompts/backend-engineer.md`
- Create: `proxy/agents/prompts/reviewer.md`

**Step 1: Write orchestrator prompt**

Create `proxy/agents/prompts/orchestrator.md`:
```markdown
You are a Technical Product Manager for a code editing system. You receive visual context from VCI (Visual Context Interface) — selected DOM elements with source file locations, design reference images, user instructions, and backend structure maps.

Your job: analyze the user's request, break it into scoped subtasks, and assign each task to the right specialist agent.

## Your Agents

- **frontend-engineer**: React, JSX, CSS, HTML, TypeScript UI changes. Can run `npm test`.
- **backend-engineer**: FastAPI, Python, SQLModel, database, API endpoints. Can run `pytest`.

## Your Output

Respond with ONLY a JSON object (no markdown fencing):

{
  "tasks": [
    {
      "id": "task-1",
      "agent": "frontend-engineer",
      "description": "Detailed description of what to change...",
      "file_locks": ["src/components/Foo.tsx", "src/App.tsx"],
      "depends_on": []
    }
  ],
  "execution": "parallel" | "sequential"
}

## Rules

- Assign tasks based on scope: UI/styling/components -> frontend-engineer, data/API/models -> backend-engineer
- For cross-cutting changes (e.g., "add a tags feature"), create separate tasks for each agent
- Set `depends_on` when a frontend task needs a backend endpoint to exist first
- Use "parallel" execution when tasks are independent, "sequential" when there are dependencies
- Assign `file_locks` based on which files each agent needs to write. No overlapping locks.
- Be specific in descriptions — include file paths, component names, expected behavior
- Lean toward fewer tasks — don't split unnecessarily
```

**Step 2: Write frontend-engineer prompt**

Create `proxy/agents/prompts/frontend-engineer.md`:
```markdown
You are a Frontend Engineer agent. You receive specific tasks to implement in a React + TypeScript application.

Your job: make the requested changes using a TDD approach.

## TDD Workflow

1. Write a test for the expected behavior first
2. Run the test to verify it fails (`run_tests` tool)
3. Implement the minimal code to make the test pass
4. Run the test to verify it passes
5. Refactor if needed

## Rules

- Only modify files within your assigned scope (frontend: src/, public/, *.tsx, *.ts, *.css, *.html)
- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- After making changes, briefly summarize what you did
- NEVER modify dotfiles (.env, .bashrc) or executable scripts
- NEVER write files outside the project's source directories
- If a file write is rejected due to lock restrictions, explain what you need and stop

## Security

- Sanitize any user input rendered in the UI
- Never include hardcoded secrets
- Use safe DOM manipulation patterns (no innerHTML with user data)
```

**Step 3: Write backend-engineer prompt**

Create `proxy/agents/prompts/backend-engineer.md`:
```markdown
You are a Backend Engineer agent. You receive specific tasks to implement in a FastAPI + SQLModel + SQLite application.

Your job: make the requested changes using a TDD approach.

## TDD Workflow

1. Write a test for the expected behavior first
2. Run the test to verify it fails (`run_tests` tool)
3. Implement the minimal code to make the test pass
4. Run the test to verify it passes
5. Refactor if needed

## Rules

- Only modify files within your assigned scope (api/, *.py, models.py, routes/, database.py)
- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- After making changes, briefly summarize what you did
- NEVER modify dotfiles (.env, .bashrc) or executable scripts
- NEVER modify database.py directly — update models and let create_all() handle schema
- If a file write is rejected due to lock restrictions, explain what you need and stop

## Security

- Use parameterized queries (SQLModel handles this)
- Validate all API inputs with Pydantic models
- Never include hardcoded secrets
- Return appropriate HTTP status codes
```

**Step 4: Write reviewer prompt**

Create `proxy/agents/prompts/reviewer.md`:
```markdown
You are a Security & Code Reviewer. You receive a list of files that were modified by other agents.

Your job: review all changed files for security vulnerabilities and code quality issues.

## Review Checklist

### Security (OWASP Top 10)
- SQL injection (even with ORMs — check raw queries)
- XSS (unsanitized user input in HTML/JSX)
- CSRF protection
- Hardcoded secrets or API keys
- Path traversal in file operations
- Insecure deserialization
- Missing input validation
- Information leakage in error messages

### Code Quality
- Naming conventions (consistent with existing code)
- Function size (< 50 lines)
- Error handling (try/catch where needed)
- No unused imports or dead code
- Type safety (TypeScript strict, Python type hints)

### Cross-Agent Consistency
- Frontend API calls match backend endpoints (method, path, request/response shape)
- Shared types/interfaces are consistent
- Database schema changes are reflected in both layers

## Your Output

Respond with ONLY a JSON object (no markdown fencing):

{
  "verdict": "approve" | "request_changes",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "file": "relative/path/to/file",
      "line": 42,
      "message": "Description of the issue"
    }
  ],
  "summary": "Brief overall assessment"
}
```

**Step 5: Commit**

```bash
git add proxy/agents/prompts/
git commit -m "feat: add system prompts for all agent types"
```

---

## Phase 2: Backend Multi-Agent Infrastructure

### Task 4: Create the agent registry

**Files:**
- Create: `proxy/agents/registry.py`
- Create: `proxy/tests/test_registry.py`

**Step 1: Write the failing test**

Create `proxy/tests/test_registry.py`:
```python
"""Tests for agent registry — config loading and validation."""

import json
import pytest
from pathlib import Path


def test_load_all_configs(tmp_path):
    """Registry loads all JSON configs from a directory."""
    from agents.registry import AgentRegistry

    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()

    (prompts_dir / "test-agent.md").write_text("You are a test agent.")
    (configs_dir / "test-agent.json").write_text(json.dumps({
        "id": "test-agent",
        "name": "Test Agent",
        "model": "claude-sonnet-4-5-20250929",
        "system_prompt_file": "prompts/test-agent.md",
        "tools": ["read_file"],
        "max_turns": 10,
        "max_tokens": 2048,
    }))

    registry = AgentRegistry(configs_dir, prompts_dir)
    assert "test-agent" in registry.agents
    agent = registry.get("test-agent")
    assert agent["name"] == "Test Agent"
    assert agent["system_prompt"] == "You are a test agent."


def test_get_unknown_agent(tmp_path):
    """Registry raises KeyError for unknown agent ID."""
    from agents.registry import AgentRegistry

    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()

    registry = AgentRegistry(configs_dir, prompts_dir)
    with pytest.raises(KeyError):
        registry.get("nonexistent")


def test_config_missing_prompt_file(tmp_path):
    """Registry logs warning when prompt file is missing."""
    from agents.registry import AgentRegistry

    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()

    (configs_dir / "bad-agent.json").write_text(json.dumps({
        "id": "bad-agent",
        "name": "Bad Agent",
        "model": "claude-sonnet-4-5-20250929",
        "system_prompt_file": "prompts/nonexistent.md",
        "tools": [],
        "max_tokens": 2048,
    }))

    registry = AgentRegistry(configs_dir, prompts_dir)
    agent = registry.get("bad-agent")
    assert agent["system_prompt"] == ""
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app && python -m pytest proxy/tests/test_registry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'agents.registry'`

**Step 3: Write the registry implementation**

Create `proxy/agents/registry.py`:
```python
"""Agent Registry — loads agent configs from JSON files at startup."""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class AgentRegistry:
    """Loads and serves agent configurations from JSON files."""

    def __init__(self, configs_dir: Path, prompts_dir: Path) -> None:
        self._agents: dict[str, dict[str, Any]] = {}
        self._prompts_dir = prompts_dir
        self._load_configs(configs_dir)

    @property
    def agents(self) -> dict[str, dict[str, Any]]:
        return dict(self._agents)

    def get(self, agent_id: str) -> dict[str, Any]:
        """Get agent config by ID. Raises KeyError if not found."""
        if agent_id not in self._agents:
            raise KeyError(f"Unknown agent: {agent_id}")
        return dict(self._agents[agent_id])

    def _load_configs(self, configs_dir: Path) -> None:
        """Load all .json config files from the configs directory."""
        if not configs_dir.is_dir():
            logger.warning("Configs directory not found: %s", configs_dir)
            return

        for config_file in sorted(configs_dir.glob("*.json")):
            try:
                raw = json.loads(config_file.read_text(encoding="utf-8"))
                agent_id = raw.get("id", config_file.stem)

                # Load system prompt from file
                prompt_file = raw.get("system_prompt_file", "")
                system_prompt = self._load_prompt(prompt_file)

                self._agents[agent_id] = {
                    **raw,
                    "system_prompt": system_prompt,
                }
                logger.info("Loaded agent config: %s", agent_id)
            except (json.JSONDecodeError, OSError) as exc:
                logger.error("Failed to load agent config %s: %s", config_file.name, exc)

    def _load_prompt(self, prompt_path: str) -> str:
        """Load a system prompt markdown file relative to prompts_dir."""
        if not prompt_path:
            return ""
        # prompt_path is like "prompts/frontend-engineer.md" — strip the "prompts/" prefix
        filename = Path(prompt_path).name
        full_path = self._prompts_dir / filename
        if not full_path.is_file():
            logger.warning("Prompt file not found: %s", full_path)
            return ""
        try:
            return full_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to read prompt file %s: %s", full_path, exc)
            return ""
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_registry.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add proxy/agents/registry.py proxy/tests/test_registry.py
git commit -m "feat: add agent registry for loading configs from JSON files"
```

---

### Task 5: Create the file lock manager

**Files:**
- Create: `proxy/agents/file_lock.py`
- Create: `proxy/tests/test_file_lock.py`

**Step 1: Write the failing test**

Create `proxy/tests/test_file_lock.py`:
```python
"""Tests for file lock manager."""

import pytest
from agents.file_lock import FileLockManager


def test_acquire_locks():
    """Can acquire locks for a set of files."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx", "src/index.tsx"])
    assert manager.is_locked_by("worker-1", "src/App.tsx")
    assert manager.is_locked_by("worker-1", "src/index.tsx")


def test_cannot_acquire_already_locked():
    """Cannot acquire a lock that another worker holds."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx"])
    with pytest.raises(ValueError, match="already locked"):
        manager.acquire("worker-2", ["src/App.tsx"])


def test_can_write_own_locked_file():
    """Worker can write to its own locked files."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx"])
    assert manager.can_write("worker-1", "src/App.tsx") is True


def test_cannot_write_other_locked_file():
    """Worker cannot write to another worker's locked files."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx"])
    assert manager.can_write("worker-2", "src/App.tsx") is False


def test_can_write_unlocked_file():
    """Worker can write to files not locked by anyone."""
    manager = FileLockManager()
    assert manager.can_write("worker-1", "src/NewFile.tsx") is True


def test_release_locks():
    """Released locks become available."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx"])
    manager.release("worker-1")
    assert manager.can_write("worker-2", "src/App.tsx") is True


def test_release_all():
    """Release all locks for a clean state."""
    manager = FileLockManager()
    manager.acquire("worker-1", ["src/App.tsx"])
    manager.acquire("worker-2", ["api/main.py"])
    manager.release_all()
    assert manager.can_write("worker-3", "src/App.tsx") is True
    assert manager.can_write("worker-3", "api/main.py") is True
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_file_lock.py -v`
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write the file lock implementation**

Create `proxy/agents/file_lock.py`:
```python
"""File lock manager for multi-agent file ownership."""

import logging

logger = logging.getLogger(__name__)


class FileLockManager:
    """Manages per-file locks assigned to worker agents.

    Thread-safe within a single asyncio event loop (single-threaded).
    """

    def __init__(self) -> None:
        self._locks: dict[str, str] = {}  # file_path -> worker_id

    def acquire(self, worker_id: str, file_paths: list[str]) -> None:
        """Acquire locks on a set of files for a worker.

        Raises ValueError if any file is already locked by another worker.
        """
        # Check all files first (atomic: either all succeed or none)
        for path in file_paths:
            existing = self._locks.get(path)
            if existing and existing != worker_id:
                raise ValueError(
                    f"File '{path}' already locked by '{existing}'"
                )

        for path in file_paths:
            self._locks[path] = worker_id
            logger.info("Lock acquired: %s -> %s", path, worker_id)

    def can_write(self, worker_id: str, file_path: str) -> bool:
        """Check if a worker can write to a file.

        Returns True if the file is unlocked or locked by this worker.
        """
        existing = self._locks.get(file_path)
        if existing is None:
            return True
        return existing == worker_id

    def is_locked_by(self, worker_id: str, file_path: str) -> bool:
        """Check if a specific worker holds the lock for a file."""
        return self._locks.get(file_path) == worker_id

    def release(self, worker_id: str) -> None:
        """Release all locks held by a worker."""
        to_remove = [
            path for path, owner in self._locks.items()
            if owner == worker_id
        ]
        for path in to_remove:
            del self._locks[path]
            logger.info("Lock released: %s (was %s)", path, worker_id)

    def release_all(self) -> None:
        """Release all locks."""
        self._locks.clear()
        logger.info("All file locks released")
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_file_lock.py -v`
Expected: 7 passed

**Step 5: Commit**

```bash
git add proxy/agents/file_lock.py proxy/tests/test_file_lock.py
git commit -m "feat: add file lock manager for multi-agent file ownership"
```

---

### Task 6: Create the multi-agent state manager

**Files:**
- Create: `proxy/agents/state.py`
- Create: `proxy/tests/test_state.py`

**Step 1: Write the failing test**

Create `proxy/tests/test_state.py`:
```python
"""Tests for multi-agent state manager."""

from agents.state import MultiAgentState


def test_initial_state():
    state = MultiAgentState()
    snapshot = state.snapshot()
    assert snapshot["status"] == "idle"
    assert snapshot["orchestrator"] is None
    assert snapshot["workers"] == {}
    assert snapshot["reviewer"] is None


def test_start_run():
    state = MultiAgentState()
    run_id = state.start_run()
    snapshot = state.snapshot()
    assert snapshot["run_id"] == run_id
    assert snapshot["status"] == "planning"


def test_set_orchestrator_plan():
    state = MultiAgentState()
    state.start_run()
    plan = {"tasks": [{"id": "t1", "agent": "frontend-engineer"}], "execution": "parallel"}
    state.set_orchestrator_plan(plan)
    snapshot = state.snapshot()
    assert snapshot["orchestrator"]["plan"] == plan
    assert snapshot["status"] == "delegating"


def test_register_worker():
    state = MultiAgentState()
    state.start_run()
    state.register_worker("fe-1", "frontend-engineer", "Frontend Engineer", "Add button")
    snapshot = state.snapshot()
    assert "fe-1" in snapshot["workers"]
    assert snapshot["workers"]["fe-1"]["status"] == "running"
    assert snapshot["workers"]["fe-1"]["task"] == "Add button"


def test_update_worker_progress():
    state = MultiAgentState()
    state.start_run()
    state.register_worker("fe-1", "frontend-engineer", "Frontend Engineer", "Add button")
    progress = {"turn": 1, "summary": "Reading App.tsx"}
    state.update_worker_progress("fe-1", progress)
    snapshot = state.snapshot()
    assert len(snapshot["workers"]["fe-1"]["progress"]) == 1


def test_complete_worker():
    state = MultiAgentState()
    state.start_run()
    state.register_worker("fe-1", "frontend-engineer", "Frontend Engineer", "Add button")
    state.complete_worker("fe-1", ["src/App.tsx"], "Done")
    snapshot = state.snapshot()
    assert snapshot["workers"]["fe-1"]["status"] == "success"
    assert snapshot["workers"]["fe-1"]["files_changed"] == ["src/App.tsx"]


def test_all_workers_done():
    state = MultiAgentState()
    state.start_run()
    state.register_worker("fe-1", "frontend-engineer", "Frontend Engineer", "Task 1")
    state.register_worker("be-1", "backend-engineer", "Backend Engineer", "Task 2")
    assert state.all_workers_done() is False
    state.complete_worker("fe-1", [], "Done")
    assert state.all_workers_done() is False
    state.complete_worker("be-1", [], "Done")
    assert state.all_workers_done() is True


def test_set_review():
    state = MultiAgentState()
    state.start_run()
    state.set_review_status("running")
    snapshot = state.snapshot()
    assert snapshot["status"] == "reviewing"


def test_complete_run():
    state = MultiAgentState()
    state.start_run()
    state.complete_run("All changes applied successfully")
    snapshot = state.snapshot()
    assert snapshot["status"] == "success"
    assert snapshot["message"] == "All changes applied successfully"


def test_fail_run():
    state = MultiAgentState()
    state.start_run()
    state.fail_run("Something went wrong")
    snapshot = state.snapshot()
    assert snapshot["status"] == "error"
    assert snapshot["error"] == "Something went wrong"


def test_reset():
    state = MultiAgentState()
    state.start_run()
    state.register_worker("fe-1", "frontend-engineer", "Frontend Engineer", "Task")
    state.reset()
    snapshot = state.snapshot()
    assert snapshot["status"] == "idle"
    assert snapshot["workers"] == {}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_state.py -v`
Expected: FAIL

**Step 3: Write the state manager implementation**

Create `proxy/agents/state.py`:
```python
"""Multi-agent state manager.

Tracks the lifecycle of an orchestrated agent run: planning -> delegating ->
running workers -> reviewing -> success/error.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class MultiAgentState:
    """Immutable-update state manager for multi-agent runs."""

    def __init__(self) -> None:
        self._state: dict[str, Any] = self._idle_state()

    def _idle_state(self) -> dict[str, Any]:
        return {
            "run_id": None,
            "status": "idle",
            "orchestrator": None,
            "workers": {},
            "reviewer": None,
            "message": None,
            "error": None,
            "timestamp": None,
        }

    def snapshot(self) -> dict[str, Any]:
        """Return a deep copy of current state."""
        import copy
        return copy.deepcopy(self._state)

    def start_run(self) -> str:
        """Start a new orchestrated run. Returns run_id."""
        run_id = f"run-{uuid.uuid4().hex[:8]}"
        self._state = {
            **self._idle_state(),
            "run_id": run_id,
            "status": "planning",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("Started run: %s", run_id)
        return run_id

    def set_orchestrator_plan(self, plan: dict[str, Any]) -> None:
        """Store the orchestrator's task breakdown plan."""
        self._state = {
            **self._state,
            "status": "delegating",
            "orchestrator": {
                "status": "delegating",
                "plan": plan,
            },
        }

    def register_worker(
        self, worker_id: str, agent_config: str, agent_name: str, task: str
    ) -> None:
        """Register a new worker agent."""
        workers = {
            **self._state["workers"],
            worker_id: {
                "status": "running",
                "agent_config": agent_config,
                "agent_name": agent_name,
                "task": task,
                "turns": 0,
                "progress": [],
                "files_changed": [],
                "clarification": None,
                "message": None,
                "error": None,
            },
        }
        self._state = {**self._state, "workers": workers, "status": "running"}

    def update_worker_progress(
        self, worker_id: str, progress_entry: dict[str, Any]
    ) -> None:
        """Append a progress entry to a worker."""
        worker = self._state["workers"].get(worker_id)
        if not worker:
            return
        updated = {
            **worker,
            "progress": [*worker["progress"], progress_entry],
            "turns": progress_entry.get("turn", worker["turns"]),
        }
        workers = {**self._state["workers"], worker_id: updated}
        self._state = {**self._state, "workers": workers}

    def set_worker_clarification(
        self, worker_id: str, clarification: dict[str, str] | None
    ) -> None:
        """Set or clear a worker's clarification state."""
        worker = self._state["workers"].get(worker_id)
        if not worker:
            return
        status = "clarifying" if clarification else "running"
        updated = {**worker, "status": status, "clarification": clarification}
        workers = {**self._state["workers"], worker_id: updated}
        self._state = {**self._state, "workers": workers}

    def complete_worker(
        self, worker_id: str, files_changed: list[str], message: str
    ) -> None:
        """Mark a worker as complete."""
        worker = self._state["workers"].get(worker_id)
        if not worker:
            return
        updated = {
            **worker,
            "status": "success",
            "files_changed": files_changed,
            "message": message,
        }
        workers = {**self._state["workers"], worker_id: updated}
        self._state = {**self._state, "workers": workers}
        logger.info("Worker %s completed: %s", worker_id, message)

    def fail_worker(self, worker_id: str, error: str) -> None:
        """Mark a worker as failed."""
        worker = self._state["workers"].get(worker_id)
        if not worker:
            return
        updated = {**worker, "status": "error", "error": error}
        workers = {**self._state["workers"], worker_id: updated}
        self._state = {**self._state, "workers": workers}
        logger.error("Worker %s failed: %s", worker_id, error)

    def all_workers_done(self) -> bool:
        """Check if all registered workers have finished (success or error)."""
        workers = self._state["workers"]
        if not workers:
            return False
        return all(
            w["status"] in ("success", "error") for w in workers.values()
        )

    def set_review_status(self, status: str) -> None:
        """Set the review phase status."""
        self._state = {
            **self._state,
            "status": "reviewing",
            "reviewer": {"status": status},
        }

    def set_review_result(self, result: dict[str, Any]) -> None:
        """Store the reviewer's verdict."""
        self._state = {
            **self._state,
            "reviewer": {"status": "done", "result": result},
        }

    def complete_run(self, message: str) -> None:
        """Mark the entire run as successful."""
        self._state = {
            **self._state,
            "status": "success",
            "message": message,
        }

    def fail_run(self, error: str) -> None:
        """Mark the entire run as failed."""
        self._state = {
            **self._state,
            "status": "error",
            "error": error,
        }

    def reset(self) -> None:
        """Reset to idle state."""
        self._state = self._idle_state()
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_state.py -v`
Expected: 11 passed

**Step 5: Commit**

```bash
git add proxy/agents/state.py proxy/tests/test_state.py
git commit -m "feat: add multi-agent state manager with immutable updates"
```

---

### Task 7: Move and extend tools (add `run_tests`)

**Files:**
- Create: `proxy/agents/tools.py` (moved from `proxy/agent_tools.py`, extended with `run_tests`)
- Modify: `proxy/agent_tools.py` (keep as thin re-export for backwards compat during migration)
- Create: `proxy/tests/test_tools.py`

**Step 1: Write the failing test for `run_tests`**

Create `proxy/tests/test_tools.py`:
```python
"""Tests for agent tools — specifically the new run_tests tool."""

import pytest
from unittest.mock import patch, MagicMock
from agents.tools import execute_run_tests, TOOL_DEFINITIONS


def test_run_tests_tool_in_definitions():
    """run_tests tool is included in tool definitions."""
    names = [t["name"] for t in TOOL_DEFINITIONS]
    assert "run_tests" in names


def test_execute_run_tests_returns_output():
    """run_tests executes the configured test command and returns output."""
    with patch("agents.tools.subprocess") as mock_subprocess:
        mock_result = MagicMock()
        mock_result.stdout = "1 passed"
        mock_result.stderr = ""
        mock_result.returncode = 0
        mock_subprocess.run.return_value = mock_result

        result = execute_run_tests("npm test", test_path="src/")
        assert "1 passed" in result
        assert "PASS" in result


def test_execute_run_tests_failure():
    """run_tests reports test failures."""
    with patch("agents.tools.subprocess") as mock_subprocess:
        mock_result = MagicMock()
        mock_result.stdout = "1 failed"
        mock_result.stderr = "AssertionError"
        mock_result.returncode = 1
        mock_subprocess.run.return_value = mock_result

        result = execute_run_tests("npm test")
        assert "FAIL" in result


def test_execute_run_tests_timeout():
    """run_tests handles timeouts gracefully."""
    with patch("agents.tools.subprocess") as mock_subprocess:
        import subprocess
        mock_subprocess.TimeoutExpired = subprocess.TimeoutExpired
        mock_subprocess.run.side_effect = subprocess.TimeoutExpired("npm test", 60)

        result = execute_run_tests("npm test")
        assert "timed out" in result.lower()
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_tools.py -v`
Expected: FAIL

**Step 3: Create `proxy/agents/tools.py`**

Copy the contents of `proxy/agent_tools.py` into `proxy/agents/tools.py` and add the `run_tests` tool. Key additions:

- Add `import subprocess` at top
- Add `run_tests` to `TOOL_DEFINITIONS` list
- Add `execute_run_tests()` function
- Add `run_tests` case to `execute_tool()` dispatcher
- Add `file_locks` parameter to `execute_write_file` for lock checking

The `run_tests` tool definition:
```python
{
    "name": "run_tests",
    "description": (
        "Run the test suite. Use after writing tests or implementation "
        "to verify your changes. Returns stdout, stderr, and pass/fail status."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "test_path": {
                "type": "string",
                "description": "Optional: specific test file or directory to run",
            },
        },
    },
}
```

The `execute_run_tests` function:
```python
TEST_TIMEOUT = 60  # seconds
MAX_TEST_OUTPUT = 4000  # characters

def execute_run_tests(test_command: str, test_path: str = "") -> str:
    """Run the test suite using the configured command."""
    cmd = test_command
    if test_path:
        cmd = f"{cmd} {test_path}"

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT,
            cwd=str(_get_base_dir()),
        )

        output_parts = []
        if result.stdout:
            output_parts.append(result.stdout[:MAX_TEST_OUTPUT])
        if result.stderr:
            output_parts.append(result.stderr[:MAX_TEST_OUTPUT])

        output = "\n".join(output_parts)
        status = "PASS" if result.returncode == 0 else "FAIL"
        return f"[{status}] Exit code: {result.returncode}\n{output}"

    except subprocess.TimeoutExpired:
        return f"Error: Test command timed out after {TEST_TIMEOUT}s"
    except OSError as exc:
        return f"Error running tests: {exc}"
```

**Important:** Also update `execute_tool` to accept an optional `file_locks` parameter (tuple of `(FileLockManager, worker_id)`) and check it in `execute_write_file`. This is how the lock system integrates with the existing tool dispatch.

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_tools.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add proxy/agents/tools.py proxy/tests/test_tools.py
git commit -m "feat: add agents/tools.py with run_tests tool and lock-aware write"
```

---

### Task 8: Create the worker agent runner

**Files:**
- Create: `proxy/agents/worker.py`
- Create: `proxy/tests/test_worker.py`

**Step 1: Write the failing test**

Create `proxy/tests/test_worker.py`:
```python
"""Tests for worker agent runner."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from agents.worker import WorkerAgent


@pytest.mark.asyncio
async def test_worker_initializes_with_config():
    """Worker loads config and prepares for execution."""
    config = {
        "id": "frontend-engineer",
        "name": "Frontend Engineer",
        "model": "claude-sonnet-4-5-20250929",
        "system_prompt": "You are a frontend engineer.",
        "tools": ["read_file", "write_file"],
        "test_command": "npm test",
        "max_turns": 15,
        "max_tokens": 4096,
    }
    worker = WorkerAgent(config, worker_id="fe-1")
    assert worker.worker_id == "fe-1"
    assert worker.agent_name == "Frontend Engineer"


@pytest.mark.asyncio
async def test_worker_builds_tool_list():
    """Worker filters tool definitions based on config."""
    config = {
        "id": "frontend-engineer",
        "name": "Frontend Engineer",
        "model": "claude-sonnet-4-5-20250929",
        "system_prompt": "You are a frontend engineer.",
        "tools": ["read_file", "write_file"],
        "max_turns": 15,
        "max_tokens": 4096,
    }
    worker = WorkerAgent(config, worker_id="fe-1")
    tool_names = [t["name"] for t in worker.get_tools()]
    assert "read_file" in tool_names
    assert "write_file" in tool_names
    assert "search_files" not in tool_names
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_worker.py -v`
Expected: FAIL

**Step 3: Write the worker agent implementation**

Create `proxy/agents/worker.py`:
```python
"""Generic worker agent runner.

Runs any agent config through an agentic tool-use loop with Claude API.
"""

import asyncio
import logging
import os
from typing import Any, Callable

from anthropic import AsyncAnthropic, APIError

from agents.tools import TOOL_DEFINITIONS, execute_tool, execute_run_tests
from agents.file_lock import FileLockManager

logger = logging.getLogger(__name__)


def _build_turn_summary(turn: int, assistant_content: list) -> dict[str, Any]:
    """Build a human-readable turn summary from tool calls."""
    files_read: list[str] = []
    files_written: list[str] = []

    for block in assistant_content:
        if block.type != "tool_use":
            continue
        if block.name == "read_file":
            files_read.append(block.input.get("path", "unknown"))
        elif block.name == "write_file":
            files_written.append(block.input.get("path", "unknown"))

    parts: list[str] = []
    if files_written:
        short = [p.split("/")[-1] for p in files_written]
        parts.append(f"Editing {', '.join(short)}")
    elif files_read:
        short = [p.split("/")[-1] for p in files_read]
        parts.append(f"Reading {', '.join(short)}")
    else:
        parts.append("Thinking...")

    return {
        "turn": turn,
        "summary": " | ".join(parts),
        "files_read": files_read,
        "files_written": files_written,
    }


class WorkerAgent:
    """Runs a single worker agent with a specific config."""

    def __init__(
        self,
        config: dict[str, Any],
        worker_id: str,
        lock_manager: FileLockManager | None = None,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.worker_id = worker_id
        self.agent_name = config["name"]
        self._config = config
        self._model = config.get("model", os.getenv("ANTHROPIC_AGENT_MODEL", "claude-sonnet-4-5-20250929"))
        self._system_prompt = config.get("system_prompt", "")
        self._tool_names = set(config.get("tools", []))
        self._test_command = config.get("test_command", "")
        self._max_turns = config.get("max_turns", 15)
        self._max_tokens = config.get("max_tokens", 4096)
        self._lock_manager = lock_manager
        self._on_progress = on_progress

    def get_tools(self) -> list[dict[str, Any]]:
        """Return filtered tool definitions based on config."""
        return [t for t in TOOL_DEFINITIONS if t["name"] in self._tool_names]

    async def run(self, task_description: str, context: str = "") -> dict[str, Any]:
        """Execute the agentic loop for this worker's task.

        Returns: {"status": "success"|"error", "files_changed": [...], "message": str}
        """
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return {"status": "error", "files_changed": [], "message": "ANTHROPIC_API_KEY not configured"}

        client = AsyncAnthropic(api_key=api_key)

        prompt = f"## Your Task\n\n{task_description}"
        if context:
            prompt = f"{context}\n\n{prompt}"

        messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
        tools = self.get_tools()
        write_count = 0
        files_changed: set[str] = set()

        try:
            for turn in range(self._max_turns):
                logger.info("[%s] Turn %d/%d", self.worker_id, turn + 1, self._max_turns)

                response = await client.messages.create(
                    model=self._model,
                    max_tokens=self._max_tokens,
                    system=self._system_prompt,
                    tools=tools,
                    messages=messages,
                )

                assistant_content = response.content
                messages.append({"role": "assistant", "content": assistant_content})

                # Emit progress
                summary = _build_turn_summary(turn + 1, assistant_content)
                if self._on_progress:
                    self._on_progress(summary)

                if response.stop_reason == "end_turn":
                    final_message = None
                    for block in assistant_content:
                        if hasattr(block, "text"):
                            final_message = block.text
                            break
                    return {
                        "status": "success",
                        "files_changed": sorted(files_changed),
                        "message": final_message or f"Completed in {turn + 1} turns",
                    }

                # Process tool calls
                tool_results: list[dict[str, Any]] = []
                for block in assistant_content:
                    if block.type != "tool_use":
                        continue

                    if block.name == "run_tests":
                        result_text = execute_run_tests(
                            self._test_command,
                            block.input.get("test_path", ""),
                        )
                    elif block.name == "write_file" and self._lock_manager:
                        path = block.input.get("path", "")
                        if not self._lock_manager.can_write(self.worker_id, path):
                            result_text = f"Error: File '{path}' is locked by another agent. You cannot write to it."
                        else:
                            result_text, write_count = execute_tool(
                                block.name, block.input, write_count
                            )
                            if not result_text.startswith("Error"):
                                files_changed.add(path)
                    else:
                        result_text, write_count = execute_tool(
                            block.name, block.input, write_count
                        )
                        if block.name == "write_file" and not result_text.startswith("Error"):
                            files_changed.add(block.input.get("path", ""))

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

                if not tool_results:
                    break

                messages.append({"role": "user", "content": tool_results})

            return {
                "status": "success",
                "files_changed": sorted(files_changed),
                "message": f"Completed in {self._max_turns} turns, modified {len(files_changed)} file(s)",
            }

        except APIError as exc:
            return {"status": "error", "files_changed": sorted(files_changed), "message": f"Claude API error: {exc.message}"}
        except Exception as exc:
            logger.exception("[%s] Worker failed", self.worker_id)
            return {"status": "error", "files_changed": sorted(files_changed), "message": str(exc)}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_worker.py -v`
Expected: 2 passed

**Step 5: Commit**

```bash
git add proxy/agents/worker.py proxy/tests/test_worker.py
git commit -m "feat: add generic worker agent runner with lock-aware tool dispatch"
```

---

### Task 9: Create the orchestrator

**Files:**
- Create: `proxy/agents/orchestrator.py`
- Create: `proxy/tests/test_orchestrator.py`

**Step 1: Write the failing test**

Create `proxy/tests/test_orchestrator.py`:
```python
"""Tests for orchestrator — task planning and agent delegation."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from agents.orchestrator import Orchestrator
from agents.registry import AgentRegistry
from agents.state import MultiAgentState


@pytest.fixture
def mock_registry(tmp_path):
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()

    for agent_id in ["orchestrator", "frontend-engineer", "backend-engineer", "reviewer"]:
        (prompts_dir / f"{agent_id}.md").write_text(f"You are {agent_id}.")
        config = {
            "id": agent_id,
            "name": agent_id.replace("-", " ").title(),
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": f"prompts/{agent_id}.md",
            "tools": ["read_file", "write_file"] if agent_id != "orchestrator" else [],
            "max_turns": 15,
            "max_tokens": 4096,
        }
        if agent_id == "orchestrator":
            config["delegates_to"] = ["frontend-engineer", "backend-engineer"]
            config["review_agent"] = "reviewer"
        if agent_id in ("frontend-engineer", "backend-engineer"):
            config["test_command"] = "npm test" if agent_id == "frontend-engineer" else "pytest"

        (configs_dir / f"{agent_id}.json").write_text(json.dumps(config))

    return AgentRegistry(configs_dir, prompts_dir)


def test_orchestrator_init(mock_registry):
    state = MultiAgentState()
    orch = Orchestrator(mock_registry, state)
    assert orch is not None


@pytest.mark.asyncio
async def test_orchestrator_parses_plan():
    """Orchestrator parses a valid plan from Claude response."""
    from agents.orchestrator import _parse_plan_response

    valid_plan = json.dumps({
        "tasks": [
            {"id": "t1", "agent": "frontend-engineer", "description": "Add button", "file_locks": ["src/App.tsx"], "depends_on": []}
        ],
        "execution": "parallel"
    })

    result = _parse_plan_response(valid_plan)
    assert result is not None
    assert len(result["tasks"]) == 1
    assert result["execution"] == "parallel"


@pytest.mark.asyncio
async def test_orchestrator_handles_invalid_plan():
    """Orchestrator returns None for invalid plan JSON."""
    from agents.orchestrator import _parse_plan_response

    result = _parse_plan_response("not json at all")
    assert result is None
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_orchestrator.py -v`
Expected: FAIL

**Step 3: Write orchestrator implementation**

Create `proxy/agents/orchestrator.py`:
```python
"""Orchestrator — Technical PM agent that plans and delegates work.

Analyzes VCI context, breaks into subtasks, spawns worker agents,
coordinates execution, and triggers review.
"""

import asyncio
import json
import logging
import os
from typing import Any

from anthropic import AsyncAnthropic, APIError

from agents.file_lock import FileLockManager
from agents.registry import AgentRegistry
from agents.state import MultiAgentState
from agents.worker import WorkerAgent
from formatter import (
    DEFAULT_TOKEN_BUDGET,
    format_payload,
    read_context_file,
    validate_payload,
)

logger = logging.getLogger(__name__)


def _parse_plan_response(text: str) -> dict[str, Any] | None:
    """Parse the orchestrator's JSON plan response."""
    try:
        plan = json.loads(text.strip())
    except json.JSONDecodeError:
        logger.warning("Orchestrator returned non-JSON: %s", text[:200])
        return None

    if not isinstance(plan, dict) or "tasks" not in plan:
        logger.warning("Orchestrator plan missing 'tasks' key")
        return None

    return plan


class Orchestrator:
    """Plans and delegates work to specialized worker agents."""

    def __init__(self, registry: AgentRegistry, state: MultiAgentState) -> None:
        self._registry = registry
        self._state = state
        self._lock_manager = FileLockManager()

    async def run(self, context_path: str) -> None:
        """Full orchestration: plan -> delegate -> review -> report."""
        run_id = self._state.start_run()
        logger.info("Orchestrator run started: %s", run_id)

        try:
            # 1. Read and format context
            raw_payload = read_context_file(context_path)
            payload = validate_payload(raw_payload)
            formatted_prompt = format_payload(payload, DEFAULT_TOKEN_BUDGET)

            # 2. Get orchestrator config and plan
            orch_config = self._registry.get("orchestrator")
            plan = await self._create_plan(orch_config, formatted_prompt)

            if plan is None:
                self._state.fail_run("Failed to create task plan")
                return

            self._state.set_orchestrator_plan(plan)

            # 3. Delegate to workers
            tasks = plan.get("tasks", [])
            execution = plan.get("execution", "sequential")

            if not tasks:
                self._state.fail_run("Orchestrator produced no tasks")
                return

            # Acquire file locks
            for task in tasks:
                worker_id = f"{task['agent']}-{task['id']}"
                locks = task.get("file_locks", [])
                if locks:
                    try:
                        self._lock_manager.acquire(worker_id, locks)
                    except ValueError as exc:
                        self._state.fail_run(f"Lock conflict: {exc}")
                        return

            # Spawn workers
            if execution == "parallel":
                await self._run_parallel(tasks, formatted_prompt)
            else:
                await self._run_sequential(tasks, formatted_prompt)

            # 4. Review phase
            all_files: list[str] = []
            for worker_data in self._state.snapshot()["workers"].values():
                all_files.extend(worker_data.get("files_changed", []))

            if all_files:
                await self._run_review(all_files, formatted_prompt)

            # 5. Complete
            snapshot = self._state.snapshot()
            worker_errors = [
                w for w in snapshot["workers"].values()
                if w["status"] == "error"
            ]

            if worker_errors:
                error_msgs = [w.get("error", "Unknown") for w in worker_errors]
                self._state.fail_run(f"Worker errors: {'; '.join(error_msgs)}")
            else:
                n_files = len(set(all_files))
                n_workers = len(snapshot["workers"])
                self._state.complete_run(
                    f"Completed with {n_workers} agent(s), {n_files} file(s) changed"
                )

        except (ValueError, FileNotFoundError) as exc:
            self._state.fail_run(str(exc))
            logger.error("Orchestrator config error: %s", exc)
        except APIError as exc:
            self._state.fail_run(f"Claude API error: {exc.message}")
            logger.error("Claude API error: %s", exc)
        except Exception:
            self._state.fail_run("An unexpected error occurred")
            logger.exception("Orchestrator failed")
        finally:
            self._lock_manager.release_all()

    async def _create_plan(
        self, orch_config: dict[str, Any], formatted_prompt: str
    ) -> dict[str, Any] | None:
        """Ask Claude to break down the task into subtasks."""
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        client = AsyncAnthropic(api_key=api_key)
        model = orch_config.get("model", "claude-sonnet-4-5-20250929")
        system_prompt = orch_config.get("system_prompt", "")

        response = await client.messages.create(
            model=model,
            max_tokens=orch_config.get("max_tokens", 4096),
            system=system_prompt,
            messages=[{"role": "user", "content": formatted_prompt}],
        )

        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text = block.text.strip()
                break

        return _parse_plan_response(text)

    async def _run_parallel(
        self, tasks: list[dict], context: str
    ) -> None:
        """Run multiple worker agents concurrently."""
        coros = []
        for task in tasks:
            coros.append(self._run_single_worker(task, context))
        await asyncio.gather(*coros)

    async def _run_sequential(
        self, tasks: list[dict], context: str
    ) -> None:
        """Run worker agents one at a time in dependency order."""
        for task in tasks:
            await self._run_single_worker(task, context)

    async def _run_single_worker(
        self, task: dict, context: str
    ) -> None:
        """Spawn and run a single worker agent."""
        agent_id = task["agent"]
        worker_id = f"{agent_id}-{task['id']}"

        try:
            config = self._registry.get(agent_id)
        except KeyError:
            self._state.fail_run(f"Unknown agent: {agent_id}")
            return

        self._state.register_worker(
            worker_id, agent_id, config["name"], task["description"]
        )

        def on_progress(summary: dict[str, Any]) -> None:
            self._state.update_worker_progress(worker_id, summary)

        worker = WorkerAgent(
            config,
            worker_id=worker_id,
            lock_manager=self._lock_manager,
            on_progress=on_progress,
        )

        result = await worker.run(task["description"], context)

        if result["status"] == "success":
            self._state.complete_worker(
                worker_id, result["files_changed"], result.get("message", "Done")
            )
        else:
            self._state.fail_worker(
                worker_id, result.get("message", "Unknown error")
            )

    async def _run_review(
        self, files_changed: list[str], original_context: str
    ) -> None:
        """Run the review agent on all changed files."""
        self._state.set_review_status("running")

        try:
            reviewer_config = self._registry.get("reviewer")
        except KeyError:
            logger.warning("No reviewer agent configured, skipping review")
            self._state.set_review_result({"verdict": "skipped", "issues": [], "summary": "No reviewer configured"})
            return

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            self._state.set_review_result({"verdict": "error", "issues": [], "summary": "API key not configured"})
            return

        client = AsyncAnthropic(api_key=api_key)

        review_prompt = (
            f"Review the following files that were modified:\n\n"
            f"Files changed: {', '.join(files_changed)}\n\n"
            f"Original task context:\n{original_context}\n\n"
            f"Read each changed file and provide your security and code quality review."
        )

        # Reviewer gets read-only tools
        from agents.tools import TOOL_DEFINITIONS
        review_tools = [t for t in TOOL_DEFINITIONS if t["name"] in set(reviewer_config.get("tools", []))]

        messages: list[dict[str, Any]] = [{"role": "user", "content": review_prompt}]
        max_turns = reviewer_config.get("max_turns", 5)

        try:
            for turn in range(max_turns):
                response = await client.messages.create(
                    model=reviewer_config.get("model", "claude-sonnet-4-5-20250929"),
                    max_tokens=reviewer_config.get("max_tokens", 4096),
                    system=reviewer_config.get("system_prompt", ""),
                    tools=review_tools,
                    messages=messages,
                )

                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "end_turn":
                    # Parse review result
                    for block in response.content:
                        if hasattr(block, "text"):
                            try:
                                result = json.loads(block.text.strip())
                                self._state.set_review_result(result)
                            except json.JSONDecodeError:
                                self._state.set_review_result({
                                    "verdict": "approve",
                                    "issues": [],
                                    "summary": block.text[:500],
                                })
                            break
                    return

                # Process tool calls (read-only)
                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    from agents.tools import execute_tool
                    result_text, _ = execute_tool(block.name, block.input, 0)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

                if not tool_results:
                    break
                messages.append({"role": "user", "content": tool_results})

            self._state.set_review_result({
                "verdict": "approve",
                "issues": [],
                "summary": "Review completed (max turns reached)",
            })

        except Exception as exc:
            logger.exception("Review failed")
            self._state.set_review_result({
                "verdict": "error",
                "issues": [],
                "summary": f"Review failed: {exc}",
            })
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_orchestrator.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add proxy/agents/orchestrator.py proxy/tests/test_orchestrator.py
git commit -m "feat: add orchestrator agent with plan-delegate-review pipeline"
```

---

### Task 10: Create the new agent service entry point

**Files:**
- Modify: `proxy/agent.py` — Replace single-agent service with multi-agent service that uses orchestrator
- Modify: `proxy/main.py:239-287` — Update proxy endpoints to handle multi-agent status

**Step 1: Rewrite `proxy/agent.py` to use orchestrator**

Replace the contents of `proxy/agent.py` with the new multi-agent entry point. Key changes:

- Import `Orchestrator`, `AgentRegistry`, `MultiAgentState`
- Initialize registry from `agents/configs/` and `agents/prompts/` at module level
- Create global `MultiAgentState` instance (replaces `_current_run` dict)
- `POST /agent/run` starts orchestrator run in background task
- `GET /agent/status` returns `state.snapshot()` with multi-agent data
- `GET /agent/status/{agent_id}` returns individual worker status (new endpoint)
- `POST /agent/respond` routes to correct worker (future: for now, pass through)
- Keep the same port (8001) and FastAPI app structure

The `/agent/status` response shape changes from:
```json
{"status": "running", "progress": [...], "plan": "..."}
```
to:
```json
{
  "run_id": "run-abc123",
  "status": "running",
  "orchestrator": {"status": "delegating", "plan": {...}},
  "workers": {
    "frontend-engineer-t1": {"status": "running", "agent_name": "Frontend Engineer", "task": "...", "progress": [...]},
    "backend-engineer-t2": {"status": "running", "agent_name": "Backend Engineer", "task": "...", "progress": [...]}
  },
  "reviewer": null,
  "message": null,
  "error": null
}
```

**Step 2: Update `proxy/main.py` agent proxy endpoints**

Modify `proxy/main.py:239-287` — the `agent_status()` and `agent_respond_proxy()` functions now pass through the new multi-agent response shape. The proxy just forwards whatever the agent service returns.

**Step 3: Commit**

```bash
git add proxy/agent.py proxy/main.py
git commit -m "feat: replace single-agent service with orchestrator-based multi-agent service"
```

---

## Phase 3: Frontend Multi-Agent Toast System

### Task 11: Update store types and state for multi-agent

**Files:**
- Modify: `frontend/src/stores/inspectorStore.ts:9-68` — Add multi-agent state fields and actions
- Modify: `frontend/src/types/inspector.ts` — Add multi-agent types (if needed)

**Step 1: Add multi-agent types to the store interface**

Add to `InspectorState` interface (after line 29):
```typescript
agentWorkers: Record<string, {
  agentId: string
  agentName: string
  status: 'running' | 'success' | 'error' | 'clarifying'
  progress: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  clarification: { question: string; context: string } | null
  task: string
}>
orchestratorStatus: 'idle' | 'planning' | 'delegating' | 'reviewing' | 'done' | 'error'
orchestratorPlan: Record<string, unknown> | null
```

Add corresponding actions:
```typescript
setAgentWorkers: (workers: InspectorState['agentWorkers']) => void
setOrchestratorStatus: (status: InspectorState['orchestratorStatus']) => void
setOrchestratorPlan: (plan: InspectorState['orchestratorPlan']) => void
```

**Step 2: Add initial state values and action implementations**

In the `create()` call, add:
```typescript
agentWorkers: {},
orchestratorStatus: 'idle',
orchestratorPlan: null,

setAgentWorkers: (workers) => set({ agentWorkers: workers }),
setOrchestratorStatus: (status) => set({ orchestratorStatus: status }),
setOrchestratorPlan: (plan) => set({ orchestratorPlan: plan }),
```

Update `clearAgentState` (line 349) to also clear multi-agent state:
```typescript
clearAgentState: () => set({
  agentProgress: [],
  agentClarification: null,
  agentPlan: null,
  agentWorkers: {},
  orchestratorStatus: 'idle',
  orchestratorPlan: null,
}),
```

Update `resetAll` similarly.

**Step 3: Commit**

```bash
git add frontend/src/stores/inspectorStore.ts
git commit -m "feat: add multi-agent state fields and actions to Zustand store"
```

---

### Task 12: Update polling to handle multi-agent status

**Files:**
- Modify: `frontend/src/components/PayloadPreview.tsx:11-148` — Update `AgentStatusResponse` type and `pollAgentStatus` to handle multi-agent response shape

**Step 1: Update the status response type**

Replace the `AgentStatusResponse` interface (line 11) with:
```typescript
interface WorkerStatus {
  status: 'running' | 'success' | 'error' | 'clarifying'
  agent_config: string
  agent_name: string
  task: string
  turns: number
  progress: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  clarification: { question: string; context: string } | null
  files_changed: string[]
  message: string | null
  error: string | null
}

interface AgentStatusResponse {
  // Legacy single-agent fields (backwards compat)
  status: 'idle' | 'analyzing' | 'clarifying' | 'running' | 'success' | 'error' | 'unavailable' | 'planning' | 'delegating' | 'reviewing'
  message?: string | null
  error?: string | null
  // Multi-agent fields
  run_id?: string
  orchestrator?: { status: string; plan: Record<string, unknown> } | null
  workers?: Record<string, WorkerStatus>
  reviewer?: { status: string; result?: Record<string, unknown> } | null
  // Legacy fields
  progress?: Array<{ turn: number; summary: string }>
  clarification?: { question: string; context: string } | null
  plan?: string | null
}
```

**Step 2: Update `pollAgentStatus` to detect multi-agent mode**

Inside `pollAgentStatus`, after fetching status, add multi-agent detection:
```typescript
// Multi-agent mode detection
const hasWorkers = status.workers && Object.keys(status.workers).length > 0

if (hasWorkers) {
  // Update workers state
  const workerState: Record<string, WorkerToast> = {}
  for (const [id, w] of Object.entries(status.workers!)) {
    workerState[id] = {
      agentId: id,
      agentName: w.agent_name,
      status: w.status,
      progress: w.progress || [],
      clarification: w.clarification || null,
      task: w.task,
    }
  }
  setAgentWorkers(workerState)
  setOrchestratorStatus(status.status as InspectorState['orchestratorStatus'])
  if (status.orchestrator?.plan) setOrchestratorPlan(status.orchestrator.plan)
}
```

Keep the existing single-agent logic as fallback for backwards compat.

**Step 3: Commit**

```bash
git add frontend/src/components/PayloadPreview.tsx
git commit -m "feat: update polling to handle multi-agent status response"
```

---

### Task 13: Create stacked toast component

**Files:**
- Create: `frontend/src/components/AgentToast.tsx` — Individual agent toast component
- Create: `frontend/src/components/AgentToastStack.tsx` — Stacked toast container
- Create: `frontend/src/components/AgentToast.css` — Styles for stacked toasts
- Modify: `frontend/src/components/Toast.tsx:134-215` — Integrate multi-agent toast rendering

**Step 1: Create `AgentToast.tsx`**

```typescript
import { SpinnerIcon, CheckIcon, ErrorIcon } from './Toast'  // Extract icons or duplicate
import './AgentToast.css'

interface AgentToastProps {
  agentName: string
  status: 'running' | 'success' | 'error' | 'clarifying'
  summary: string
  task: string
  onDismiss?: () => void
}

export function AgentToast({ agentName, status, summary, task, onDismiss }: AgentToastProps) {
  return (
    <div className={`agent-toast agent-toast-${status}`} role="status" aria-live="polite">
      <div className="agent-toast-header">
        <span className="agent-toast-badge">{agentName}</span>
        {status === 'running' && <SpinnerIcon />}
        {status === 'success' && <CheckIcon />}
        {status === 'error' && <ErrorIcon />}
      </div>
      <span className="agent-toast-summary">{summary || task}</span>
      {(status === 'success' || status === 'error') && onDismiss && (
        <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
```

**Step 2: Create `AgentToastStack.tsx`**

```typescript
import { useInspectorStore } from '../stores/inspectorStore'
import { AgentToast } from './AgentToast'
import './AgentToast.css'

export function AgentToastStack() {
  const agentWorkers = useInspectorStore((s) => s.agentWorkers)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const orchestratorStatus = useInspectorStore((s) => s.orchestratorStatus)

  const workers = Object.entries(agentWorkers)

  if (workers.length === 0) return null

  return (
    <div className={`agent-toast-stack ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {workers.map(([id, worker]) => {
        const latestProgress = worker.progress[worker.progress.length - 1]
        return (
          <AgentToast
            key={id}
            agentName={worker.agentName}
            status={worker.status}
            summary={latestProgress?.summary ?? ''}
            task={worker.task}
          />
        )
      })}
      {orchestratorStatus === 'reviewing' && (
        <AgentToast
          agentName="Reviewer"
          status="running"
          summary="Reviewing changes..."
          task="Security & code review"
        />
      )}
    </div>
  )
}
```

**Step 3: Create `AgentToast.css`**

```css
.agent-toast-stack {
  position: fixed;
  bottom: 5.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column-reverse;
  gap: 0.5rem;
  z-index: 10000;
  transition: right 0.3s ease;
}

.agent-toast-stack.sidebar-open {
  right: calc(360px + 1.5rem);
}

.agent-toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: var(--adom-gradient, linear-gradient(135deg, #4361EE, #7B2FF7));
  border-radius: 50px;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(67, 97, 238, 0.25);
  animation: toast-slide-in 0.3s ease-out;
  white-space: nowrap;
  max-width: 400px;
}

.agent-toast-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.agent-toast-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.125rem 0.5rem;
  border-radius: 50px;
}

.agent-toast-summary {
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-toast-success {
  background: linear-gradient(135deg, #10B981, #059669);
}

.agent-toast-error {
  background: linear-gradient(135deg, #EF4444, #DC2626);
}

@media (max-width: 768px) {
  .agent-toast-stack {
    bottom: 5rem;
    right: 1rem;
  }

  .agent-toast-stack.sidebar-open {
    right: 1rem;
    bottom: calc(70vh + 4.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-toast {
    animation: none;
  }
}
```

**Step 4: Integrate into `Toast.tsx`**

Modify `Toast.tsx` to render `AgentToastStack` when multi-agent workers are present. Add at the beginning of the `Toast` component:

```typescript
import { AgentToastStack } from './AgentToastStack'

// Inside Toast component, before other rendering:
const hasMultiAgentWorkers = useInspectorStore((s) => Object.keys(s.agentWorkers).length > 0)

if (hasMultiAgentWorkers) {
  return <AgentToastStack />
}

// ... rest of existing single-toast logic
```

**Step 5: Commit**

```bash
git add frontend/src/components/AgentToast.tsx frontend/src/components/AgentToastStack.tsx frontend/src/components/AgentToast.css frontend/src/components/Toast.tsx
git commit -m "feat: add stacked toast notifications for multi-agent progress"
```

---

## Phase 4: Integration & Wiring

### Task 14: Wire everything together and update imports

**Files:**
- Modify: `proxy/agent.py` — Final wiring with registry init, orchestrator run
- Ensure `proxy/agents/__init__.py` exports key classes
- Verify `proxy/main.py` proxy endpoints work with new response shape

**Step 1: Update `proxy/agents/__init__.py` with exports**

```python
from agents.orchestrator import Orchestrator
from agents.registry import AgentRegistry
from agents.state import MultiAgentState
from agents.worker import WorkerAgent
from agents.file_lock import FileLockManager

__all__ = [
    "Orchestrator",
    "AgentRegistry",
    "MultiAgentState",
    "WorkerAgent",
    "FileLockManager",
]
```

**Step 2: Verify agent.py uses correct imports and paths**

Ensure `agent.py` initializes the registry with correct paths:
```python
AGENTS_DIR = Path(__file__).parent / "agents"
registry = AgentRegistry(
    AGENTS_DIR / "configs",
    AGENTS_DIR / "prompts",
)
```

**Step 3: End-to-end smoke test**

Run the full test suite:
```bash
cd /Users/danielthai/Developer/visual-context-interface-app/proxy
python -m pytest tests/ -v
```
Expected: All tests pass

**Step 4: Commit**

```bash
git add proxy/agents/__init__.py proxy/agent.py
git commit -m "feat: wire multi-agent system together with registry and orchestrator"
```

---

### Task 15: Update Docker config if needed

**Files:**
- Verify: `docker-compose.yml` — No changes needed (proxy directory already mounted)
- Verify: `Dockerfile` — Ensure agents/ directory is included in the build

**Step 1: Check if Dockerfile copies agents directory**

Read the Dockerfile and ensure the `proxy/` directory copy includes `agents/`. Since `proxy/` is volume-mounted in dev mode, this is mainly for production builds.

**Step 2: Commit if changes needed**

```bash
git add docker-compose.yml Dockerfile  # only if changed
git commit -m "chore: ensure agents directory included in Docker build"
```

---

### Task 16: Final integration test

**Step 1: Run all backend tests**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/proxy
python -m pytest tests/ -v --tb=short
```

**Step 2: Run frontend type check**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/frontend
npx tsc --noEmit
```

**Step 3: Manual Docker test (if Docker available)**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app
docker-compose up --build
```

Navigate to http://localhost:5173, select an element, type an instruction, click "Send to ADOM". Verify:
- Orchestrator plans the task (check proxy logs)
- Worker agents spawn (stacked toasts appear)
- Toasts show agent names and progress
- Review runs after workers complete
- Final "All done" toast appears

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete multi-agent architecture with orchestrator, workers, and stacked toasts"
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `proxy/agents/__init__.py` | Create | Package exports |
| `proxy/agents/configs/orchestrator.json` | Create | Orchestrator config |
| `proxy/agents/configs/frontend-engineer.json` | Create | Frontend agent config |
| `proxy/agents/configs/backend-engineer.json` | Create | Backend agent config |
| `proxy/agents/configs/reviewer.json` | Create | Reviewer agent config |
| `proxy/agents/prompts/orchestrator.md` | Create | TPM system prompt |
| `proxy/agents/prompts/frontend-engineer.md` | Create | Frontend agent prompt |
| `proxy/agents/prompts/backend-engineer.md` | Create | Backend agent prompt |
| `proxy/agents/prompts/reviewer.md` | Create | Reviewer agent prompt |
| `proxy/agents/registry.py` | Create | Config loader |
| `proxy/agents/file_lock.py` | Create | File ownership manager |
| `proxy/agents/state.py` | Create | Multi-agent state tracking |
| `proxy/agents/tools.py` | Create | Extended tools with `run_tests` |
| `proxy/agents/worker.py` | Create | Generic worker runner |
| `proxy/agents/orchestrator.py` | Create | TPM orchestrator |
| `proxy/agent.py` | Modify | Replace single-agent with orchestrator entry point |
| `proxy/main.py` | Modify | Update proxy endpoints for multi-agent response |
| `proxy/tests/test_registry.py` | Create | Registry tests |
| `proxy/tests/test_file_lock.py` | Create | Lock manager tests |
| `proxy/tests/test_state.py` | Create | State manager tests |
| `proxy/tests/test_tools.py` | Create | Tools tests (run_tests) |
| `proxy/tests/test_worker.py` | Create | Worker agent tests |
| `proxy/tests/test_orchestrator.py` | Create | Orchestrator tests |
| `frontend/src/stores/inspectorStore.ts` | Modify | Add multi-agent state |
| `frontend/src/components/PayloadPreview.tsx` | Modify | Multi-agent polling |
| `frontend/src/components/Toast.tsx` | Modify | Integrate stacked toasts |
| `frontend/src/components/AgentToast.tsx` | Create | Individual agent toast |
| `frontend/src/components/AgentToastStack.tsx` | Create | Stacked toast container |
| `frontend/src/components/AgentToast.css` | Create | Toast stack styles |
