"""Generic worker agent runner.

Runs any agent config through an agentic tool-use loop with Claude API.
"""

import logging
import os
from typing import Any, Callable

from anthropic import AsyncAnthropic, APIError

from agents.tools import TOOL_DEFINITIONS, execute_tool, execute_run_tests
from agents.file_lock import FileLockManager

logger = logging.getLogger(__name__)


def _build_turn_summary(turn: int, assistant_content: list) -> dict[str, Any]:
    """Build a human-readable turn summary from tool calls.

    Scans assistant content blocks for tool_use entries and categorises
    them as reads or writes. Writes take display priority over reads.

    Args:
        turn: The 1-based turn number.
        assistant_content: List of content blocks from the assistant response.

    Returns:
        Dict with keys: turn, summary, files_read, files_written.
    """
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
    """Runs a single worker agent with a specific config.

    Wraps the Claude API in an agentic tool-use loop: the worker sends
    its task to Claude, processes any tool calls, feeds results back,
    and repeats until the model emits ``end_turn`` or the turn limit
    is reached.

    Args:
        config: Agent configuration dict (name, model, tools, etc.).
        worker_id: Unique identifier for this worker instance.
        lock_manager: Optional file lock manager for write coordination.
        on_progress: Optional callback invoked after each turn with a
            summary dict.
    """

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
        self._model = config.get(
            "model",
            os.getenv("ANTHROPIC_AGENT_MODEL", "claude-sonnet-4-5-20250929"),
        )
        self._system_prompt = config.get("system_prompt", "")
        self._tool_names = set(config.get("tools", []))
        self._test_command = config.get("test_command", "")
        self._test_commands = config.get("test_commands", None)
        self._max_turns = config.get("max_turns", 15)
        self._max_tokens = config.get("max_tokens", 4096)
        self._lock_manager = lock_manager
        self._on_progress = on_progress

    def get_tools(self) -> list[dict[str, Any]]:
        """Return filtered tool definitions based on config.

        Only tools whose names appear in the config's ``tools`` list
        are included.
        """
        return [t for t in TOOL_DEFINITIONS if t["name"] in self._tool_names]

    async def run(
        self, task_description: str, context: str = ""
    ) -> dict[str, Any]:
        """Execute the agentic loop for this worker's task.

        Args:
            task_description: The task for the agent to perform.
            context: Optional context to prepend to the prompt.

        Returns:
            Dict with keys: status ("success"|"error"), files_changed
            (sorted list), message (str).
        """
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return {
                "status": "error",
                "files_changed": [],
                "message": "ANTHROPIC_API_KEY not configured",
            }

        client = AsyncAnthropic(api_key=api_key)

        prompt = f"## Your Task\n\n{task_description}"
        if context:
            prompt = f"{context}\n\n{prompt}"

        messages: list[dict[str, Any]] = [
            {"role": "user", "content": prompt},
        ]
        tools = self.get_tools()
        write_count = 0
        files_changed: set[str] = set()

        try:
            for turn in range(self._max_turns):
                logger.info(
                    "[%s] Turn %d/%d",
                    self.worker_id,
                    turn + 1,
                    self._max_turns,
                )

                response = await client.messages.create(
                    model=self._model,
                    max_tokens=self._max_tokens,
                    system=self._system_prompt,
                    tools=tools,
                    messages=messages,
                )

                assistant_content = response.content
                messages.append(
                    {"role": "assistant", "content": assistant_content}
                )

                # Emit progress
                summary = _build_turn_summary(turn + 1, assistant_content)
                if self._on_progress:
                    self._on_progress(summary)

                if response.stop_reason == "end_turn":
                    final_message = _extract_text(assistant_content)
                    return {
                        "status": "success",
                        "files_changed": sorted(files_changed),
                        "message": final_message
                        or f"Completed in {turn + 1} turns",
                    }

                # Process tool calls
                tool_results: list[dict[str, Any]] = []
                for block in assistant_content:
                    if block.type != "tool_use":
                        continue

                    result_text, write_count = _execute_single_tool(
                        block=block,
                        write_count=write_count,
                        test_command=self._test_command,
                        test_commands=self._test_commands,
                        lock_manager=self._lock_manager,
                        worker_id=self.worker_id,
                    )

                    # Track successfully written files
                    if block.name == "write_file" and not result_text.startswith(
                        "Error"
                    ):
                        files_changed.add(block.input.get("path", ""))

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_text,
                        }
                    )

                if not tool_results:
                    break

                messages.append({"role": "user", "content": tool_results})

            return {
                "status": "success",
                "files_changed": sorted(files_changed),
                "message": (
                    f"Completed in {self._max_turns} turns, "
                    f"modified {len(files_changed)} file(s)"
                ),
            }

        except APIError as exc:
            return {
                "status": "error",
                "files_changed": sorted(files_changed),
                "message": f"Claude API error: {exc.message}",
            }
        except Exception as exc:
            logger.exception("[%s] Worker failed", self.worker_id)
            return {
                "status": "error",
                "files_changed": sorted(files_changed),
                "message": str(exc),
            }


def _extract_text(content_blocks: list) -> str | None:
    """Extract the first text block from assistant content."""
    for block in content_blocks:
        if hasattr(block, "text"):
            return block.text
    return None


def _execute_single_tool(
    *,
    block: Any,
    write_count: int,
    test_command: str,
    test_commands: dict[str, str] | None,
    lock_manager: FileLockManager | None,
    worker_id: str,
) -> tuple[str, int]:
    """Execute a single tool call, respecting file locks.

    Args:
        block: The tool_use content block from the API response.
        write_count: Current cumulative write count for this run.
        test_command: The legacy test command configured for this agent.
        test_commands: Dict mapping suite names to test commands.
        lock_manager: Optional file lock manager.
        worker_id: This worker's identifier (for lock checks).

    Returns:
        Tuple of (result_text, updated_write_count).
    """
    if block.name == "run_tests":
        result_text = execute_run_tests(
            test_command=test_command,
            test_path=block.input.get("test_path", ""),
            test_commands=test_commands,
            suite=block.input.get("suite", ""),
        )
        return result_text, write_count

    if block.name == "write_file" and lock_manager is not None:
        path = block.input.get("path", "")
        if not lock_manager.can_write(worker_id, path):
            error_msg = (
                f"Error: File '{path}' is locked by another agent. "
                f"You cannot write to it."
            )
            return error_msg, write_count

    result_text, write_count = execute_tool(
        block.name, block.input, write_count
    )
    return result_text, write_count
