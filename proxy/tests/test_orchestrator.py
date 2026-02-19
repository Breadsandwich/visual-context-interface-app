"""Tests for orchestrator -- task planning and agent delegation."""

import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from agents.orchestrator import Orchestrator, _parse_plan_response
from agents.registry import AgentRegistry
from agents.state import MultiAgentState


# ── Fixtures ────────────────────────────────────────────────────────


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


# ── Orchestrator.__init__ ──────────────────────────────────────────


class TestOrchestratorInit:
    def test_orchestrator_init(self, mock_registry):
        """Creates orchestrator with mock registry and state."""
        state = MultiAgentState()
        orch = Orchestrator(mock_registry, state)
        assert orch is not None
        assert orch._registry is mock_registry
        assert orch._state is state
        assert orch._lock_manager is not None


# ── _parse_plan_response ──────────────────────────────────────────


class TestParsePlanResponse:
    def test_parse_plan_response_valid(self):
        """Parses valid JSON plan with tasks and execution mode."""
        valid_plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        "description": "Add button",
                        "file_locks": ["src/App.tsx"],
                        "depends_on": [],
                    }
                ],
                "execution": "parallel",
            }
        )
        result = _parse_plan_response(valid_plan)
        assert result is not None
        assert len(result["tasks"]) == 1
        assert result["tasks"][0]["agent"] == "fullstack-engineer"
        assert result["execution"] == "parallel"

    def test_parse_plan_response_multiple_tasks(self):
        """Parses plan with multiple tasks."""
        plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        "description": "UI changes",
                        "file_locks": ["src/App.tsx"],
                        "depends_on": [],
                    },
                    {
                        "id": "t2",
                        "agent": "fullstack-engineer",
                        "description": "API endpoint",
                        "file_locks": ["api/routes.py"],
                        "depends_on": [],
                    },
                ],
                "execution": "parallel",
            }
        )
        result = _parse_plan_response(plan)
        assert result is not None
        assert len(result["tasks"]) == 2

    def test_parse_plan_response_invalid_json(self):
        """Returns None for invalid JSON."""
        result = _parse_plan_response("not json at all")
        assert result is None

    def test_parse_plan_response_empty_string(self):
        """Returns None for empty string."""
        result = _parse_plan_response("")
        assert result is None

    def test_parse_plan_response_missing_tasks(self):
        """Returns None when 'tasks' key is missing."""
        result = _parse_plan_response(json.dumps({"execution": "parallel"}))
        assert result is None

    def test_parse_plan_response_non_dict(self):
        """Returns None when JSON is not a dict."""
        result = _parse_plan_response(json.dumps([1, 2, 3]))
        assert result is None

    def test_parse_plan_response_with_whitespace(self):
        """Handles leading/trailing whitespace in response."""
        plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        "description": "task",
                        "file_locks": [],
                        "depends_on": [],
                    }
                ],
                "execution": "sequential",
            }
        )
        result = _parse_plan_response(f"  \n{plan}\n  ")
        assert result is not None
        assert result["execution"] == "sequential"

    def test_parse_plan_response_strips_markdown_fences(self):
        """Strips ```json ... ``` markdown fencing from response."""
        plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        "description": "Add assignee field",
                        "file_locks": ["api/models.py"],
                        "depends_on": [],
                    }
                ],
                "execution": "sequential",
            }
        )
        fenced = f"```json\n{plan}\n```"
        result = _parse_plan_response(fenced)
        assert result is not None
        assert len(result["tasks"]) == 1
        assert result["tasks"][0]["agent"] == "fullstack-engineer"

    def test_parse_plan_response_strips_plain_fences(self):
        """Strips ``` ... ``` fencing without language tag."""
        plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        "description": "Fix button",
                        "file_locks": [],
                        "depends_on": [],
                    }
                ],
                "execution": "parallel",
            }
        )
        fenced = f"```\n{plan}\n```"
        result = _parse_plan_response(fenced)
        assert result is not None
        assert result["execution"] == "parallel"

    def test_parse_plan_response_missing_required_task_keys(self):
        """Returns None when tasks are missing required keys."""
        plan = json.dumps(
            {
                "tasks": [
                    {
                        "id": "t1",
                        "agent": "fullstack-engineer",
                        # missing "description"
                    }
                ],
            }
        )
        result = _parse_plan_response(plan)
        assert result is None


# ── Orchestrator.run — no API key ─────────────────────────────────


class TestOrchestratorRunNoApiKey:
    @pytest.mark.asyncio
    async def test_orchestrator_run_no_api_key(
        self, mock_registry, tmp_path, monkeypatch
    ):
        """Fails gracefully when ANTHROPIC_API_KEY is missing."""
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        # Create a valid context file
        context_file = tmp_path / "context.json"
        context_file.write_text(
            json.dumps(
                {
                    "route": "/test",
                    "prompt": "Fix the button",
                    "contexts": [],
                }
            )
        )

        state = MultiAgentState()
        orch = Orchestrator(mock_registry, state)
        await orch.run(str(context_file))

        snap = state.snapshot()
        assert snap["status"] == "error"
        assert "ANTHROPIC_API_KEY" in snap["error"]

    @pytest.mark.asyncio
    async def test_orchestrator_run_missing_context_file(
        self, mock_registry, tmp_path, monkeypatch
    ):
        """Fails gracefully when context file does not exist."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        state = MultiAgentState()
        orch = Orchestrator(mock_registry, state)
        await orch.run(str(tmp_path / "nonexistent.json"))

        snap = state.snapshot()
        assert snap["status"] == "error"
