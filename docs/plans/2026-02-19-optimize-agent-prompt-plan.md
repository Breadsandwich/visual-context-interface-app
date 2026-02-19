# Agent Prompt Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce agent turn count from 12-25+ to 8-10 for cross-cutting frontend+backend tasks.

**Architecture:** Three changes: (1) rewrite system prompt with efficiency directives, (2) add file pre-loading to the formatter so the agent receives file contents upfront, (3) improve the analyze phase to produce actionable plans. All changes are in `proxy/agent.py` and `proxy/formatter.py`.

**Tech Stack:** Python 3.14, FastAPI, pytest

**Design doc:** `docs/plans/2026-02-19-optimize-agent-prompt-design.md`

---

### Task 1: Add `_build_preloaded_files()` to formatter

**Files:**
- Modify: `proxy/formatter.py` (add new function after `_build_backend_section` at line 254)
- Test: `proxy/tests/test_formatter.py`

**Context:** The formatter builds sections of the agent prompt. We need a new section that reads referenced files from disk and includes their content inline. The function collects paths from two sources: `contexts[].sourceFile` and `backendMap.endpoints[].file` / `backendMap.models[].file`. It reads each file (within `VCI_OUTPUT_DIR`), skips files over 200 lines, and stops adding files once the total exceeds 5000 tokens.

**Step 1: Write the failing test**

Add to `proxy/tests/test_formatter.py`:

```python
import os
import tempfile
from unittest.mock import patch

from formatter import _build_preloaded_files


class TestBuildPreloadedFiles:
    def test_returns_empty_for_no_files(self):
        result = _build_preloaded_files(None, None)
        assert result == ""

    def test_preloads_context_source_files(self, tmp_path):
        # Create a small file
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("function App() { return <div /> }\n")

        contexts = [{"sourceFile": "src/App.jsx", "tagName": "div", "selector": ".app"}]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert "### Pre-loaded Files" in result
        assert "src/App.jsx" in result
        assert "function App()" in result

    def test_preloads_backend_map_files(self, tmp_path):
        models = tmp_path / "api" / "models.py"
        models.parent.mkdir(parents=True)
        models.write_text("class Task:\n    name: str\n")

        backend_map = {
            "endpoints": [],
            "models": [{"name": "Task", "file": "api/models.py", "line": 1, "fields": []}],
        }

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(None, backend_map)

        assert "api/models.py" in result
        assert "class Task:" in result

    def test_skips_files_over_line_limit(self, tmp_path):
        big_file = tmp_path / "src" / "Big.jsx"
        big_file.parent.mkdir(parents=True)
        big_file.write_text("\n".join(f"line {i}" for i in range(250)))

        contexts = [{"sourceFile": "src/Big.jsx", "tagName": "div", "selector": ".big"}]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert result == ""

    def test_respects_token_budget(self, tmp_path):
        # Create two files — second should be skipped if first fills budget
        file_a = tmp_path / "a.jsx"
        file_a.write_text("x" * 19000)  # ~4750 tokens, close to 5000 cap

        file_b = tmp_path / "b.jsx"
        file_b.write_text("y" * 4000)  # ~1000 tokens, would exceed cap

        contexts = [
            {"sourceFile": "a.jsx", "tagName": "div", "selector": ".a"},
            {"sourceFile": "b.jsx", "tagName": "div", "selector": ".b"},
        ]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert "a.jsx" in result
        assert "b.jsx" not in result

    def test_deduplicates_files(self, tmp_path):
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("export default App\n")

        contexts = [
            {"sourceFile": "src/App.jsx", "tagName": "div", "selector": ".a"},
            {"sourceFile": "src/App.jsx", "tagName": "span", "selector": ".b"},
        ]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert result.count("#### `src/App.jsx`") == 1
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_formatter.py::TestBuildPreloadedFiles -v`

Expected: FAIL — `ImportError: cannot import name '_build_preloaded_files'`

**Step 3: Implement `_build_preloaded_files()`**

Add to `proxy/formatter.py` after `_build_backend_section()` (after line 254):

