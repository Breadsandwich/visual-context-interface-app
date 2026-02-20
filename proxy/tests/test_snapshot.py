import json
from pathlib import Path

import pytest
from snapshot import (
    MAX_FULL_SNAPSHOTS,
    init_snapshot,
    capture_file,
    finalize_snapshot,
    list_snapshots,
    restore_snapshot,
)


@pytest.fixture()
def snapshot_env(tmp_path):
    """Set up a temporary output directory with .vci/snapshots/."""
    output_dir = tmp_path / "project"
    output_dir.mkdir()
    (output_dir / ".vci" / "snapshots").mkdir(parents=True)
    return output_dir


class TestInitSnapshot:
    def test_creates_snapshot_directory(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        snapshot_dir = snapshot_env / ".vci" / "snapshots" / run_id
        assert snapshot_dir.is_dir()

    def test_writes_initial_manifest(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        manifest_path = snapshot_env / ".vci" / "snapshots" / run_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        assert manifest["run_id"] == run_id
        assert manifest["status"] == "in_progress"
        assert manifest["files"] == []

    def test_run_id_is_timestamp_format(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        assert len(run_id) == 26  # 19 timestamp + "_" + 6 hex
        assert run_id[4] == "-"
        assert run_id[10] == "T"
        assert run_id[19] == "_"
        # Suffix is valid hex
        assert all(c in "0123456789abcdef" for c in run_id[20:])


class TestCaptureFile:
    def test_captures_existing_file(self, snapshot_env):
        src = snapshot_env / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("original content")

        run_id = init_snapshot(str(snapshot_env))
        captured = capture_file(str(snapshot_env), run_id, "src/App.jsx")

        assert captured is True
        snapshot_copy = snapshot_env / ".vci" / "snapshots" / run_id / "src" / "App.jsx"
        assert snapshot_copy.read_text() == "original content"

    def test_skips_nonexistent_file(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        captured = capture_file(str(snapshot_env), run_id, "src/Missing.jsx")
        assert captured is False

    def test_preserves_relative_path_structure(self, snapshot_env):
        src = snapshot_env / "src" / "pages" / "Tasks.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("tasks content")

        run_id = init_snapshot(str(snapshot_env))
        capture_file(str(snapshot_env), run_id, "src/pages/Tasks.jsx")

        snapshot_copy = snapshot_env / ".vci" / "snapshots" / run_id / "src" / "pages" / "Tasks.jsx"
        assert snapshot_copy.read_text() == "tasks content"

    def test_rejects_path_traversal(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        captured = capture_file(str(snapshot_env), run_id, "../../etc/passwd")
        assert captured is False


class TestFinalizeSnapshot:
    def test_updates_manifest_on_success(self, snapshot_env):
        src = snapshot_env / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("content")

        run_id = init_snapshot(str(snapshot_env))
        capture_file(str(snapshot_env), run_id, "src/App.jsx")
        finalize_snapshot(
            str(snapshot_env),
            run_id,
            files_changed=["src/App.jsx"],
            context_summary="Fix button color",
            status="success",
        )

        manifest_path = snapshot_env / ".vci" / "snapshots" / run_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        assert manifest["status"] == "success"
        assert manifest["files"] == ["src/App.jsx"]
        assert manifest["context_summary"] == "Fix button color"

    def test_updates_latest_json(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        finalize_snapshot(str(snapshot_env), run_id, [], "", "success")

        latest_path = snapshot_env / ".vci" / "snapshots" / "latest.json"
        latest = json.loads(latest_path.read_text())
        assert latest["run_id"] == run_id

    def test_marks_error_status(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        finalize_snapshot(str(snapshot_env), run_id, [], "", "error")

        manifest_path = snapshot_env / ".vci" / "snapshots" / run_id / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        assert manifest["status"] == "error"
