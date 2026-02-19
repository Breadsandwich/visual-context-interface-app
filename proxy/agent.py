"""Headless VCI Agent Service (multi-agent).

Runs on port 8001 (internal only). Receives trigger from proxy after
context export, initialises the orchestrator, and runs a multi-agent
plan-delegate-review pipeline in the background.
"""

import asyncio
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Response
from pydantic import BaseModel, Field

from agents.registry import AgentRegistry
from agents.state import MultiAgentState
from agents.orchestrator import Orchestrator

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VCI Agent Service")

# ── Registry & State (module-level singletons) ─────────────────────

_agents_dir = Path(__file__).parent / "agents"

_registry = AgentRegistry(
    configs_dir=_agents_dir / "configs",
    prompts_dir=_agents_dir / "prompts",
)

_state = MultiAgentState()
_agent_lock = asyncio.Lock()


# ── Pydantic Models ────────────────────────────────────────────────


class AgentTriggerRequest(BaseModel):
    context_path: str = Field(..., description="Path to context.json")


class AgentRespondRequest(BaseModel):
    response: str = Field(
        ..., min_length=1, max_length=2000,
        description="User's clarification response",
    )


# ── Helpers ────────────────────────────────────────────────────────


def _on_agent_done(task: asyncio.Task) -> None:
    """Log any unexpected exceptions from the background agent task."""
    if task.cancelled():
        logger.warning("Agent task was cancelled")
        return
    exc = task.exception()
    if exc is not None:
        logger.exception("Agent task failed unexpectedly", exc_info=exc)


# ── Endpoints ──────────────────────────────────────────────────────


@app.post("/agent/run", status_code=202)
async def trigger_agent(request_body: AgentTriggerRequest):
    """Trigger a multi-agent run.  Returns 202 immediately; work runs in background."""
    async with _agent_lock:
        state = _state.snapshot()
        if state["status"] not in ("idle", "success", "error"):
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

        _state.reset()
        orch = Orchestrator(_registry, _state)
        task = asyncio.create_task(orch.run(str(context_path)))
        task.add_done_callback(_on_agent_done)

    return {"accepted": True, "message": "Agent run started"}


@app.get("/agent/status")
async def agent_status():
    """Return current multi-agent run status."""
    return _state.snapshot()


@app.post("/agent/respond")
async def agent_respond(request_body: AgentRespondRequest):
    """Placeholder for multi-agent clarification routing (not yet implemented)."""
    return Response(
        content='{"error": "Multi-agent clarification not yet implemented"}',
        status_code=501,
        media_type="application/json",
    )