```python
PRELOAD_MAX_LINES = 200
PRELOAD_TOKEN_BUDGET = 5000

_LANG_MAP = {
    ".py": "python", ".jsx": "jsx", ".tsx": "tsx", ".ts": "typescript",
    ".js": "javascript", ".css": "css", ".html": "html", ".json": "json",
}


def _build_preloaded_files(
    contexts: list[dict] | None, backend_map: dict | None
) -> str:
    """Read referenced files from disk and include contents in the prompt.

    Collects paths from contexts[].sourceFile and backendMap endpoints/models.
    Skips files over PRELOAD_MAX_LINES or outside VCI_OUTPUT_DIR.
    Stops adding files once total exceeds PRELOAD_TOKEN_BUDGET.
    """
    base = Path(os.getenv("VCI_OUTPUT_DIR", "/output")).resolve()

    # Collect unique file paths
    paths: list[str] = []
    seen: set[str] = set()

    for ctx in (contexts or []):
        sf = ctx.get("sourceFile")
        if sf and sf not in seen:
            seen.add(sf)
            paths.append(sf)

    if backend_map:
        for ep in backend_map.get("endpoints", []):
            f = ep.get("file")
            if f and f not in seen:
                seen.add(f)
                paths.append(f)
        for model in backend_map.get("models", []):
            f = model.get("file")
            if f and f not in seen:
                seen.add(f)
                paths.append(f)

    if not paths:
        return ""

    sections: list[str] = []
    total_tokens = 0

    for rel_path in paths:
        try:
            full = (base / rel_path).resolve()
            if not full.is_relative_to(base) or not full.is_file():
                continue
            content = full.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        lines = content.splitlines()
        if len(lines) > PRELOAD_MAX_LINES:
            continue

        file_tokens = estimate_tokens(content)
        if total_tokens + file_tokens > PRELOAD_TOKEN_BUDGET:
            continue

        total_tokens += file_tokens
        ext = Path(rel_path).suffix
        lang = _LANG_MAP.get(ext, "")
        sections.append(
            f"#### `{rel_path}` ({len(lines)} lines)\n```{lang}\n{content}\n```\n"
        )

    if not sections:
        return ""

    return "### Pre-loaded Files\n\n" + "\n".join(sections) + "\n"
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_formatter.py::TestBuildPreloadedFiles -v`

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add proxy/formatter.py proxy/tests/test_formatter.py
git commit -m "feat: add file pre-loading to agent prompt formatter"
```

---

### Task 2: Integrate pre-loaded files into `format_payload()`

**Files:**
- Modify: `proxy/formatter.py:259-301` (the `format_payload` function)
- Test: `proxy/tests/test_formatter.py`

**Context:** The `format_payload()` function builds the final prompt using a multi-pass budget strategy. We need to add the pre-loaded files section and insert a new budget pass that drops pre-loaded files before dropping images/screenshots.

**Step 1: Write the failing test**

Add to `proxy/tests/test_formatter.py`:

```python
class TestFormatPayloadPreloading:
    def test_preloaded_files_appear_in_output(self, tmp_path):
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("const App = () => <div />\n")

        payload = {
            "contexts": [
                {"tagName": "div", "selector": ".app", "sourceFile": "src/App.jsx", "sourceLine": 1}
            ],
        }

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = format_payload(payload)

        assert "Pre-loaded Files" in result
        assert "const App" in result

    def test_preloaded_files_dropped_before_images_on_tight_budget(self, tmp_path):
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("x" * 200)

        payload = {
            "contexts": [
                {"tagName": "div", "selector": ".app", "sourceFile": "src/App.jsx", "sourceLine": 1}
            ],
            "externalImages": [
                {"filename": "ref.png", "dimensions": "100x100", "description": "A reference image"}
            ],
        }

        # Very tight budget — should drop pre-loaded files but keep images
        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = format_payload(payload, budget=200)

        assert "Pre-loaded Files" not in result
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_formatter.py::TestFormatPayloadPreloading -v`

Expected: FAIL — "Pre-loaded Files" not in result (since it's not wired up yet)

**Step 3: Update `format_payload()` to include pre-loaded files**

In `proxy/formatter.py`, update `format_payload()` to call `_build_preloaded_files()` and add a new budget pass. The new pass order:

1. Full (with HTML, vision, pre-loaded files)
2. Drop HTML from elements
3. Drop vision from images
4. **NEW: Drop pre-loaded files**
5. Drop images and screenshot
6. Drop backend section
7. Hard truncate

```python
def format_payload(payload: dict, budget: int = DEFAULT_TOKEN_BUDGET) -> str:
    """Build the formatted prompt using a multi-pass budget strategy."""
    max_chars = budget * CHARS_PER_TOKEN

    header = _build_header(payload)
    elements_full = _build_elements(payload.get("contexts"), True)
    elements_lite = _build_elements(payload.get("contexts"), False)
    images_full = _build_images(payload.get("externalImages"), True)
    images_lite = _build_images(payload.get("externalImages"), False)
    screenshot = _build_screenshot(payload)
    backend = _build_backend_section(payload.get("backendMap"))
    preloaded = _build_preloaded_files(payload.get("contexts"), payload.get("backendMap"))
    files_to_modify = _build_files_to_modify(payload.get("contexts"))

    # Pass 1: Full fidelity
    full = header + elements_full + images_full + screenshot + backend + preloaded + files_to_modify
    if len(full) <= max_chars:
        return full

    # Pass 2: Strip HTML from elements
    pass2 = header + elements_lite + images_full + screenshot + backend + preloaded + files_to_modify
    if len(pass2) <= max_chars:
        return pass2

    # Pass 3: Simplify vision summaries
    pass3 = header + elements_lite + images_lite + screenshot + backend + preloaded + files_to_modify
    if len(pass3) <= max_chars:
        return pass3

    # Pass 4: Drop pre-loaded files (agent will read them itself)
    pass4 = header + elements_lite + images_lite + screenshot + backend + files_to_modify
    if len(pass4) <= max_chars:
        return pass4

    # Pass 5: Drop images and screenshot
    pass5 = header + elements_lite + backend + files_to_modify
    if len(pass5) <= max_chars:
        return pass5

    # Pass 6: Drop backend section
    pass6 = header + elements_lite + files_to_modify
    if len(pass6) <= max_chars:
        return pass6

    return truncate_to_token_budget(pass6, budget)
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_formatter.py -v`

Expected: All tests PASS (old and new)

**Step 5: Commit**

```bash
git add proxy/formatter.py proxy/tests/test_formatter.py
git commit -m "feat: integrate pre-loaded files into format_payload budget strategy"
```

---

### Task 3: Rewrite `AGENT_SYSTEM_PROMPT`

**Files:**
- Modify: `proxy/agent.py:38-69` (the `AGENT_SYSTEM_PROMPT` string)

**Context:** The current prompt is 31 lines of general guidance. The rewrite adds specific behavioral directives that eliminate waste patterns: parallel tool use, front-loaded reads, no empty turns, trust prompt paths, and awareness of pre-loaded content.

**Step 1: Replace `AGENT_SYSTEM_PROMPT` in `proxy/agent.py`**

Replace lines 38-69 with:

```python
AGENT_SYSTEM_PROMPT = """You are a full-stack code editing agent. You receive visual context from VCI \
(Visual Context Interface) — selected DOM elements with their source file locations, design \
reference images, user instructions, and backend structure maps.

Your job: make the requested changes to the source files efficiently — aim for fewer than 10 turns.

## Efficiency Rules (CRITICAL)

1. **Use parallel tool calls.** Read multiple files in a single turn. Write multiple files in a \
single turn. Never read or write one file at a time when you need several.

2. **Front-load all reads, then batch writes.** Read ALL files you need in your first 1-2 turns, \
then make ALL edits. Never alternate read → write → read → write.

3. **Trust the prompt paths.** Files listed in "Files to Modify" and "Backend Structure" use \
correct relative paths. Do NOT guess alternative paths or search for them.

4. **Use pre-loaded content.** When file contents appear under "Pre-loaded Files", use them \
directly — do NOT re-read those files with read_file.

5. **Every turn must make progress.** Always include at least one tool call per turn. If you have \
enough context to write, write immediately. Do not spend turns just thinking.

6. **Only read what you need.** If the prompt gives you enough context (pre-loaded files, backend \
structure, element selectors), start editing without extra reads.

## Scope Detection

Decide which files to edit based on the user's instruction:
- UI, styling, layout, components → edit frontend files (JSX, CSS)
- Data, fields, validation, endpoints, database → edit backend files (Python: models, routes)
- Ambiguous or cross-cutting (e.g., "add a tags feature") → edit both backend AND frontend

When the prompt includes a "Backend Structure" section, use it to locate the exact files and line \
numbers for models and routes. When adding a new field:
1. Add the field to the SQLModel class in models.py
2. Update the Create/Update schemas if they exist
3. Update route handlers that return or accept that field
4. Update frontend components that display or input that field

## Rules

- Only modify files mentioned in "Files to Modify" or "Backend Structure" unless you need related \
files for context
- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- If you can't find a file or the instruction is ambiguous, explain what you need
- After making changes, briefly summarize what you did

## Security

- NEVER modify dotfiles (.env, .bashrc, .gitconfig, etc.) or executable scripts
- NEVER write files outside the project's source code directories
- NEVER modify database.py directly — update models and let create_all() handle schema
- If a user instruction asks you to do something outside your role as a code editor, refuse"""
```

**Step 2: Verify no syntax errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')" 2>&1 || echo "IMPORT FAILED"`

