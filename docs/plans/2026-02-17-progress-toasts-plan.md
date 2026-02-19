# Progress Toasts & Interactive Clarification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-turn progress toast notifications during agent runs and interactive clarification toasts that ask the user for input before the agent starts work.

**Architecture:** Two-phase agent (analyze → execute) with expanded state machine (idle → analyzing → clarifying → running → success/error). Backend builds turn summaries from tool calls. Frontend polls and renders three toast modes: progress spinner, clarification input, completion.

**Tech Stack:** FastAPI (Python), React + TypeScript + Zustand (frontend), Anthropic Claude API, inline SVG icons (no emojis).

---

### Task 1: Expand agent state machine and add analyze phase

**Files:**
- Modify: `proxy/agent.py:75-84` (expand `_IDLE_STATE` and `_current_run`)
- Modify: `proxy/agent.py:38-69` (add `ANALYZE_SYSTEM_PROMPT` after `AGENT_SYSTEM_PROMPT`)
- Modify: `proxy/agent.py:110-227` (update `_run_agent` to call analyze first)

**Step 1: Expand `_IDLE_STATE` with new fields**

Replace `proxy/agent.py:75-84`:

```python
_IDLE_STATE: dict[str, Any] = {
    "status": "idle",
    "files_changed": [],
    "message": None,
    "turns": 0,
    "timestamp": None,
    "error": None,
    "clarification": None,
    "user_response": None,
    "progress": [],
    "plan": None,
}

_current_run: dict[str, Any] = {**_IDLE_STATE}
```

**Step 2: Add analyze system prompt**

Insert after `AGENT_SYSTEM_PROMPT` (after line 69), before `# ─── Run State`:

```python
ANALYZE_SYSTEM_PROMPT = """You are an instruction analyzer for a code editing agent. You receive a formatted \
prompt describing visual context (selected DOM elements, source file locations, design images, user instructions, \
and optional backend structure maps).

Your job: assess whether the instruction is clear enough to proceed, or if you need clarification from the user.

Respond with ONLY a JSON object (no markdown fencing, no extra text):

If the instruction is clear enough to proceed:
{"action": "proceed", "plan": "<1-2 sentence summary of what you will do>"}

If you need clarification:
{"action": "clarify", "question": "<specific question for the user>", "context": "<why you need this answered>"}

Guidelines for deciding:
- If the user says "make it bigger" but selected multiple elements → clarify which element
- If the user says "add a feature" with no details → clarify what the feature should do
- If the user references something not in the context → clarify what they mean
- If the instruction is straightforward (e.g., "change this button color to red") → proceed
- Lean toward proceeding when possible — only clarify for genuine ambiguity"""
```

**Step 3: Add `_run_analyze` function**

Insert after the new `ANALYZE_SYSTEM_PROMPT`, before `_agent_lock`:

```python
async def _run_analyze(client: AsyncAnthropic, formatted_prompt: str) -> dict[str, str]:
    """Single Claude call to assess ambiguity. Returns action dict."""
    response = await client.messages.create(
        model=AGENT_MODEL,
        max_tokens=512,
        system=ANALYZE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": formatted_prompt}],
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text = block.text.strip()
            break

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        # If Claude doesn't return valid JSON, default to proceed
        logger.warning("Analyze phase returned non-JSON: %s", text[:200])
        return {"action": "proceed", "plan": "Proceeding with best judgment"}

    action = result.get("action", "proceed")
    if action == "clarify":
        return {
            "action": "clarify",
            "question": result.get("question", "Could you provide more details?"),
            "context": result.get("context", ""),
        }
    return {"action": "proceed", "plan": result.get("plan", "")}
```

**Step 4: Update `_run_agent` to include analyze phase**

Replace the beginning of `_run_agent` (lines 110-127) — the function signature stays the same, but the body changes:

