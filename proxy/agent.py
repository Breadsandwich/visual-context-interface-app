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
from fastapi import FastAPI
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

# ─── Run State ──────────────────────────────────────────────────────

_agent_lock = asyncio.Lock()

_IDLE_STATE: dict[str, Any] = {
    "status": "idle",
    "files_changed": [],
    "message": None,
    "turns": 0,
    "timestamp": None,
    "error": None,
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
        }
        result_path = vci_dir / "agent-result.json"
        result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        logger.info("Wrote agent result to %s", result_path)
    except Exception:
        logger.exception("Failed to write agent result")


# ─── Agentic Loop ───────────────────────────────────────────────────


async def _run_agent(context_path: str) -> None:
    """Execute the agentic loop: read context → format → Claude API → tools → repeat."""
    global _current_run
    output_dir = os.getenv("VCI_OUTPUT_DIR", "/output")
    _current_run = {
        **_IDLE_STATE,
        "status": "running",
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

        # 3. Build initial messages
        messages: list[dict[str, Any]] = [
            {"role": "user", "content": formatted_prompt},
        ]

        write_count = 0
        files_changed: set[str] = set()

        # 4. Agentic loop
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

            # Collect text and tool_use blocks from response
            assistant_content = response.content
            messages.append({"role": "assistant", "content": assistant_content})

            # Check if we're done (no tool use)
            if response.stop_reason == "end_turn":
                # Extract final text message
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

                # Track changed files
                if block.name == "write_file" and not result_text.startswith("Error"):
                    files_changed.add(block.input.get("path", ""))

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result_text,
                })

            if not tool_results:
                # No tool calls and not end_turn — unexpected, break
                break

            messages.append({"role": "user", "content": tool_results})

        # 5. Finalize
        turns = _current_run["turns"]
        message = _current_run.get("message") or f"Completed in {turns} turns, modified {len(files_changed)} file(s)"
        _current_run = {
            **_current_run,
            "status": "success",
            "files_changed": sorted(files_changed),
            "message": message,
        }

        logger.info(
            "Agent completed: %d turns, %d files changed",
            turns,
            len(files_changed),
        )

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


def _on_agent_done(task: asyncio.Task) -> None:
    """Log any unexpected exceptions from the agent task."""
    try:
        task.result()
    except Exception:
        logger.exception("Agent task failed unexpectedly")


@app.post("/agent/run", status_code=202)
async def trigger_agent(request_body: AgentTriggerRequest):
    """Trigger an agent run. Returns 202 immediately; work runs in background."""
    async with _agent_lock:
        if _current_run["status"] == "running":
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
    }
