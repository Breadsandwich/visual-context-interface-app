"""Tests for worker agent runner."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.worker import WorkerAgent, _build_turn_summary


# ── Fixtures ────────────────────────────────────────────────────────


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


@pytest.fixture
def minimal_config():
    return {
        "id": "minimal",
        "name": "Minimal Agent",
        "tools": [],
        "max_turns": 5,
        "max_tokens": 2048,
    }


def _make_text_block(text: str) -> MagicMock:
    """Create a mock text content block."""
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _make_tool_use_block(
    tool_id: str, name: str, input_data: dict
) -> MagicMock:
    """Create a mock tool_use content block."""
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_id
    block.name = name
    block.input = input_data
    return block


# ── _build_turn_summary ────────────────────────────────────────────


class TestBuildTurnSummary:
    def test_summary_with_write_file(self):
        blocks = [_make_tool_use_block("t1", "write_file", {"path": "src/App.tsx"})]
        result = _build_turn_summary(1, blocks)
        assert result["turn"] == 1
        assert "Editing" in result["summary"]
        assert "App.tsx" in result["summary"]
        assert result["files_written"] == ["src/App.tsx"]
        assert result["files_read"] == []

    def test_summary_with_read_file(self):
        blocks = [_make_tool_use_block("t1", "read_file", {"path": "src/utils.ts"})]
        result = _build_turn_summary(2, blocks)
        assert "Reading" in result["summary"]
        assert "utils.ts" in result["summary"]
        assert result["files_read"] == ["src/utils.ts"]
        assert result["files_written"] == []

    def test_summary_with_no_tool_use(self):
        blocks = [_make_text_block("Thinking about the problem...")]
        result = _build_turn_summary(1, blocks)
        assert "Thinking..." in result["summary"]
        assert result["files_read"] == []
        assert result["files_written"] == []

    def test_summary_write_takes_priority_over_read(self):
        blocks = [
            _make_tool_use_block("t1", "read_file", {"path": "src/old.ts"}),
            _make_tool_use_block("t2", "write_file", {"path": "src/new.ts"}),
        ]
        result = _build_turn_summary(3, blocks)
        assert "Editing" in result["summary"]
        assert result["files_read"] == ["src/old.ts"]
        assert result["files_written"] == ["src/new.ts"]

    def test_summary_handles_missing_path(self):
        blocks = [_make_tool_use_block("t1", "write_file", {})]
        result = _build_turn_summary(1, blocks)
        assert "unknown" in result["files_written"]


# ── WorkerAgent.__init__ ───────────────────────────────────────────


class TestWorkerInit:
    def test_initializes_with_config(self, fullstack_config):
        worker = WorkerAgent(fullstack_config, worker_id="fe-1")
        assert worker.worker_id == "fe-1"
        assert worker.agent_name == "Full-Stack Engineer"

    def test_builds_filtered_tool_list(self, fullstack_config):
        worker = WorkerAgent(fullstack_config, worker_id="fe-1")
        tool_names = [t["name"] for t in worker.get_tools()]
        assert "read_file" in tool_names
        assert "write_file" in tool_names
        assert "search_files" not in tool_names
        assert "list_directory" not in tool_names

    def test_empty_tools_config(self, minimal_config):
        worker = WorkerAgent(minimal_config, worker_id="min-1")
        assert worker.get_tools() == []

    def test_run_tests_tool_included_when_configured(self):
        config = {
            "id": "with-tests",
            "name": "Test Agent",
            "tools": ["read_file", "run_tests"],
            "test_command": "pytest",
            "max_turns": 10,
            "max_tokens": 4096,
        }
        worker = WorkerAgent(config, worker_id="t-1")
        tool_names = [t["name"] for t in worker.get_tools()]
        assert "run_tests" in tool_names
        assert "read_file" in tool_names

    def test_defaults_from_env_when_model_missing(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_AGENT_MODEL", "claude-haiku-3")
        config = {
            "id": "no-model",
            "name": "No Model",
            "tools": [],
            "max_turns": 5,
            "max_tokens": 2048,
        }
        worker = WorkerAgent(config, worker_id="nm-1")
        assert worker._model == "claude-haiku-3"

    def test_stores_lock_manager_and_progress_callback(self, fullstack_config):
        lock_mgr = MagicMock()
        progress_fn = MagicMock()
        worker = WorkerAgent(
            fullstack_config,
            worker_id="fe-1",
            lock_manager=lock_mgr,
            on_progress=progress_fn,
        )
        assert worker._lock_manager is lock_mgr
        assert worker._on_progress is progress_fn


# ── WorkerAgent.run — no API key ───────────────────────────────────


class TestWorkerRunNoApiKey:
    @pytest.mark.asyncio
    async def test_returns_error_without_api_key(self, fullstack_config, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        worker = WorkerAgent(fullstack_config, worker_id="fe-1")
        result = await worker.run("Add a button")
        assert result["status"] == "error"
        assert "ANTHROPIC_API_KEY" in result["message"]
        assert result["files_changed"] == []


# ── WorkerAgent.run — end_turn on first response ──────────────────


class TestWorkerRunEndTurn:
    @pytest.mark.asyncio
    async def test_end_turn_returns_text_message(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.stop_reason = "end_turn"
        mock_response.content = [_make_text_block("Done! No changes needed.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Review the code")

        assert result["status"] == "success"
        assert result["message"] == "Done! No changes needed."
        assert result["files_changed"] == []

    @pytest.mark.asyncio
    async def test_end_turn_emits_progress(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.stop_reason = "end_turn"
        mock_response.content = [_make_text_block("All done.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        progress_calls = []

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(
                fullstack_config,
                worker_id="fe-1",
                on_progress=lambda p: progress_calls.append(p),
            )
            await worker.run("Review code")

        assert len(progress_calls) == 1
        assert progress_calls[0]["turn"] == 1


# ── WorkerAgent.run — tool use loop ───────────────────────────────


class TestWorkerRunToolUseLoop:
    @pytest.mark.asyncio
    async def test_executes_tool_and_loops(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        # First response: tool_use (write_file)
        tool_block = _make_tool_use_block(
            "tool-1", "write_file", {"path": "src/Button.tsx", "content": "export default () => <button/>"}
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        # Second response: end_turn
        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Created Button component.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", return_value=("Successfully wrote 30 bytes to src/Button.tsx", 1)):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Create a Button component")

        assert result["status"] == "success"
        assert "src/Button.tsx" in result["files_changed"]
        assert result["message"] == "Created Button component."

    @pytest.mark.asyncio
    async def test_tracks_multiple_files_changed(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        # Turn 1: write file A
        tool1 = _make_tool_use_block("t1", "write_file", {"path": "src/A.tsx", "content": "a"})
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool1]

        # Turn 2: write file B
        tool2 = _make_tool_use_block("t2", "write_file", {"path": "src/B.tsx", "content": "b"})
        resp2 = MagicMock()
        resp2.stop_reason = "tool_use"
        resp2.content = [tool2]

        # Turn 3: done
        resp3 = MagicMock()
        resp3.stop_reason = "end_turn"
        resp3.content = [_make_text_block("Done.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2, resp3])

        call_count = 0

        def mock_execute_tool(name, inp, wc):
            nonlocal call_count
            call_count += 1
            return (f"Successfully wrote to {inp.get('path', '')}", wc + 1)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", side_effect=mock_execute_tool):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Create two components")

        assert result["status"] == "success"
        assert "src/A.tsx" in result["files_changed"]
        assert "src/B.tsx" in result["files_changed"]


# ── WorkerAgent.run — file lock enforcement ────────────────────────


class TestWorkerRunFileLock:
    @pytest.mark.asyncio
    async def test_blocked_write_when_locked_by_other(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        tool_block = _make_tool_use_block(
            "t1", "write_file", {"path": "src/Shared.tsx", "content": "new content"}
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Could not write.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        lock_mgr = MagicMock()
        lock_mgr.can_write.return_value = False

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(
                fullstack_config,
                worker_id="fe-1",
                lock_manager=lock_mgr,
            )
            result = await worker.run("Edit shared file")

        # File should NOT appear in files_changed
        assert "src/Shared.tsx" not in result["files_changed"]
        # Lock manager was consulted
        lock_mgr.can_write.assert_called_once_with("fe-1", "src/Shared.tsx")

    @pytest.mark.asyncio
    async def test_allowed_write_when_lock_held(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        tool_block = _make_tool_use_block(
            "t1", "write_file", {"path": "src/Mine.tsx", "content": "mine"}
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Written.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        lock_mgr = MagicMock()
        lock_mgr.can_write.return_value = True

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", return_value=("Successfully wrote 4 bytes to src/Mine.tsx", 1)):
            worker = WorkerAgent(
                fullstack_config,
                worker_id="fe-1",
                lock_manager=lock_mgr,
            )
            result = await worker.run("Write my file")

        assert "src/Mine.tsx" in result["files_changed"]


# ── WorkerAgent.run — run_tests tool ──────────────────────────────


class TestWorkerRunTests:
    @pytest.mark.asyncio
    async def test_run_tests_tool_dispatched(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        config = {
            "id": "tester",
            "name": "Tester",
            "tools": ["read_file", "run_tests"],
            "test_command": "npm test",
            "max_turns": 10,
            "max_tokens": 4096,
        }

        tool_block = _make_tool_use_block("t1", "run_tests", {"test_path": "src/"})
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Tests pass.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_run_tests", return_value="[PASS] Exit code: 0\n4 passed") as mock_run:
            worker = WorkerAgent(config, worker_id="t-1")
            result = await worker.run("Run the tests")

        mock_run.assert_called_once_with(
            test_command="npm test",
            test_path="src/",
            test_commands=None,
            suite="",
        )
        assert result["status"] == "success"


# ── WorkerAgent.run — error handling ──────────────────────────────


class TestWorkerRunErrors:
    @pytest.mark.asyncio
    async def test_api_error_returns_error_result(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        from anthropic import APIError

        mock_client = AsyncMock()
        mock_error = APIError(
            message="Rate limit exceeded",
            request=MagicMock(),
            body=None,
        )
        mock_client.messages.create = AsyncMock(side_effect=mock_error)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Do something")

        assert result["status"] == "error"
        assert "Claude API error" in result["message"]

    @pytest.mark.asyncio
    async def test_unexpected_exception_returns_error(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=RuntimeError("network down"))

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Do something")

        assert result["status"] == "error"
        assert "network down" in result["message"]


# ── WorkerAgent.run — max turns ───────────────────────────────────


class TestWorkerRunMaxTurns:
    @pytest.mark.asyncio
    async def test_stops_at_max_turns(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        config = {
            "id": "limited",
            "name": "Limited Agent",
            "tools": ["read_file"],
            "max_turns": 2,
            "max_tokens": 4096,
        }

        # Both turns: tool_use (never end_turn)
        tool_block = _make_tool_use_block("t1", "read_file", {"path": "src/a.ts"})
        resp = MagicMock()
        resp.stop_reason = "tool_use"
        resp.content = [tool_block]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=resp)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", return_value=("file content", 0)):
            worker = WorkerAgent(config, worker_id="lim-1")
            result = await worker.run("Read files forever")

        assert result["status"] == "success"
        assert "2 turns" in result["message"]
        # Should have called the API exactly max_turns times
        assert mock_client.messages.create.call_count == 2


# ── WorkerAgent.run — context parameter ───────────────────────────


class TestWorkerRunContext:
    @pytest.mark.asyncio
    async def test_context_prepended_to_prompt(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        resp = MagicMock()
        resp.stop_reason = "end_turn"
        resp.content = [_make_text_block("OK")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=resp)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            await worker.run("Fix the bug", context="Project uses React 18")

        call_args = mock_client.messages.create.call_args
        user_message = call_args.kwargs["messages"][0]["content"]
        assert "Project uses React 18" in user_message
        assert "Fix the bug" in user_message

    @pytest.mark.asyncio
    async def test_no_context_just_task(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        resp = MagicMock()
        resp.stop_reason = "end_turn"
        resp.content = [_make_text_block("OK")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=resp)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            await worker.run("Fix the bug")

        call_args = mock_client.messages.create.call_args
        user_message = call_args.kwargs["messages"][0]["content"]
        assert user_message.startswith("## Your Task")
        assert "Fix the bug" in user_message


# ── WorkerAgent.run — write_file without lock manager ─────────────


class TestWorkerRunWriteNoLockManager:
    @pytest.mark.asyncio
    async def test_write_without_lock_manager_tracks_files(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        tool_block = _make_tool_use_block(
            "t1", "write_file", {"path": "src/New.tsx", "content": "content"}
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Done.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", return_value=("Successfully wrote 7 bytes", 1)):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Create file")

        assert "src/New.tsx" in result["files_changed"]

    @pytest.mark.asyncio
    async def test_write_error_does_not_track_file(self, fullstack_config, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        tool_block = _make_tool_use_block(
            "t1", "write_file", {"path": "src/Bad.tsx", "content": "x"}
        )
        resp1 = MagicMock()
        resp1.stop_reason = "tool_use"
        resp1.content = [tool_block]

        resp2 = MagicMock()
        resp2.stop_reason = "end_turn"
        resp2.content = [_make_text_block("Failed.")]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=[resp1, resp2])

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", return_value=("Error: Path outside project directory", 0)):
            worker = WorkerAgent(fullstack_config, worker_id="fe-1")
            result = await worker.run("Write bad file")

        assert "src/Bad.tsx" not in result["files_changed"]


# ── WorkerAgent.run — repeated write warning ─────────────────────


class TestWorkerRepeatedWriteWarning:
    @pytest.mark.asyncio
    async def test_warns_on_third_write_to_same_file(self, fullstack_config, monkeypatch):
        """Worker appends warning when same file written 3+ times."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        responses = []
        for i in range(3):
            tool_block = _make_tool_use_block(
                f"t{i}", "write_file", {"path": "src/App.tsx", "content": f"v{i}"}
            )
            resp = MagicMock()
            resp.stop_reason = "tool_use"
            resp.content = [tool_block]
            responses.append(resp)

        # Final end_turn
        resp_end = MagicMock()
        resp_end.stop_reason = "end_turn"
        resp_end.content = [_make_text_block("Done.")]
        responses.append(resp_end)

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=responses)

        tool_results_seen: list[str] = []

        original_execute_tool = None

        def mock_execute(name, inp, wc):
            return (f"Successfully wrote to {inp.get('path', '')}", wc + 1)

        with patch("agents.worker.AsyncAnthropic", return_value=mock_client), \
             patch("agents.worker.execute_tool", side_effect=mock_execute):
            worker = WorkerAgent(fullstack_config, worker_id="fs-1")
            result = await worker.run("Edit app")

        # All calls share the same messages list (passed by reference).
        # Final list: [user, asst(t0), user(res0), asst(t1), user(res1),
        #              asst(t2), user(res2+warning), asst(end_turn)]
        calls = mock_client.messages.create.call_args_list
        assert len(calls) == 4  # 3 tool_use rounds + 1 end_turn

        # Index 6 is the user message with the 3rd write's tool result.
        messages = calls[0].kwargs["messages"]
        third_write_result_msg = messages[6]
        assert third_write_result_msg["role"] == "user"
        tool_result_content = third_write_result_msg["content"][0]["content"]
        assert "Warning" in tool_result_content
        assert "3 times" in tool_result_content

        assert result["status"] == "success"
        assert "src/App.tsx" in result["files_changed"]


# ── WorkerAgent.run — run_tests suite parameter ──────────────────


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
            test_command="",
            test_path="api/",
            test_commands={"backend": "python -m pytest", "frontend": "npm test"},
            suite="backend",
        )
        assert result["status"] == "success"