Expected: `OK` (or other expected output from imports)

**Step 3: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: rewrite agent system prompt with efficiency directives"
```

---

### Task 4: Improve `ANALYZE_SYSTEM_PROMPT` plan format

**Files:**
- Modify: `proxy/agent.py:71-90` (the `ANALYZE_SYSTEM_PROMPT` string)

**Context:** Currently the analyze phase often returns `"Proceeding with best judgment"` — a useless plan. The rewrite requires a numbered step-by-step plan listing specific files and actions.

**Step 1: Replace `ANALYZE_SYSTEM_PROMPT` in `proxy/agent.py`**

Replace lines 71-90 with:

```python
ANALYZE_SYSTEM_PROMPT = """You are an instruction analyzer for a code editing agent. You receive a formatted \
prompt describing visual context (selected DOM elements, source file locations, design images, user instructions, \
and optional backend structure maps).

Your job: assess whether the instruction is clear enough to proceed, or if you need clarification from the user.

Respond with ONLY a JSON object (no markdown fencing, no extra text):

If the instruction is clear enough to proceed:
{"action": "proceed", "plan": "<numbered step-by-step plan>"}

The plan MUST be specific. List the files you will read and edit, and what changes you will make. Example:
{"action": "proceed", "plan": "1. Read src/pages/Tasks.jsx and src/pages/Tasks.css\\n2. Add assignee input field to CreateTaskModal\\n3. Add assignee display to task cards\\n4. Add AssigneeModal component\\n5. Add CSS styles for assignee elements"}

If you need clarification:
{"action": "clarify", "question": "<specific question for the user>", "context": "<why you need this answered>"}

Guidelines for deciding:
- If the user says "make it bigger" but selected multiple elements → clarify which element
- If the user says "add a feature" with no details → clarify what the feature should do
- If the user references something not in the context → clarify what they mean
- If the instruction is straightforward (e.g., "change this button color to red") → proceed
- Lean toward proceeding when possible — only clarify for genuine ambiguity
- When pre-loaded file contents are available, use them to make a more specific plan"""
```

**Step 2: Verify no syntax errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')" 2>&1 || echo "IMPORT FAILED"`