```python
async def _run_agent(context_path: str) -> None:
    """Execute the agentic loop: read context → analyze → maybe clarify → Claude API → tools → repeat."""
    global _current_run
    output_dir = os.getenv("VCI_OUTPUT_DIR", "/output")
    _current_run = {
        **_IDLE_STATE,
        "status": "analyzing",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        # 1. Read and format context
        raw_payload = read_context_file(context_path)
        payload = validate_payload(raw_payload)
        formatted_prompt = format_payload(payload, DEFAULT_TOKEN_BUDGET)

        logger.info("Agent triggered — formatted prompt: %d chars", len(formatted_prompt))

        # 2. Initialize async Claude client
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        client = AsyncAnthropic(api_key=api_key)

        # 3. Analyze phase — check for ambiguity
        analyze_result = await _run_analyze(client, formatted_prompt)

        if analyze_result["action"] == "clarify":
            _current_run = {
                **_current_run,
                "status": "clarifying",
                "clarification": {
                    "question": analyze_result["question"],
                    "context": analyze_result.get("context", ""),
                },
            }
            # Store context_path and client info for resume
            _current_run["_context_path"] = context_path
            _current_run["_formatted_prompt"] = formatted_prompt
            logger.info("Agent requesting clarification: %s", analyze_result["question"])
            return  # Wait for user response via /agent/respond

        # 4. Proceed to execution
        plan = analyze_result.get("plan", "")
        _current_run = {
            **_current_run,
            "status": "running",
            "plan": plan,
            "progress": [{"turn": 0, "summary": f"Starting: {plan}" if plan else "Starting work..."}],
        }

        await _execute_agent_loop(client, formatted_prompt, output_dir)
```

Note: The existing agentic loop (lines 136-214) will be extracted into `_execute_agent_loop` in Task 2.

**Step 5: Run the agent service to verify it starts**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')"`
Expected: OK (no import errors)

**Step 6: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: expand agent state machine with analyze phase and clarification support"
```

---

### Task 2: Extract agentic loop and add turn summary builder

**Files:**
- Modify: `proxy/agent.py` (extract `_execute_agent_loop`, add `_build_turn_summary`)

**Step 1: Add `_build_turn_summary` function**

Insert after `_run_analyze`, before `_agent_lock`:

```python
def _build_turn_summary(turn: int, assistant_content: list, tool_results: list[dict], files_changed: set[str]) -> dict[str, Any]:
    """Build a human-readable turn summary from tool calls and results."""
    files_read: list[str] = []
    files_written: list[str] = []
    searches: list[str] = []

    for block in assistant_content:
        if block.type != "tool_use":
            continue
        name = block.name
        inp = block.input
        if name == "read_file":
            files_read.append(inp.get("path", "unknown"))
        elif name == "write_file":
            path = inp.get("path", "unknown")
            files_written.append(path)
        elif name in ("search_files", "list_files"):
            pattern = inp.get("pattern", inp.get("path", ""))
            searches.append(pattern)

    # Build summary text
    parts: list[str] = []
    if files_written:
        short_paths = [p.split("/")[-1] for p in files_written]
        parts.append(f"Editing {', '.join(short_paths)}")
    elif files_read:
        short_paths = [p.split("/")[-1] for p in files_read]
        parts.append(f"Reading {', '.join(short_paths)}")
    elif searches:
        parts.append(f"Searching: {searches[0]}")
    else:
        parts.append("Thinking...")

    return {
        "turn": turn,
        "summary": " | ".join(parts),
        "files_read": files_read,
        "files_written": files_written,
    }
