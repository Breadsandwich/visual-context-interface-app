import copy
import pytest

from agents.state import MultiAgentState


class TestInitialState:
    def test_initial_state(self):
        state = MultiAgentState()
        snap = state.snapshot()
        assert snap["run_id"] is None
        assert snap["status"] == "idle"
        assert snap["orchestrator"] is None
        assert snap["workers"] == {}
        assert snap["reviewer"] is None
        assert snap["message"] is None
        assert snap["error"] is None
        assert snap["timestamp"] is None


class TestStartRun:
    def test_start_run(self):
        state = MultiAgentState()
        run_id = state.start_run()
        snap = state.snapshot()
        assert isinstance(run_id, str)
        assert len(run_id) > 0
        assert snap["run_id"] == run_id
        assert snap["status"] == "planning"
        assert snap["timestamp"] is not None


class TestSetOrchestratorPlan:
    def test_set_orchestrator_plan(self):
        state = MultiAgentState()
        state.start_run()
        plan = {"tasks": [{"id": "t1", "description": "fix button"}]}
        state.set_orchestrator_plan(plan)
        snap = state.snapshot()
        assert snap["status"] == "delegating"
        assert snap["orchestrator"]["plan"] == plan
        assert snap["orchestrator"]["status"] == "done"
        # Verify immutability -- mutating the input dict should not affect state
        plan["tasks"].append({"id": "t2", "description": "extra"})
        snap2 = state.snapshot()
        assert len(snap2["orchestrator"]["plan"]["tasks"]) == 1


class TestRegisterWorker:
    def test_register_worker(self):
        state = MultiAgentState()
        state.start_run()
        state.register_worker("w1", "frontend-dev", "Frontend Dev", "fix button color")
        snap = state.snapshot()
        assert "w1" in snap["workers"]
        w = snap["workers"]["w1"]
        assert w["status"] == "running"
        assert w["agent_config"] == "frontend-dev"
        assert w["agent_name"] == "Frontend Dev"
        assert w["task"] == "fix button color"
        assert w["turns"] == 0
        assert w["progress"] == []
        assert w["files_changed"] == []
        assert w["clarification"] is None
        assert w["message"] is None
        assert w["error"] is None


class TestUpdateWorkerProgress:
    def test_update_worker_progress(self):
        state = MultiAgentState()
        state.start_run()
        state.register_worker("w1", "frontend-dev", "Frontend Dev", "task")
        state.update_worker_progress("w1", {"turn": 1, "summary": "reading files"})
        state.update_worker_progress("w1", {"turn": 2, "summary": "editing component"})
        snap = state.snapshot()
        w = snap["workers"]["w1"]
        assert len(w["progress"]) == 2
        assert w["progress"][0]["turn"] == 1
        assert w["progress"][1]["summary"] == "editing component"
        assert w["turns"] == 2
        # Verify snapshot returns deep copy -- mutating returned progress should not affect state
        snap["workers"]["w1"]["progress"].append({"turn": 99})
        snap2 = state.snapshot()
        assert len(snap2["workers"]["w1"]["progress"]) == 2


class TestCompleteWorker:
    def test_complete_worker(self):
        state = MultiAgentState()
        state.start_run()
        state.register_worker("w1", "frontend-dev", "Frontend Dev", "task")
        state.complete_worker("w1", ["src/App.tsx", "src/Button.tsx"], "Fixed button")
        snap = state.snapshot()
        w = snap["workers"]["w1"]
        assert w["status"] == "success"
        assert w["files_changed"] == ["src/App.tsx", "src/Button.tsx"]
        assert w["message"] == "Fixed button"


class TestAllWorkersDone:
    def test_all_workers_done(self):
        state = MultiAgentState()
        state.start_run()
        state.register_worker("w1", "cfg", "Worker 1", "task1")
        state.register_worker("w2", "cfg", "Worker 2", "task2")
        # One still running
        assert state.all_workers_done() is False
        state.complete_worker("w1", [], "done")
        assert state.all_workers_done() is False
        # Second fails -- both are now done (success or error)
        state.fail_worker("w2", "timeout")
        assert state.all_workers_done() is True

    def test_all_workers_done_no_workers(self):
        state = MultiAgentState()
        state.start_run()
        # No workers registered -- should be True (vacuously)
        assert state.all_workers_done() is True


class TestSetReview:
    def test_set_review(self):
        state = MultiAgentState()
        state.start_run()
        state.set_review_status("reviewing")
        snap = state.snapshot()
        assert snap["status"] == "reviewing"
        assert snap["reviewer"]["status"] == "reviewing"
        # Now set result
        result = {"approved": True, "comments": []}
        state.set_review_result(result)
        snap2 = state.snapshot()
        assert snap2["reviewer"]["result"] == result


class TestCompleteRun:
    def test_complete_run(self):
        state = MultiAgentState()
        state.start_run()
        state.complete_run("All tasks finished successfully")
        snap = state.snapshot()
        assert snap["status"] == "success"
        assert snap["message"] == "All tasks finished successfully"


class TestFailRun:
    def test_fail_run(self):
        state = MultiAgentState()
        state.start_run()
        state.fail_run("Orchestrator crashed")
        snap = state.snapshot()
        assert snap["status"] == "error"
        assert snap["error"] == "Orchestrator crashed"


class TestReset:
    def test_reset(self):
        state = MultiAgentState()
        run_id = state.start_run()
        state.register_worker("w1", "cfg", "Worker", "task")
        state.complete_worker("w1", ["file.py"], "done")
        state.complete_run("finished")
        # Now reset
        state.reset()
        snap = state.snapshot()
        assert snap["run_id"] is None
        assert snap["status"] == "idle"
        assert snap["workers"] == {}
        assert snap["orchestrator"] is None
        assert snap["reviewer"] is None
        assert snap["message"] is None
        assert snap["error"] is None
