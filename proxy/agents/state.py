"""Multi-agent state manager for orchestrated agent runs.

Tracks the full lifecycle of an orchestrated run: planning, delegation,
worker execution, review, and completion. Uses immutable update patterns
throughout -- self._state is never mutated in-place.
"""

import copy
import threading
import uuid
from datetime import datetime, timezone


def _initial_state() -> dict:
    """Return a fresh idle state dict."""
    return {
        "run_id": None,
        "status": "idle",
        "orchestrator": None,
        "workers": {},
        "reviewer": None,
        "message": None,
        "error": None,
        "timestamp": None,
    }


def _now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


class MultiAgentState:
    """Immutable-style state container for a multi-agent run.

    Every mutation method replaces ``self._state`` with a new dict rather
    than modifying the existing one in-place.  Callers receive deep copies
    via :meth:`snapshot` so external mutation cannot corrupt internal state.
    """

    def __init__(self) -> None:
        self._state: dict = _initial_state()
        self._lock = threading.Lock()

    # -- reads ---------------------------------------------------------------

    def snapshot(self) -> dict:
        """Return a deep copy of the current state."""
        with self._lock:
            return copy.deepcopy(self._state)

    def all_workers_done(self) -> bool:
        """Return True when every registered worker is 'success' or 'error'.

        Returns True vacuously when no workers are registered.
        """
        workers = self._state["workers"]
        return all(
            w["status"] in ("success", "error")
            for w in workers.values()
        )

    # -- run lifecycle -------------------------------------------------------

    def start_run(self) -> str:
        """Begin a new run. Returns the generated run_id."""
        run_id = str(uuid.uuid4())
        with self._lock:
            self._state = {
                **self._state,
                "run_id": run_id,
                "status": "planning",
                "timestamp": _now_iso(),
            }
        return run_id

    def complete_run(self, message: str) -> None:
        """Mark the run as successfully completed."""
        with self._lock:
            self._state = {
                **self._state,
                "status": "success",
                "message": message,
                "timestamp": _now_iso(),
            }

    def fail_run(self, error: str) -> None:
        """Mark the run as failed."""
        with self._lock:
            self._state = {
                **self._state,
                "status": "error",
                "error": error,
                "timestamp": _now_iso(),
            }

    def reset(self) -> None:
        """Reset to initial idle state."""
        with self._lock:
            self._state = _initial_state()

    # -- orchestrator --------------------------------------------------------

    def set_orchestrator_plan(self, plan: dict) -> None:
        """Store the orchestrator's plan and transition to 'delegating'."""
        with self._lock:
            self._state = {
                **self._state,
                "status": "delegating",
                "orchestrator": {
                    "status": "done",
                    "plan": copy.deepcopy(plan),
                },
                "timestamp": _now_iso(),
            }

    # -- workers -------------------------------------------------------------

    def register_worker(
        self,
        worker_id: str,
        agent_config: str,
        agent_name: str,
        task: str,
    ) -> None:
        """Register a new worker with 'running' status."""
        new_worker = {
            "status": "running",
            "agent_config": agent_config,
            "agent_name": agent_name,
            "task": task,
            "turns": 0,
            "progress": [],
            "files_changed": [],
            "clarification": None,
            "message": None,
            "error": None,
        }
        with self._lock:
            self._state = {
                **self._state,
                "workers": {
                    **self._state["workers"],
                    worker_id: new_worker,
                },
                "timestamp": _now_iso(),
            }

    def update_worker_progress(
        self, worker_id: str, progress_entry: dict
    ) -> None:
        """Append a progress entry to the worker's progress list."""
        with self._lock:
            existing = self._state["workers"][worker_id]
            new_progress = [*existing["progress"], copy.deepcopy(progress_entry)]
            updated_worker = {
                **existing,
                "progress": new_progress,
                "turns": len(new_progress),
            }
            self._state = {
                **self._state,
                "workers": {
                    **self._state["workers"],
                    worker_id: updated_worker,
                },
                "timestamp": _now_iso(),
            }

    def set_worker_clarification(
        self, worker_id: str, clarification: dict | None
    ) -> None:
        """Set or clear a clarification request on a worker."""
        with self._lock:
            existing = self._state["workers"][worker_id]
            updated_worker = {
                **existing,
                "status": "clarifying" if clarification is not None else "running",
                "clarification": copy.deepcopy(clarification) if clarification is not None else None,
            }
            self._state = {
                **self._state,
                "workers": {
                    **self._state["workers"],
                    worker_id: updated_worker,
                },
                "timestamp": _now_iso(),
            }

    def complete_worker(
        self, worker_id: str, files_changed: list, message: str
    ) -> None:
        """Mark a worker as successfully completed."""
        with self._lock:
            existing = self._state["workers"][worker_id]
            updated_worker = {
                **existing,
                "status": "success",
                "files_changed": list(files_changed),
                "message": message,
            }
            self._state = {
                **self._state,
                "workers": {
                    **self._state["workers"],
                    worker_id: updated_worker,
                },
                "timestamp": _now_iso(),
            }

    def fail_worker(self, worker_id: str, error: str) -> None:
        """Mark a worker as failed."""
        with self._lock:
            existing = self._state["workers"][worker_id]
            updated_worker = {
                **existing,
                "status": "error",
                "error": error,
            }
            self._state = {
                **self._state,
                "workers": {
                    **self._state["workers"],
                    worker_id: updated_worker,
                },
                "timestamp": _now_iso(),
            }

    # -- reviewer ------------------------------------------------------------

    def set_review_status(self, status: str) -> None:
        """Set the review status and transition overall status to 'reviewing'."""
        with self._lock:
            existing_reviewer = self._state["reviewer"] or {}
            self._state = {
                **self._state,
                "status": "reviewing",
                "reviewer": {
                    **existing_reviewer,
                    "status": status,
                },
                "timestamp": _now_iso(),
            }

    def set_review_result(self, result: dict) -> None:
        """Store the review result."""
        with self._lock:
            existing_reviewer = self._state["reviewer"] or {}
            self._state = {
                **self._state,
                "reviewer": {
                    **existing_reviewer,
                    "result": copy.deepcopy(result),
                },
                "timestamp": _now_iso(),
            }