```

**Step 2: Extract `_execute_agent_loop` from `_run_agent`**

Add this new function (extracted from the old loop in `_run_agent`), and integrate turn summaries:

```python
async def _execute_agent_loop(client: AsyncAnthropic, formatted_prompt: str, output_dir: str) -> None:
    """Run the agentic tool-use loop with per-turn progress tracking."""
    global _current_run

    messages: list[dict[str, Any]] = [
        {"role": "user", "content": formatted_prompt},
    ]

    # If there's a user response from clarification, prepend it
    user_response = _current_run.get("user_response")
    if user_response:
        messages[0]["content"] = (
            f"Additional context from the user: {user_response}\n\n{formatted_prompt}"
        )

    write_count = 0
    files_changed: set[str] = set()

    try:
        for turn in range(MAX_TURNS):
            _current_run = {**_current_run, "turns": turn + 1}

            logger.info("Agent turn %d/%d", turn + 1, MAX_TURNS)

            response = await client.messages.create(
                model=AGENT_MODEL,
                max_tokens=MAX_TOKENS_PER_RESPONSE,
                system=AGENT_SYSTEM_PROMPT,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})

            if response.stop_reason == "end_turn":
                final_message = None
                for block in assistant_content:
                    if hasattr(block, "text"):
                        final_message = block.text
                        break
                _current_run = {**_current_run, "message": final_message}
                break

            # Process tool calls
            tool_results: list[dict[str, Any]] = []
            for block in assistant_content:
                if block.type != "tool_use":
                    continue

                logger.info("Tool call: %s(%s)", block.name, _summarize_input(block.input))

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

            # Build and append turn summary
            summary = _build_turn_summary(turn + 1, assistant_content, tool_results, files_changed)
            progress = [*_current_run.get("progress", []), summary]
            _current_run = {
                **_current_run,
                "files_changed": sorted(files_changed),
                "progress": progress,
            }

            if not tool_results:
                break

            messages.append({"role": "user", "content": tool_results})

        # Finalize
        turns = _current_run["turns"]
        message = _current_run.get("message") or f"Completed in {turns} turns, modified {len(files_changed)} file(s)"
        _current_run = {
            **_current_run,
            "status": "success",
            "files_changed": sorted(files_changed),
            "message": message,
        }

        logger.info("Agent completed: %d turns, %d files changed", turns, len(files_changed))

    except (ValueError, FileNotFoundError) as exc:
        _current_run = {**_current_run, "status": "error", "error": str(exc)}
        logger.error("Agent configuration error: %s", exc)
    except APIError as exc:
        _current_run = {**_current_run, "status": "error", "error": f"Claude API error: {exc.message}"}
        logger.error("Claude API error: %s", exc)
    except Exception:
        _current_run = {**_current_run, "status": "error", "error": "An unexpected error occurred. Check server logs."}
        logger.exception("Agent failed with unexpected error")
    finally:
        _write_result(output_dir)
```

**Step 3: Update `_run_agent` to use `_execute_agent_loop`**

The `_run_agent` function (from Task 1, Step 4) should end with:

```python
        await _execute_agent_loop(client, formatted_prompt, output_dir)

    except (ValueError, FileNotFoundError) as exc:
        _current_run = {**_current_run, "status": "error", "error": str(exc)}
        logger.error("Agent configuration error: %s", exc)
    except APIError as exc:
        _current_run = {**_current_run, "status": "error", "error": f"Claude API error: {exc.message}"}
        logger.error("Claude API error: %s", exc)
    except Exception:
        _current_run = {**_current_run, "status": "error", "error": "An unexpected error occurred. Check server logs."}
        logger.exception("Agent failed with unexpected error")
```

Note: `_run_agent` catches config errors (no API key, bad context path). `_execute_agent_loop` catches API/runtime errors and always writes result.

**Step 4: Verify import**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')"`
Expected: OK

**Step 5: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: extract agentic loop and add per-turn summary builder"
```

---

### Task 3: Add clarification endpoint and resume logic

**Files:**
- Modify: `proxy/agent.py:240-289` (add `/agent/respond` endpoint, update `/agent/status`)

**Step 1: Add `AgentRespondRequest` model and `_resume_agent` function**

After `_on_agent_done` (line 251), add:

```python
class AgentRespondRequest(BaseModel):
    response: str = Field(..., min_length=1, max_length=2000, description="User's clarification response")


async def _resume_agent() -> None:
    """Resume agent after user responds to clarification."""
    global _current_run
    output_dir = os.getenv("VCI_OUTPUT_DIR", "/output")

    context_path = _current_run.get("_context_path")
    formatted_prompt = _current_run.get("_formatted_prompt")

    if not context_path or not formatted_prompt:
        _current_run = {**_current_run, "status": "error", "error": "Missing context for resume"}
        return

    _current_run = {
        **_current_run,
        "status": "running",
        "clarification": None,
        "progress": [{"turn": 0, "summary": "Starting work with your clarification..."}],
    }

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        client = AsyncAnthropic(api_key=api_key)
        await _execute_agent_loop(client, formatted_prompt, output_dir)
    except Exception:
        _current_run = {**_current_run, "status": "error", "error": "Resume failed unexpectedly"}
        logger.exception("Resume agent failed")
        _write_result(output_dir)
