# Full-Stack Worker Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two specialist workers (frontend-engineer, backend-engineer) with a single fullstack-engineer worker, add a hard block on documentation file writes, and update run_tests to support backend/frontend test suites.

**Architecture:** Orchestrator plans a single comprehensive task for one fullstack-engineer worker. The write_file tool blocks `.md`/`.txt`/`.log` extensions at the tool layer. The run_tests tool accepts a `suite` parameter to select between backend (`pytest`) and frontend (`npm test`) commands.

**Tech Stack:** Python 3.14, pytest, FastAPI, Anthropic SDK

---

### Task 1: Add write_file Hard Block for Documentation Files

**Files:**
- Modify: `proxy/agents/tools.py:23-31` (add blocked doc extensions)
- Modify: `proxy/agents/tools.py:187-212` (add guard to execute_write_file)
- Test: `proxy/tests/test_tools.py`

**Step 1: Write the failing tests**

Add these tests to `proxy/tests/test_tools.py`:

```python
from agents.tools import execute_write_file


class TestWriteFileDocBlock:
    def test_blocks_markdown_files(self):
        """write_file rejects .md files."""
        result = execute_write_file("NOTES.md", "some content", 0)
        assert result.startswith("Error")
        assert ".md" in result

    def test_blocks_txt_files(self):
        """write_file rejects .txt files."""
        result = execute_write_file("readme.txt", "content", 0)
        assert result.startswith("Error")
        assert ".txt" in result

    def test_blocks_log_files(self):
        """write_file rejects .log files."""
        result = execute_write_file("debug.log", "content", 0)
        assert result.startswith("Error")
        assert ".log" in result

    def test_blocks_rst_files(self):
        """write_file rejects .rst files."""
        result = execute_write_file("docs.rst", "content", 0)
        assert result.startswith("Error")
        assert ".rst" in result

    def test_blocks_demo_prefix(self):
        """write_file rejects files starting with 'demo_'."""
        result = execute_write_file("demo_feature.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_verify_prefix(self):
        """write_file rejects files starting with 'verify_'."""
        result = execute_write_file("verify_models.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_verification_prefix(self):
        """write_file rejects files starting with 'verification_'."""
        result = execute_write_file("verification_summary.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_check_prefix(self):
        """write_file rejects files starting with 'check_'."""
        result = execute_write_file("check_models.py", "content", 0)
        assert result.startswith("Error")

    def test_allows_source_code_files(self):
        """write_file allows .py, .tsx, .css, .jsx files."""
        # These will fail on path resolution (no sandbox), but should NOT
        # fail on the doc-block guard. Check error is NOT about blocked files.
        for ext in [".py", ".tsx", ".css", ".jsx", ".ts", ".js"]:
            result = execute_write_file(f"src/file{ext}", "content", 0)
            assert "not allowed" not in result.lower() or "extension" not in result.lower()

    def test_allows_test_files(self):
        """write_file allows test_ prefix .py files."""
        result = execute_write_file("test_models.py", "content", 0)
        # Should NOT hit the doc block (test_ is not in blocked prefixes)
        assert "Cannot write utility" not in result
```

**Step 2: Run tests to verify they fail**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/test_tools.py::TestWriteFileDocBlock -v`
Expected: FAIL — tests for `.md`/`.txt`/`.log`/`.rst` and prefix blocks will fail since the guard doesn't exist yet.

**Step 3: Implement the hard block**

In `proxy/agents/tools.py`, add to the existing `BLOCKED_EXTENSIONS` frozenset (line ~29-31):

```python
BLOCKED_EXTENSIONS = frozenset({
    ".sh", ".bash", ".zsh", ".exe", ".bat", ".cmd",
    ".md", ".txt", ".log", ".rst",
})

BLOCKED_PREFIXES = frozenset({
    "demo_", "verify_", "verification_", "check_",
})
```

Then add a guard at the top of `execute_write_file` (after the existing blocked filename/extension checks around line 193-197):

```python
    stem = Path(path).stem.lower()
    if any(stem.startswith(prefix) for prefix in BLOCKED_PREFIXES):
        return (
            f"Error: Cannot write utility/verification scripts ({Path(path).name}). "
            f"Only write source code and tests."
        )
