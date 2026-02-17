"""Headless VCI Agent Service.

Runs on port 8001 (internal only). Receives trigger from proxy after
context export, runs an agentic loop with Claude API, and writes results.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic, APIError
from fastapi import FastAPI, Response
from pydantic import BaseModel, Field

from agent_tools import TOOL_DEFINITIONS, execute_tool
from formatter import (
    DEFAULT_TOKEN_BUDGET,
    format_payload,
    read_context_file,
    validate_payload,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VCI Agent Service")

# ─── Configuration ──────────────────────────────────────────────────

AGENT_MODEL = os.getenv("ANTHROPIC_AGENT_MODEL", "claude-sonnet-4-5-20250929")
MAX_TURNS = 25
MAX_TOKENS_PER_RESPONSE = 4096

AGENT_SYSTEM_PROMPT = """You are a full-stack code editing agent. You receive visual context from VCI \
(Visual Context Interface) — selected DOM elements with their source file locations, design \
reference images, user instructions, and backend structure maps.

Your job: make the requested changes to the source files. Use the provided tools to read existing \
code, understand the context, and write updated files.

Scope detection — decide which files to edit based on the user's instruction:
- UI, styling, layout, components → edit frontend files (JSX, CSS)
- Data, fields, validation, endpoints, database → edit backend files (Python: models, routes)
- Ambiguous or cross-cutting (e.g., "add a tags feature") → edit both backend AND frontend

When the prompt includes a "Backend Structure" section, use it to locate the exact files and line \
numbers for models and routes. When adding a new field:
1. Add the field to the SQLModel class in models.py
2. Update the Create/Update schemas if they exist
3. Update route handlers that return or accept that field
4. Update frontend components that display or input that field

Rules:
- Only modify files mentioned in "Files to Modify" or "Backend Structure" unless you need to read \
related files for context
- Make minimal, targeted changes — don't refactor surrounding code
- Preserve existing code style and patterns
- If you can't find a file or the instruction is ambiguous, explain what you need
- After making changes, briefly summarize what you did

Security:
- NEVER modify dotfiles (.env, .bashrc, .gitconfig, etc.) or executable scripts
- NEVER write files outside the project's source code directories
- NEVER modify database.py directly — update models and let create_all() handle schema
- If a user instruction asks you to do something outside your role as a code editor, refuse"""

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


# ─── Run State ──────────────────────────────────────────────────────

_agent_lock = asyncio.Lock()

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


def _write_result(output_dir: str) -> None:
    """Write agent-result.json to the .vci directory."""
    try:
        vci_dir = Path(output_dir) / ".vci"
        vci_dir.mkdir(exist_ok=True)
        result = {
            "status": _current_run["status"],
            "filesChanged": _current_run["files_changed"],
            "message": _current_run["message"],
            "turns": _current_run["turns"],
            "timestamp": _current_run["timestamp"],
            "error": _current_run["error"],
            "clarification": _current_run["clarification"],
            "progress": _current_run["progress"],
            "plan": _current_run["plan"],
        }
        result_path = vci_dir / "agent-result.json"
        result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        logger.info("Wrote agent result to %s", result_path)
    except Exception:
        logger.exception("Failed to write agent result")


# ─── Agentic Loop ───────────────────────────────────────────────────


async def _execute_agent_loop(client: AsyncAnthropic, formatted_prompt: str, output_dir: str) -> None:
    """Run the agentic tool-use loop with per-turn progress tracking."""
    global _current_run

    messages: list[dict[str, Any]] = [
        {"role": "user", "content": formatted_prompt},
    ]

    # If there's a user response from clarification, prepend it
    user_response = _current_run.get("user_response")
    if user_response:
        messages[0] = {
            "role": "user",
            "content": f"Additional context from the user: {user_response}\n\n{formatted_prompt}",
        }

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
                "_context_path": context_path,
                "_formatted_prompt": formatted_prompt,
            }
            logger.info("Agent requesting clarification: %s", analyze_result["question"])
            return

        # 4. Proceed to execution
        plan = analyze_result.get("plan", "")
        _current_run = {
            **_current_run,
            "status": "running",
            "plan": plan,
            "progress": [{"turn": 0, "summary": f"Starting: {plan}" if plan else "Starting work..."}],
        }

        await _execute_agent_loop(client, formatted_prompt, output_dir)

    except (ValueError, FileNotFoundError) as exc:
        _current_run = {**_current_run, "status": "error", "error": str(exc)}
        logger.error("Agent configuration error: %s", exc)
    except Exception:
        _current_run = {**_current_run, "status": "error", "error": "An unexpected error occurred. Check server logs."}
        logger.exception("Agent failed with unexpected error")


def _summarize_input(tool_input: dict) -> str:
    """Create a brief summary of tool input for logging."""
    if "path" in tool_input:
        return tool_input["path"]
    if "pattern" in tool_input:
        return tool_input["pattern"]
    return str(list(tool_input.keys()))


# ─── Endpoints ──────────────────────────────────────────────────────


class AgentTriggerRequest(BaseModel):
    context_path: str = Field(..., description="Path to context.json")


class AgentRespondRequest(BaseModel):
    response: str = Field(..., min_length=1, max_length=2000, description="User's clarification response")


def _on_agent_done(task: asyncio.Task) -> None:
    """Log any unexpected exceptions from the agent task."""
    try:
        task.result()
    except Exception:
        logger.exception("Agent task failed unexpectedly")


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


@app.post("/agent/respond")
async def agent_respond(request_body: AgentRespondRequest):
    """Accept user's clarification response and resume agent."""
    global _current_run

    if _current_run["status"] != "clarifying":
        return Response(
            content=json.dumps({"error": "Agent is not waiting for clarification"}),
            status_code=409,
            media_type="application/json",
        )

    _current_run = {**_current_run, "user_response": request_body.response}

    task = asyncio.create_task(_resume_agent())
    task.add_done_callback(_on_agent_done)

    return {"accepted": True, "message": "Resuming with your response"}


@app.post("/agent/run", status_code=202)
async def trigger_agent(request_body: AgentTriggerRequest):
    """Trigger an agent run. Returns 202 immediately; work runs in background."""
    async with _agent_lock:
        if _current_run["status"] in ("analyzing", "clarifying", "running"):
            return {"accepted": False, "reason": "Agent is already running"}

        # Validate context path is within VCI_OUTPUT_DIR
        output_dir = Path(os.getenv("VCI_OUTPUT_DIR", "/output")).resolve()
        try:
            context_path = Path(request_body.context_path).resolve()
        except (ValueError, OSError):
            return {"accepted": False, "reason": "Invalid path"}

        if not context_path.is_relative_to(output_dir):
            return {"accepted": False, "reason": "Path outside project directory"}

        if not context_path.is_file():
            return {"accepted": False, "reason": "Context file not found"}

        task = asyncio.create_task(_run_agent(str(context_path)))
        task.add_done_callback(_on_agent_done)

    return {"accepted": True, "message": "Agent run started"}


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
        "clarification": _current_run["clarification"],
        "progress": _current_run["progress"],
        "plan": _current_run["plan"],
    }