```

**Step 2: Add POST /agent/respond endpoint**

After the `_resume_agent` function:

```python
@app.post("/agent/respond")
async def agent_respond(request_body: AgentRespondRequest):
    """Accept user's clarification response and resume agent."""
    if _current_run["status"] != "clarifying":
        return Response(
            content=json.dumps({"error": "Agent is not waiting for clarification"}),
            status_code=409,
            media_type="application/json",
        )

    global _current_run
    _current_run = {**_current_run, "user_response": request_body.response}

    task = asyncio.create_task(_resume_agent())
    task.add_done_callback(_on_agent_done)

    return {"accepted": True, "message": "Resuming with your response"}
```

**Step 3: Update GET /agent/status to include new fields**

Replace the existing `agent_status` endpoint (lines 279-289):

```python
@app.get("/agent/status")
async def agent_status():
    """Return current agent run status."""
    return {
        "status": _current_run["status"],
        "filesChanged": _current_run["files_changed"],
        "message": _current_run["message"],
        "turns": _current_run["turns"],
        "timestamp": _current_run["timestamp"],
        "error": _current_run["error"],
        "clarification": _current_run.get("clarification"),
        "progress": _current_run.get("progress", []),
        "plan": _current_run.get("plan"),
    }
```

**Step 4: Verify import**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; print('OK')"`
Expected: OK

**Step 5: Commit**

```bash
git add proxy/agent.py
git commit -m "feat: add /agent/respond endpoint and resume logic for clarification"
```

---

### Task 4: Add proxy endpoint for /api/agent-respond

**Files:**
- Modify: `proxy/main.py:239-253` (add `/api/agent-respond` proxy, update `/api/agent-status` response)

**Step 1: Update `/api/agent-status` to pass through new fields**

Replace `agent_status` in `proxy/main.py` (lines 239-253):

```python
@app.get("/api/agent-status")
async def agent_status():
    """Proxy agent status from internal agent service (sanitized)."""
    try:
        async with httpx.AsyncClient() as http:
            resp = await http.get("http://localhost:8001/agent/status", timeout=2.0)
            data = resp.json()
            return {
                "status": data.get("status", "unknown"),
                "filesChanged": data.get("filesChanged", []),
                "message": data.get("message"),
                "turns": data.get("turns", 0),
                "clarification": data.get("clarification"),
                "progress": data.get("progress", []),
                "plan": data.get("plan"),
            }
    except Exception:
        return {"status": "unavailable"}
```

**Step 2: Add POST /api/agent-respond proxy endpoint**

Insert after the updated `agent_status` function:

```python
class AgentRespondProxyRequest(BaseModel):
    response: str = Field(..., min_length=1, max_length=2000)


@app.post("/api/agent-respond")
async def agent_respond_proxy(request_body: AgentRespondProxyRequest):
    """Proxy clarification response to internal agent service."""
    try:
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                "http://localhost:8001/agent/respond",
                json={"response": request_body.response},
                timeout=5.0,
            )
            return resp.json()
    except httpx.ConnectError:
        return Response(
            content=json_module.dumps({"error": "Agent service unavailable"}),
            status_code=503,
            media_type="application/json",
        )
    except Exception:
        logger.exception("Agent respond proxy failed")
        return Response(
            content=json_module.dumps({"error": "Failed to send response"}),
            status_code=500,
            media_type="application/json",
        )
```

**Step 3: Verify import**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import main; print('OK')"`
Expected: OK

**Step 4: Commit**

```bash
git add proxy/main.py
git commit -m "feat: add /api/agent-respond proxy and expand agent-status response"
```

---

### Task 5: Add agent progress and clarification state to store

**Files:**
- Modify: `frontend/src/stores/inspectorStore.ts:9-60` (add new state fields and actions)

**Step 1: Add new types and state fields**

Add to the `InspectorState` interface (after `iframeReloadTrigger: number` at line 27):

```typescript
  agentProgress: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  agentClarification: { question: string; context: string } | null
  agentPlan: string | null
```

Add new actions (after `toggleSidebar: () => void` at line 59):

```typescript
  setAgentProgress: (progress: InspectorState['agentProgress']) => void
  setAgentClarification: (clarification: InspectorState['agentClarification']) => void
  setAgentPlan: (plan: string | null) => void
  submitClarification: (response: string) => Promise<void>
  clearAgentState: () => void
```

**Step 2: Add initial state values**

In the `create` call, after `iframeReloadTrigger: 0` (line 79):