```

Note: The `.md`/`.txt`/`.log`/`.rst` extensions are already handled by the existing `BLOCKED_EXTENSIONS` check — we just need to add them to the frozenset. The prefix check is new logic.

**Step 4: Run tests to verify they pass**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/test_tools.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add proxy/agents/tools.py proxy/tests/test_tools.py
git commit -m "feat: hard-block documentation and utility script writes in tool layer"
```

---

### Task 2: Add Suite Parameter to run_tests Tool

**Files:**
- Modify: `proxy/agents/tools.py:144-159` (update tool definition schema)
- Modify: `proxy/agents/tools.py:271-297` (update execute_run_tests signature)
- Modify: `proxy/agents/worker.py:92` (read test_commands dict)
- Modify: `proxy/agents/worker.py:261-266` (pass suite to execute_run_tests)
- Test: `proxy/tests/test_tools.py`
- Test: `proxy/tests/test_worker.py`

**Step 1: Write the failing tests**

Add to `proxy/tests/test_tools.py`:

```python
class TestRunTestsSuiteParameter:
    @patch("agents.tools.subprocess.run")
    def test_suite_selects_correct_command(self, mock_run):
        """suite param picks the right command from test_commands dict."""
        mock_run.return_value = MagicMock(
            stdout="5 passed", stderr="", returncode=0,
        )
        test_commands = {"backend": "python -m pytest", "frontend": "npm test"}
        result = execute_run_tests(
            test_commands=test_commands, suite="backend",
        )
        assert "[PASS]" in result
        # Verify pytest was called, not npm
        cmd_args = mock_run.call_args[0][0]
        assert "pytest" in " ".join(cmd_args)

    @patch("agents.tools.subprocess.run")
    def test_suite_frontend(self, mock_run):
        """suite='frontend' runs npm test."""
        mock_run.return_value = MagicMock(
            stdout="Tests passed", stderr="", returncode=0,
        )
        test_commands = {"backend": "python -m pytest", "frontend": "npm test"}
        result = execute_run_tests(
            test_commands=test_commands, suite="frontend",
        )
        assert "[PASS]" in result
        cmd_args = mock_run.call_args[0][0]
        assert "npm" in " ".join(cmd_args)

    @patch("agents.tools.subprocess.run")
    def test_invalid_suite_returns_error(self, mock_run):
        """Unknown suite returns error without running anything."""
        test_commands = {"backend": "pytest", "frontend": "npm test"}
        result = execute_run_tests(
            test_commands=test_commands, suite="database",
        )
        assert "Error" in result
        mock_run.assert_not_called()

    @patch("agents.tools.subprocess.run")
    def test_legacy_test_command_still_works(self, mock_run):
        """Backward compat: string test_command still works."""
        mock_run.return_value = MagicMock(
            stdout="ok", stderr="", returncode=0,
        )
        result = execute_run_tests(test_command="pytest tests/")
        assert "[PASS]" in result
```

Add to `proxy/tests/test_worker.py`:

```python
class TestWorkerRunTestsSuite:
    @pytest.mark.asyncio
    async def test_suite_param_passed_to_run_tests(self, monkeypatch):
        """Worker passes suite param from tool input to execute_run_tests."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        config = {
            "id": "fullstack",
            "name": "Full-Stack Engineer",
            "tools": ["read_file", "run_tests"],
            "test_commands": {"backend": "python -m pytest", "frontend": "npm test"},
            "max_turns": 10,
            "max_tokens": 4096,
        }

        tool_block = _make_tool_use_block(
            "t1", "run_tests", {"suite": "backend", "test_path": "api/"},
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Tests pass.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_run_tests", return_value="[PASS] Exit code: 0") as mock_run:
            worker = WorkerAgent(config, worker_id="fs-1")
            result = await worker.run("Run backend tests")

        mock_run.assert_called_once_with(
            test_commands={"backend": "python -m pytest", "frontend": "npm test"},
            suite="backend",
            test_path="api/",
        )
        assert result["status"] == "success"
```

