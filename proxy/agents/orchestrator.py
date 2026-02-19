"""Orchestrator -- Technical PM agent that plans and delegates work.

Analyzes VCI context, breaks it into subtasks, spawns worker agents,
coordinates execution (parallel or sequential), and triggers a review.
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
    """Parse the orchestrator's JSON plan response.

    Expects a JSON object with at least a ``tasks`` key containing a
    list of task dicts. Returns ``None`` for any parse failure.

    Args:
        text: Raw text response from the orchestrator Claude call.

    Returns:
        Parsed plan dict, or None on failure.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            cleaned = cleaned[first_newline + 1:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        plan = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Orchestrator returned non-JSON: %s", text[:200])
        return None

    if not isinstance(plan, dict) or "tasks" not in plan:
        logger.warning("Orchestrator plan missing 'tasks' key")
        return None

    required_keys = {"id", "agent", "description"}
    for i, task in enumerate(plan["tasks"]):
        if not isinstance(task, dict):
            logger.warning("Task %d is not a dict", i)
            return None
        missing = required_keys - task.keys()
        if missing:
            logger.warning("Task %d missing keys: %s", i, missing)
            return None

    return plan


class Orchestrator:
    """Plans and delegates work to specialized worker agents.

    The orchestrator reads VCI context, calls Claude to create a task
    plan, assigns file locks, spawns workers (parallel or sequential),
    runs a reviewer, and reports final status.

    Args:
        registry: Agent config registry for looking up agent configs.
        state: Multi-agent state manager for tracking run lifecycle.
    """

    def __init__(
        self, registry: AgentRegistry, state: MultiAgentState
    ) -> None:
        self._registry = registry
        self._state = state
        self._lock_manager = FileLockManager()

    async def run(self, context_path: str) -> None:
        """Full orchestration: plan -> delegate -> review -> report.

        Args:
            context_path: Path to the VCI context.json file.
        """
        run_id = self._state.start_run()
        logger.info("Orchestrator run started: %s", run_id)

        try:
            # 1. Read and format context
            raw_payload = read_context_file(context_path)
            payload = validate_payload(raw_payload)
            formatted_prompt = format_payload(payload, DEFAULT_TOKEN_BUDGET)

            # 2. Get orchestrator config and create plan
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

            # Acquire file locks per subtask
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

            # 5. Complete or fail based on worker outcomes
            snapshot = self._state.snapshot()
            worker_errors = [
                w
                for w in snapshot["workers"].values()
                if w["status"] == "error"
            ]

            if worker_errors:
                error_msgs = [
                    w.get("error", "Unknown") for w in worker_errors
                ]
                self._state.fail_run(
                    f"Worker errors: {'; '.join(error_msgs)}"
                )
            else:
                n_files = len(set(all_files))
                n_workers = len(snapshot["workers"])
                self._state.complete_run(
                    f"Completed with {n_workers} agent(s), "
                    f"{n_files} file(s) changed"
                )

        except (ValueError, FileNotFoundError, OSError) as exc:
            self._state.fail_run(str(exc))
            logger.error("Orchestrator config/file error: %s", exc)
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
        """Ask Claude to break down the task into subtasks.

        Args:
            orch_config: The orchestrator agent's config dict.
            formatted_prompt: The formatted VCI context prompt.

        Returns:
            Parsed plan dict, or None on failure.

        Raises:
            ValueError: If ANTHROPIC_API_KEY is not configured.
        """
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
        """Run multiple worker agents concurrently.

        Args:
            tasks: List of task dicts from the orchestrator plan.
            context: Formatted context string to pass to each worker.
        """
        coros = [
            self._run_single_worker(task, context) for task in tasks
        ]
        await asyncio.gather(*coros)

    async def _run_sequential(
        self, tasks: list[dict], context: str
    ) -> None:
        """Run worker agents one at a time in order.

        Args:
            tasks: List of task dicts from the orchestrator plan.
            context: Formatted context string to pass to each worker.
        """
        for task in tasks:
            await self._run_single_worker(task, context)

    async def _run_single_worker(
        self, task: dict, context: str
    ) -> None:
        """Spawn and run a single worker agent, updating state.

        Args:
            task: Task dict with agent, id, description, file_locks.
            context: Formatted context string.
        """
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
                worker_id,
                result["files_changed"],
                result.get("message", "Done"),
            )
        else:
            self._state.fail_worker(
                worker_id, result.get("message", "Unknown error")
            )

    async def _run_review(
        self, files_changed: list[str], original_context: str
    ) -> None:
        """Run the review agent on all changed files.

        Args:
            files_changed: List of file paths modified by workers.
            original_context: The original formatted context prompt.
        """
        self._state.set_review_status("running")

        try:
            reviewer_config = self._registry.get("reviewer")
        except KeyError:
            logger.warning("No reviewer agent configured, skipping review")
            self._state.set_review_result(
                {
                    "verdict": "skipped",
                    "issues": [],
                    "summary": "No reviewer configured",
                }
            )
            return

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            self._state.set_review_result(
                {
                    "verdict": "error",
                    "issues": [],
                    "summary": "API key not configured",
                }
            )
            return

        client = AsyncAnthropic(api_key=api_key)

        review_prompt = (
            f"Review the following files that were modified:\n\n"
            f"Files changed: {', '.join(files_changed)}\n\n"
            f"Original task context:\n{original_context}\n\n"
            f"Read each changed file and provide your security "
            f"and code quality review."
        )

        from agents.tools import TOOL_DEFINITIONS

        review_tools = [
            t
            for t in TOOL_DEFINITIONS
            if t["name"] in set(reviewer_config.get("tools", []))
        ]

        messages: list[dict[str, Any]] = [
            {"role": "user", "content": review_prompt}
        ]
        max_turns = reviewer_config.get("max_turns", 5)

        try:
            for _turn in range(max_turns):
                response = await client.messages.create(
                    model=reviewer_config.get(
                        "model", "claude-sonnet-4-5-20250929"
                    ),
                    max_tokens=reviewer_config.get("max_tokens", 4096),
                    system=reviewer_config.get("system_prompt", ""),
                    tools=review_tools,
                    messages=messages,
                )

                messages.append(
                    {"role": "assistant", "content": response.content}
                )

                if response.stop_reason == "end_turn":
                    for block in response.content:
                        if hasattr(block, "text"):
                            try:
                                result = json.loads(block.text.strip())
                                self._state.set_review_result(result)
                            except json.JSONDecodeError:
                                self._state.set_review_result(
                                    {
                                        "verdict": "approve",
                                        "issues": [],
                                        "summary": block.text[:500],
                                    }
                                )
                            break
                    return

                # Process tool calls (read-only)
                tool_results: list[dict[str, Any]] = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    from agents.tools import execute_tool

                    result_text, _ = execute_tool(
                        block.name, block.input, 0
                    )
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

            self._state.set_review_result(
                {
                    "verdict": "approve",
                    "issues": [],
                    "summary": "Review completed (max turns reached)",
                }
            )

        except Exception as exc:
            logger.exception("Review failed")
            self._state.set_review_result(
                {
                    "verdict": "error",
                    "issues": [],
                    "summary": f"Review failed: {exc}",
                }
            )