```typescript
  agentProgress: [],
  agentClarification: null,
  agentPlan: null,
```

**Step 3: Add action implementations**

After `toggleSidebar` (line 311):

```typescript
  setAgentProgress: (progress) => set({ agentProgress: progress }),

  setAgentClarification: (clarification) => set({ agentClarification: clarification }),

  setAgentPlan: (plan) => set({ agentPlan: plan }),

  submitClarification: async (response) => {
    try {
      const resp = await fetch('/api/agent-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!resp.ok) {
        const data = await resp.json()
        get().showToast(data.error ?? 'Failed to send response')
      }
    } catch {
      get().showToast('Failed to send response')
    }
  },

  clearAgentState: () => set({
    agentProgress: [],
    agentClarification: null,
    agentPlan: null,
  }),
```

**Step 4: Update `resetAll` to clear agent state**

In the `resetAll` action (around line 290), add to the returned object:

```typescript
    agentProgress: [],
    agentClarification: null,
    agentPlan: null,
```

**Step 5: Verify no TypeScript errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 6: Commit**

```bash
git add frontend/src/stores/inspectorStore.ts
git commit -m "feat: add agent progress, clarification, and plan state to store"
```

---

### Task 6: Update Toast component with three visual modes

**Files:**
- Modify: `frontend/src/components/Toast.tsx:1-53` (three modes: progress, clarification, completion)
- Modify: `frontend/src/components/Toast.css:1-94` (input field, buttons, turn counter styles)

**Step 1: Rewrite Toast.tsx with three modes**

Replace `frontend/src/components/Toast.tsx` entirely:

```tsx
import { useState, useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import './Toast.css'

function useWidgetWidth(): number | null {
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const widget = document.querySelector('.floating-widget')
    if (!widget) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(widget)
    setWidth(widget.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  return width
}

function SpinnerIcon() {
  return (
    <svg className="toast-icon toast-icon-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M6 6a2 2 0 1 1 2.5 1.94c-.36.12-.5.36-.5.73V9.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="#fff" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" />
      <path d="M10 6L6 10M6 6l4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ClarificationToast({ question, onSubmit, onSkip }: {
  question: string
  onSubmit: (response: string) => void
  onSkip: () => void
}) {
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    await onSubmit(input.trim())
    setSubmitting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="toast-clarification">
      <div className="toast-clarification-header">
        <QuestionIcon />
        <span className="toast-clarification-label">Clarification needed</span>
      </div>
      <p className="toast-clarification-question">{question}</p>
      <div className="toast-clarification-input-row">
        <input
          type="text"
          className="toast-clarification-input"
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          autoFocus
        />
        <button
          className="toast-clarification-submit"
          onClick={handleSubmit}
          disabled={!input.trim() || submitting}
        >
          Send
        </button>
        <button
          className="toast-clarification-skip"
          onClick={onSkip}
          disabled={submitting}
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function ProgressToast({ summary, turn, maxTurns }: {
  summary: string
  turn: number
  maxTurns: number
}) {
  return (
    <div className="toast-progress-content">
      <SpinnerIcon />
      <span className="toast-message">{summary}</span>
      <span className="toast-turn-counter">Turn {turn}/{maxTurns}</span>
    </div>
  )
}

export function Toast() {
  const toastMessage = useInspectorStore((s) => s.toastMessage)
  const isToastPersistent = useInspectorStore((s) => s.isToastPersistent)
  const isSidebarOpen = useInspectorStore((s) => s.isSidebarOpen)
  const agentClarification = useInspectorStore((s) => s.agentClarification)
  const agentProgress = useInspectorStore((s) => s.agentProgress)
  const widgetWidth = useWidgetWidth()

  const { submitClarification, showPersistentToast, dismissToast } = useInspectorStore.getState()

  // Clarification mode
  if (agentClarification) {
    const style = widgetWidth
      ? { maxWidth: `${Math.round(widgetWidth * 1.6)}px`, minWidth: '320px' }
      : { minWidth: '320px' }

    return (
      <div
        className={`toast toast-expanded ${isSidebarOpen ? 'sidebar-open' : ''}`}
        role="dialog"
        aria-label="Agent clarification"
        style={style}
      >
        <ClarificationToast
          question={agentClarification.question}
          onSubmit={async (response) => {
            await submitClarification(response)
          }}
          onSkip={async () => {
            await submitClarification('Proceed with your best judgment')
          }}
        />
      </div>
    )
  }

  // Progress mode (persistent toast with progress data)
  if (isToastPersistent && agentProgress.length > 0) {
    const latest = agentProgress[agentProgress.length - 1]
    const style = widgetWidth
      ? { maxWidth: `${Math.round(widgetWidth * 1.33)}px` }
      : undefined

    return (
      <div
        className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`}
        role="status"
        aria-live="polite"
        style={style}
      >
        <ProgressToast
          summary={latest.summary}
          turn={latest.turn || agentProgress.length}
          maxTurns={25}
        />
      </div>
    )
  }

  // Completion/standard mode (existing behavior)
  if (!toastMessage) return null

  const style = widgetWidth
    ? { maxWidth: `${Math.round(widgetWidth * 1.33)}px` }
    : undefined

  return (
    <div className={`toast ${isSidebarOpen ? 'sidebar-open' : ''}`} role="status" aria-live="polite" style={style}>
      {isToastPersistent && <SpinnerIcon />}
      {!isToastPersistent && toastMessage === 'Work done' && <CheckIcon />}
      {!isToastPersistent && toastMessage?.startsWith('Agent error') && <ErrorIcon />}
      <span className="toast-message">{toastMessage}</span>
      {!isToastPersistent && (
        <button
          className="toast-close"
          onClick={() => dismissToast()}
          aria-label="Dismiss notification"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
```

**Step 2: Update Toast.css with new styles**

Append to `frontend/src/components/Toast.css` (after line 93):

```css
/* ─── Progress mode ─── */

.toast-icon {
  flex-shrink: 0;
}

.toast-icon-spin {
  animation: toast-spin 0.8s linear infinite;
}

.toast-progress-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toast-turn-counter {
  font-size: 0.7rem;
  opacity: 0.7;
  white-space: nowrap;
  margin-left: auto;
}

/* ─── Clarification mode ─── */

.toast-expanded {
  border-radius: 12px;
  padding: 0.875rem 1rem;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}

.toast-clarification {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.toast-clarification-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toast-clarification-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.85;
}

.toast-clarification-question {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.4;
}

.toast-clarification-input-row {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.toast-clarification-input {
  flex: 1;
  padding: 0.375rem 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.8125rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.toast-clarification-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.toast-clarification-input:focus {
  border-color: rgba(255, 255, 255, 0.6);
}

.toast-clarification-submit,
.toast-clarification-skip {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.toast-clarification-submit {
  background: rgba(255, 255, 255, 0.9);
  color: #4361EE;
}

.toast-clarification-submit:hover:not(:disabled) {
  background: #fff;
}

.toast-clarification-skip {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.toast-clarification-skip:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

.toast-clarification-submit:disabled,
.toast-clarification-skip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 3: Remove old `.toast-spinner` rule (replaced by SVG icon)**

The old `.toast-spinner` CSS rule (lines 35-43) can be left — the class is no longer used by the component, but removing it is optional cleanup. The new SVG-based spinner uses `.toast-icon-spin` which reuses the existing `@keyframes toast-spin`.

**Step 4: Verify no TypeScript errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/components/Toast.tsx frontend/src/components/Toast.css
git commit -m "feat: toast component with progress, clarification, and completion modes (SVG icons)"
```

---

### Task 7: Update PayloadPreview polling for new statuses

**Files:**
- Modify: `frontend/src/components/PayloadPreview.tsx:9-89` (handle analyzing, clarifying, running with progress)

**Step 1: Update `AgentStatusResponse` interface**

Replace lines 9-14:

```typescript
interface AgentStatusResponse {
  status: 'idle' | 'analyzing' | 'clarifying' | 'running' | 'success' | 'error' | 'unavailable'
  filesChanged?: string[]
  message?: string | null
  error?: string | null
  clarification?: { question: string; context: string } | null
  progress?: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  plan?: string | null
}
```

**Step 2: Update the store destructuring**

Replace line 36:

```typescript
  const { generatePayload, selectedElements, screenshotData, userPrompt, uploadedImages, showToast, showPersistentToast, reloadIframe, setAgentProgress, setAgentClarification, setAgentPlan, clearAgentState, dismissToast } = useInspectorStore()
```

**Step 3: Update `pollAgentStatus` to handle new statuses**

Replace the `pollAgentStatus` function (lines 47-89):

```typescript
  const pollAgentStatus = async () => {
    if (abortRef.current && !abortRef.current.signal.aborted) return

    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    try {
      for (let attempt = 0; attempt < AGENT_POLL_MAX_ATTEMPTS; attempt++) {
        await delay(AGENT_POLL_INTERVAL, signal)

        const status = await fetchAgentStatus()

        if (signal.aborted) return

        if (status.status === 'unavailable') {
          return
        }

        if (status.status === 'success') {
          clearAgentState()
          dismissToast()
          showToast('Work done')
          reloadIframe()
          return
        }

        if (status.status === 'error') {
          clearAgentState()
          dismissToast()
          showToast(`Agent error: ${status.error ?? 'Unknown error'}`)
          return
        }

        if (status.status === 'analyzing') {
          showPersistentToast('Analyzing your request...')
          continue
        }

        if (status.status === 'clarifying' && status.clarification) {
          dismissToast()
          setAgentClarification(status.clarification)
          if (status.plan) setAgentPlan(status.plan)
          // Keep polling — the user will respond via the toast, which sends
          // POST /api/agent-respond. The backend will transition to 'running'.
          continue
        }

        if (status.status === 'running') {
          // Clear clarification state if we've moved past it
          setAgentClarification(null)

          if (status.progress && status.progress.length > 0) {
            setAgentProgress(status.progress)
            if (status.plan) setAgentPlan(status.plan)
          } else {
            showPersistentToast('Working...')
          }
          continue
        }

        // idle or unknown — agent might have finished between polls
        if (status.status === 'idle') {
          return
        }
      }

      clearAgentState()
      showToast('Agent is still running — check back later')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    } finally {
      abortRef.current = null
    }
  }
```

**Step 4: Update cleanup in useEffect**

Update the existing cleanup (lines 39-43) to also clear agent state:

```typescript
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      clearAgentState()
    }
  }, [clearAgentState])
```

**Step 5: Verify no TypeScript errors**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/components/PayloadPreview.tsx
git commit -m "feat: update polling to handle analyzing, clarifying, and progress statuses"
```

---

### Task 8: E2E verification and cleanup

**Files:**
- Read: All modified files for final review
- Test: Manual verification of the full flow

**Step 1: Verify Python backend imports cleanly**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -c "import agent; import main; print('All imports OK')"`
Expected: `All imports OK`

**Step 2: Verify frontend builds**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No new errors

**Step 3: Review agent.py state transitions**

Verify these state transitions are correct:
- `idle` → `analyzing` (on trigger)
- `analyzing` → `clarifying` (if ambiguous)
- `analyzing` → `running` (if clear)
- `clarifying` → `running` (on user response via /agent/respond)
- `running` → `success` (on completion)
- `running` → `error` (on failure)
- Any → `error` (on unexpected exception)

**Step 4: Review Toast.tsx rendering logic**

Verify:
- `agentClarification` set → renders ClarificationToast (dialog with question, input, Send/Skip)
- `isToastPersistent && agentProgress.length > 0` → renders ProgressToast (spinner + summary + turn counter)
- `toastMessage && !isToastPersistent` → renders standard toast with close button
- `toastMessage === 'Work done'` → shows CheckIcon SVG
- `toastMessage?.startsWith('Agent error')` → shows ErrorIcon SVG
- No emojis anywhere in the component

**Step 5: Review PayloadPreview.tsx polling**

Verify:
- `analyzing` → shows persistent toast "Analyzing your request..."
- `clarifying` → sets agentClarification in store (Toast picks it up)
- `running` → updates agentProgress array, clears clarification
- `success` → clears agent state, shows "Work done" toast, reloads iframe
- `error` → clears agent state, shows error toast

**Step 6: Clean up any unused imports or dead code**

Check that:
- Old `.toast-spinner` CSS class is no longer referenced (can remove if desired)
- No `console.log` statements in new code
- All new SVG icons use `fill="none"` and `stroke="#fff"` consistently

**Step 7: Commit final cleanup if any**

```bash
git add -A
git commit -m "chore: cleanup unused spinner class and verify E2E flow"
```