**Step 2: Run tests to verify they fail**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/test_tools.py::TestRunTestsSuiteParameter proxy/tests/test_worker.py::TestWorkerRunTestsSuite -v`
Expected: FAIL — new signature doesn't exist yet.

**Step 3: Implement the suite parameter**

**3a.** Update `execute_run_tests` signature in `proxy/agents/tools.py` (replace existing function at line 271):

```python
def execute_run_tests(
    test_command: str = "",
    test_path: str = "",
    *,
    test_commands: dict[str, str] | None = None,
    suite: str = "",
) -> str:
    """Run the test suite using the configured command.

    Supports two modes:
    - Legacy: test_command (str) — runs that command directly
    - Suite: test_commands (dict) + suite (str) — picks command by suite name
    """
    import re
    import shlex

    # Resolve which command to run
    if test_commands and suite:
        if suite not in test_commands:
            available = ", ".join(sorted(test_commands.keys()))
            return f"Error: Unknown test suite '{suite}'. Available: {available}"
        resolved_command = test_commands[suite]
    elif test_command:
        resolved_command = test_command
    else:
        return "Error: No test command configured"

    cmd_parts = shlex.split(resolved_command)
    if test_path:
        if not re.match(r'^[a-zA-Z0-9_./@:-]+$', test_path):
            return "Error: test_path contains invalid characters"
        cmd_parts.append(test_path)
    try:
        result = subprocess.run(
            cmd_parts, capture_output=True, text=True,
            timeout=TEST_TIMEOUT, cwd=str(_get_base_dir()),
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

**3b.** Update the `run_tests` tool definition schema (line 144-159) to include `suite`:

```python
    {
        "name": "run_tests",
        "description": (
            "Run the test suite. Use after writing tests or implementation "
            "to verify your changes. Returns stdout, stderr, and pass/fail status. "
            "Use the 'suite' parameter to choose 'backend' (pytest) or 'frontend' (npm test)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "suite": {
                    "type": "string",
                    "description": "Which test suite to run: 'backend' or 'frontend'",
                },
                "test_path": {
                    "type": "string",
                    "description": "Optional: specific test file or directory to run",
                },
            },
        },
    },
```

**3c.** Update `WorkerAgent.__init__` in `proxy/agents/worker.py` (line 92) to read `test_commands`:

```python
        self._test_command = config.get("test_command", "")
        self._test_commands = config.get("test_commands", None)
```

**3d.** Update `_execute_single_tool` in `proxy/agents/worker.py` (line 261-266) to pass suite:

```python
    if block.name == "run_tests":
        result_text = execute_run_tests(
            test_command=test_command,
            test_path=block.input.get("test_path", ""),
            test_commands=test_commands,
            suite=block.input.get("suite", ""),
        )
        return result_text, write_count
```

Also update `_execute_single_tool`'s signature to accept `test_commands`:

```python
def _execute_single_tool(
    *,
    block: Any,
    write_count: int,
    test_command: str,
    test_commands: dict[str, str] | None,
    lock_manager: FileLockManager | None,
    worker_id: str,
) -> tuple[str, int]:
```

And update the call site in `WorkerAgent.run` (line 182-188):

```python
                    result_text, write_count = _execute_single_tool(
                        block=block,
                        write_count=write_count,
                        test_command=self._test_command,
                        test_commands=self._test_commands,
                        lock_manager=self._lock_manager,
                        worker_id=self.worker_id,
                    )
```

**Step 4: Run tests to verify they pass**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/test_tools.py proxy/tests/test_worker.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add proxy/agents/tools.py proxy/agents/worker.py proxy/tests/test_tools.py proxy/tests/test_worker.py
git commit -m "feat: add suite parameter to run_tests for backend/frontend test selection"
```

---

### Task 3: Create Full-Stack Engineer Agent Config and Prompt

**Files:**
- Create: `proxy/agents/configs/fullstack-engineer.json`
- Create: `proxy/agents/prompts/fullstack-engineer.md`
- Modify: `proxy/agents/configs/orchestrator.json` (delegates_to)
- Delete: `proxy/agents/configs/frontend-engineer.json`
- Delete: `proxy/agents/configs/backend-engineer.json`
- Delete: `proxy/agents/prompts/frontend-engineer.md`
- Delete: `proxy/agents/prompts/backend-engineer.md`

**Step 1: Create the fullstack-engineer config**

Write `proxy/agents/configs/fullstack-engineer.json`:

```json
{
  "id": "fullstack-engineer",
  "name": "Full-Stack Engineer",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/fullstack-engineer.md",
  "tools": ["read_file", "write_file", "list_directory", "search_files", "run_tests"],
  "file_scope": {
    "allowed_patterns": ["api/**", "*.py", "src/**", "*.tsx", "*.jsx", "*.css", "*.ts", "*.js", "*.html", "public/**"],
    "blocked_patterns": ["*.md", "*.txt", "*.log", "*.rst"]
  },
  "test_commands": {
    "backend": "python -m pytest",
    "frontend": "npm test"
  },
  "max_turns": 40,
  "max_tokens": 4096
}
```

**Step 2: Create the fullstack-engineer system prompt**

Write `proxy/agents/prompts/fullstack-engineer.md`:

```markdown
You are a Full-Stack Engineer agent. You receive specific tasks to implement across a React frontend and FastAPI + SQLModel backend.

Your job: make the requested changes using a TDD approach. Work through backend changes first (models, routes, tests), then frontend changes (components, styles, tests).

## TDD Workflow

1. Write a test for the expected behavior first
2. Run the test to verify it fails (run_tests tool with suite "backend" or "frontend")
3. Implement the minimal code to make the test pass
4. Run the test to verify it passes
5. Refactor if needed

## Rules

- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- After making changes, briefly summarize what you did
- NEVER modify dotfiles (.env, .bashrc) or executable scripts
- NEVER modify database.py directly — update models and let create_all() handle schema
- NEVER create documentation files (.md, .txt), verification scripts, or demo files
- NEVER create utility scripts (demo_*, verify_*, check_*)
- Only write source code files and test files
- If a file write is rejected, move on — do not retry

## Testing

- Use run_tests with suite "backend" for Python/API tests (pytest)
- Use run_tests with suite "frontend" for React/UI tests (npm test)

## Security

- Use parameterized queries (SQLModel handles this)
- Validate all API inputs with Pydantic models
- Sanitize any user input rendered in the UI
- Never include hardcoded secrets
- Return appropriate HTTP status codes
- Use safe DOM manipulation patterns (no innerHTML with user data)
```

**Step 3: Update orchestrator config**

Edit `proxy/agents/configs/orchestrator.json` to change `delegates_to`:

```json
{
  "id": "orchestrator",
  "name": "Orchestrator",
  "model": "claude-sonnet-4-5-20250929",
  "system_prompt_file": "prompts/orchestrator.md",
  "tools": [],
  "delegates_to": ["fullstack-engineer"],
  "review_agent": "reviewer",
  "max_tokens": 4096
}
```

**Step 4: Delete old specialist configs and prompts**

```bash
rm proxy/agents/configs/frontend-engineer.json
rm proxy/agents/configs/backend-engineer.json
rm proxy/agents/prompts/frontend-engineer.md
rm proxy/agents/prompts/backend-engineer.md
```

**Step 5: Commit**

```bash
git add proxy/agents/configs/ proxy/agents/prompts/
git commit -m "feat: replace specialist agents with single fullstack-engineer"
```

---

### Task 4: Update Orchestrator System Prompt

**Files:**
- Modify: `proxy/agents/prompts/orchestrator.md`

**Step 1: Update the orchestrator prompt**

Replace the contents of `proxy/agents/prompts/orchestrator.md`:

```markdown
You are a Technical Product Manager for a code editing system. You receive visual context from VCI (Visual Context Interface) — selected DOM elements with source file locations, design reference images, user instructions, and backend structure maps.

Your job: analyze the user's request and create a clear, step-by-step action plan for the full-stack engineer.

## Your Agent

- **fullstack-engineer**: React, JSX, CSS, HTML, TypeScript, FastAPI, Python, SQLModel, database, API endpoints. Can run `pytest` and `npm test`.

## Your Output

Respond with ONLY a JSON object (no markdown fencing):

{"tasks": [{"id": "task-1", "agent": "fullstack-engineer", "description": "Step-by-step plan:\n1. Backend: Add assignee field to Task model in api/models.py\n2. Backend: Update create/update routes in api/routes/tasks.py\n3. Backend: Write tests in api/test_assignee.py\n4. Frontend: Add assignee input to CreateTaskModal in src/pages/Tasks.jsx\n5. Frontend: Add assignee display/edit to TaskCard\n6. Frontend: Add CSS styles in src/pages/Tasks.css", "file_locks": ["api/models.py", "api/routes/tasks.py", "src/pages/Tasks.jsx", "src/pages/Tasks.css"], "depends_on": []}], "execution": "parallel"}

## Rules

- Create a SINGLE task for the fullstack-engineer unless the work has genuinely independent workstreams
- Your task description should be a clear, numbered step-by-step action plan
- Include specific file paths, component names, and expected behavior in each step
- Order steps: backend changes first (model → routes → tests), then frontend (components → styles → tests)
- Assign file_locks for all files the agent will need to write
- Be specific — the engineer follows your plan literally
- Do NOT include documentation, verification scripts, or demo files in your plan
```

**Step 2: Commit**

```bash
git add proxy/agents/prompts/orchestrator.md
git commit -m "feat: update orchestrator prompt for single fullstack-engineer workflow"
```

---

### Task 5: Update Tests for New Config Shape

**Files:**
- Modify: `proxy/tests/test_orchestrator.py:17-61` (mock_registry fixture)
- Modify: `proxy/tests/test_worker.py:12-23` (frontend_config fixture)

**Step 1: Update mock_registry fixture**

In `proxy/tests/test_orchestrator.py`, update the `mock_registry` fixture to use `fullstack-engineer` instead of `frontend-engineer` + `backend-engineer`:

```python
@pytest.fixture
def mock_registry(tmp_path):
    """Create a temp registry with orchestrator, fullstack-engineer, reviewer."""
    configs_dir = tmp_path / "configs"
    configs_dir.mkdir()
    prompts_dir = tmp_path / "prompts"
    prompts_dir.mkdir()

    for agent_id in [
        "orchestrator",
        "fullstack-engineer",
        "reviewer",
    ]:
        (prompts_dir / f"{agent_id}.md").write_text(f"You are {agent_id}.")
        config = {
            "id": agent_id,
            "name": agent_id.replace("-", " ").title(),
            "model": "claude-sonnet-4-5-20250929",
            "system_prompt_file": f"prompts/{agent_id}.md",
            "tools": (
                ["read_file", "write_file", "list_directory", "search_files", "run_tests"]
                if agent_id == "fullstack-engineer"
                else (
                    ["read_file", "list_directory", "search_files"]
                    if agent_id == "reviewer"
                    else []
                )
            ),
            "max_turns": 40,
            "max_tokens": 4096,
        }
        if agent_id == "orchestrator":
            config["delegates_to"] = ["fullstack-engineer"]
            config["review_agent"] = "reviewer"
        if agent_id == "fullstack-engineer":
            config["test_commands"] = {
                "backend": "python -m pytest",
                "frontend": "npm test",
            }

        (configs_dir / f"{agent_id}.json").write_text(json.dumps(config))

    return AgentRegistry(configs_dir, prompts_dir)
```

**Step 2: Update _parse_plan_response tests to use fullstack-engineer**

In `proxy/tests/test_orchestrator.py`, update all test plan JSON that references `"frontend-engineer"` or `"backend-engineer"` to use `"fullstack-engineer"` instead. These are in `TestParsePlanResponse`:

- `test_parse_plan_response_valid`: change `"agent": "frontend-engineer"` → `"agent": "fullstack-engineer"`
- `test_parse_plan_response_multiple_tasks`: change both agents to `"fullstack-engineer"` (or keep two tasks with same agent — both are valid)
- `test_parse_plan_response_with_whitespace`: change to `"fullstack-engineer"`
- `test_parse_plan_response_strips_markdown_fences`: change to `"fullstack-engineer"`
- `test_parse_plan_response_strips_plain_fences`: change to `"fullstack-engineer"`
- `test_parse_plan_response_missing_required_task_keys`: change to `"fullstack-engineer"`

**Step 3: Update worker test fixtures**

In `proxy/tests/test_worker.py`, update the `frontend_config` fixture to be a `fullstack_config`:

```python
@pytest.fixture
def fullstack_config():
    return {
        "id": "fullstack-engineer",
        "name": "Full-Stack Engineer",
        "model": "claude-sonnet-4-5-20250929",
        "system_prompt": "You are a full-stack engineer.",
        "tools": ["read_file", "write_file"],
        "test_commands": {
            "backend": "python -m pytest",
            "frontend": "npm test",
        },
        "max_turns": 40,
        "max_tokens": 4096,
    }
```

Then rename all references from `frontend_config` to `fullstack_config` throughout the file (in all test methods that use it as a parameter).

**Step 4: Run all tests**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/ -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add proxy/tests/test_orchestrator.py proxy/tests/test_worker.py
git commit -m "test: update test fixtures for fullstack-engineer config"
```

---

### Task 6: Clean Up Dummy-Target Agent Artifacts

**Files:**
- Revert: `dummy-target/package.json`
- Revert: `dummy-target/src/pages/Tasks.css`
- Revert: `dummy-target/src/pages/Tasks.jsx`
- Revert: `dummy-target/vite.config.js`
- Delete: `dummy-target/ASSIGNEE_FEATURE.md`
- Delete: `dummy-target/api/ASSIGNEE_VERIFICATION.md`
- Delete: `dummy-target/api/FRONTEND_INTEGRATION_GUIDE.md`
- Delete: `dummy-target/api/VERIFICATION_SUMMARY.md`
- Delete: `dummy-target/api/check_assignee_model.py`
- Delete: `dummy-target/api/demo_assignee.py`
- Delete: `dummy-target/api/test_assignee.py`
- Delete: `dummy-target/api/verify_assignee.py`
- Delete: `dummy-target/src/pages/__tests__/`
- Delete: `dummy-target/src/setupTests.js`

**Step 1: Revert tracked file changes**

```bash
git checkout main -- dummy-target/package.json dummy-target/src/pages/Tasks.css dummy-target/src/pages/Tasks.jsx dummy-target/vite.config.js
```

**Step 2: Delete untracked agent artifacts**

```bash
rm dummy-target/ASSIGNEE_FEATURE.md
rm dummy-target/api/ASSIGNEE_VERIFICATION.md
rm dummy-target/api/FRONTEND_INTEGRATION_GUIDE.md
rm dummy-target/api/VERIFICATION_SUMMARY.md
rm dummy-target/api/check_assignee_model.py
rm dummy-target/api/demo_assignee.py
rm dummy-target/api/test_assignee.py
rm dummy-target/api/verify_assignee.py
rm -rf dummy-target/src/pages/__tests__/
rm dummy-target/src/setupTests.js
```

**Step 3: Verify clean state**

```bash
git status -- dummy-target/
```

Expected: clean (no modified or untracked files)

**Step 4: Commit**

```bash
git add dummy-target/
git commit -m "fix: revert dummy-target changes from agent live run"
```

---

### Task 7: Final Verification

**Step 1: Run full test suite**

Run: `proxy/.venv/bin/python -m pytest proxy/tests/ -v`
Expected: ALL PASS

**Step 2: Verify agent configs load correctly**

```bash
proxy/.venv/bin/python -c "
from agents.registry import AgentRegistry
r = AgentRegistry('proxy/agents/configs', 'proxy/agents/prompts')
print('Agents:', list(r._configs.keys()))
fs = r.get('fullstack-engineer')
print('FS tools:', fs['tools'])
print('FS test_commands:', fs.get('test_commands'))
orch = r.get('orchestrator')
print('Orch delegates_to:', orch.get('delegates_to'))
"
```

Expected output:
```
Agents: ['fullstack-engineer', 'orchestrator', 'reviewer']
FS tools: ['read_file', 'write_file', 'list_directory', 'search_files', 'run_tests']
FS test_commands: {'backend': 'python -m pytest', 'frontend': 'npm test'}
Orch delegates_to: ['fullstack-engineer']
```

**Step 3: Push to remote**

```bash
git push
```