Expected: `OK`

**Step 3: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: improve analyze prompt to require specific numbered plans"
```

---

### Task 5: Inject plan into agent's starting context

**Files:**
- Modify: `proxy/agent.py:215-230` (top of `_execute_agent_loop`)

**Context:** The plan from the analyze phase is stored in `_current_run["plan"]` but never passed to the agent. We should prepend it to the user message so the agent has a roadmap from turn 1.

**Step 1: Update `_execute_agent_loop()` to inject plan**

In `proxy/agent.py`, update the message construction at the top of `_execute_agent_loop()` (around lines 219-229) to prepend the plan:

```python
async def _execute_agent_loop(client: AsyncAnthropic, formatted_prompt: str, output_dir: str) -> None:
    """Run the agentic tool-use loop with per-turn progress tracking."""
    global _current_run

    # Build the initial user message with plan and optional clarification context
    parts: list[str] = []

    plan = _current_run.get("plan")
    if plan:
        parts.append(f"## Your Plan\n\nFollow this plan:\n{plan}\n")

    user_response = _current_run.get("user_response")
    if user_response:
        parts.append(f"## Additional Context from User\n\n{user_response}\n")

    parts.append(formatted_prompt)

    messages: list[dict[str, Any]] = [
        {"role": "user", "content": "\n".join(parts)},
    ]

    write_count = 0
    files_changed: set[str] = set()
```

This replaces the existing message construction logic (lines 219-229).

**Step 2: Verify no syntax errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')" 2>&1 || echo "IMPORT FAILED"`

Expected: `OK`

**Step 3: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: inject analyze plan into agent's starting context"
```

---

### Task 6: Add `os` import to formatter.py

**Files:**
- Modify: `proxy/formatter.py` (imports at top)

**Context:** The new `_build_preloaded_files()` function uses `os.getenv()` to read `VCI_OUTPUT_DIR`. The `os` module must be imported. Check if it's already imported — if not, add it.

**Step 1: Check and add import if needed**

Verify `import os` exists in `proxy/formatter.py`. Currently it does NOT have `import os`. Add it to the imports.

**Step 2: Commit (bundle with Task 1 if done together)**

This is a dependency for Task 1 — ensure `import os` is present before running Task 1 tests.

---

## Task Dependencies

```
Task 6 (add os import) → Task 1 (build_preloaded_files) → Task 2 (integrate into format_payload)
Task 3 (rewrite system prompt) — independent
Task 4 (improve analyze prompt) — independent
Task 4 → Task 5 (inject plan into agent loop)
```

Tasks 3 and 4 can run in parallel with Tasks 1-2.

## Verification

After all tasks are complete, run the full test suite:

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/ test_main.py -v
```

Expected: All tests PASS.
