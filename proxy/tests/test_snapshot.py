import json
import os
import time
from unittest.mock import patch

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


class TestPruneSnapshots:
    def test_prunes_beyond_max(self, snapshot_env):
        total = MAX_FULL_SNAPSHOTS + 2
        run_ids = []

        for i in range(total):
            time.sleep(0.01)
            rid = init_snapshot(str(snapshot_env))
            src = snapshot_env / f"file_{i}.txt"
            src.write_text(f"content {i}")
            capture_file(str(snapshot_env), rid, f"file_{i}.txt")
            finalize_snapshot(
                str(snapshot_env),
                rid,
                [f"file_{i}.txt"],
                f"change {i}",
                "success",
            )
            run_ids.append(rid)

        snapshots = list_snapshots(str(snapshot_env))
        statuses = [s["status"] for s in snapshots]

        pruned_count = statuses.count("pruned")
        success_count = statuses.count("success")

        assert pruned_count == 2
        assert success_count == MAX_FULL_SNAPSHOTS

    def test_pruned_manifest_preserved(self, snapshot_env):
        total = MAX_FULL_SNAPSHOTS + 1
        run_ids = []

        for i in range(total):
            time.sleep(0.01)
            rid = init_snapshot(str(snapshot_env))
            src = snapshot_env / f"file_{i}.txt"
            src.write_text(f"content {i}")
            capture_file(str(snapshot_env), rid, f"file_{i}.txt")
            finalize_snapshot(
                str(snapshot_env),
                rid,
                [f"file_{i}.txt"],
                f"change {i}",
                "success",
            )
            run_ids.append(rid)

        snapshots = list_snapshots(str(snapshot_env))
        pruned = [s for s in snapshots if s["status"] == "pruned"]

        assert len(pruned) == 1
        pruned_run_id = pruned[0]["run_id"]

        # Pruned snapshot must be one we created
        assert pruned_run_id in run_ids

        # Manifest file should still exist on disk
        manifest_path = (
            snapshot_env / ".vci" / "snapshots" / pruned_run_id / "manifest.json"
        )
        assert manifest_path.is_file()

        # Manifest should show status as "pruned" and still appear in list
        manifest = json.loads(manifest_path.read_text())
        assert manifest["status"] == "pruned"

        # Captured files should be removed from the pruned snapshot
        snap_dir = snapshot_env / ".vci" / "snapshots" / pruned_run_id
        remaining_files = [f for f in snap_dir.rglob("*") if f.is_file()]
        assert all(f.name == "manifest.json" for f in remaining_files)


class TestRestoreSnapshot:
    def test_restores_files_to_original_location(self, snapshot_env):
        src = snapshot_env / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("original content")

        run_id = init_snapshot(str(snapshot_env))
        capture_file(str(snapshot_env), run_id, "src/App.jsx")
        finalize_snapshot(
            str(snapshot_env),
            run_id,
            ["src/App.jsx"],
            "modify App",
            "success",
        )

        # Overwrite the file
        src.write_text("modified content")
        assert src.read_text() == "modified content"

        # Restore and verify original content is back
        restored = restore_snapshot(str(snapshot_env), run_id)
        assert restored == ["src/App.jsx"]
        assert src.read_text() == "original content"

    def test_returns_none_for_pruned_snapshot(self, snapshot_env):
        run_id = init_snapshot(str(snapshot_env))
        finalize_snapshot(str(snapshot_env), run_id, [], "test", "success")

        # Manually set manifest status to "pruned"
        manifest_path = (
            snapshot_env / ".vci" / "snapshots" / run_id / "manifest.json"
        )
        manifest = json.loads(manifest_path.read_text())
        pruned_manifest = {**manifest, "status": "pruned"}
        manifest_path.write_text(json.dumps(pruned_manifest, indent=2))

        result = restore_snapshot(str(snapshot_env), run_id)
        assert result is None

    def test_returns_none_for_nonexistent_run_id(self, snapshot_env):
        result = restore_snapshot(str(snapshot_env), "2099-01-01T00-00-00_abcdef")
        assert result is None


class TestListSnapshots:
    def test_returns_newest_first(self, snapshot_env):
        summaries = []
        for i in range(3):
            # Sleep 1 second to guarantee distinct second-level timestamps,
            # since run_id sorting is by timestamp prefix + random hex suffix.
            time.sleep(1)
            rid = init_snapshot(str(snapshot_env))
            summary = f"change {i}"
            finalize_snapshot(str(snapshot_env), rid, [], summary, "success")
            summaries.append(summary)

        snapshots = list_snapshots(str(snapshot_env))

        assert len(snapshots) == 3
        # Newest first means the last created should be first in the list
        returned_summaries = [s["context_summary"] for s in snapshots]
        assert returned_summaries == list(reversed(summaries))

    def test_empty_when_no_snapshots(self, snapshot_env):
        result = list_snapshots(str(snapshot_env))
        assert result == []


class TestAgentToolsSnapshotIntegration:
    def test_write_file_captures_existing_file(self, snapshot_env):
        from agent_tools import execute_write_file

        src = snapshot_env / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("original content")

        run_id = init_snapshot(str(snapshot_env))

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(snapshot_env)}):
            result = execute_write_file("src/App.jsx", "new content", 0, run_id)

        assert not result.startswith("Error")
        assert src.read_text() == "new content"

        snapshot_copy = snapshot_env / ".vci" / "snapshots" / run_id / "src" / "App.jsx"
        assert snapshot_copy.read_text() == "original content"

    def test_write_file_works_without_run_id(self, snapshot_env):
        from agent_tools import execute_write_file

        src = snapshot_env / "src" / "App.jsx"
        src.parent.mkdir(parents=True)

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(snapshot_env)}):
            result = execute_write_file("src/App.jsx", "content", 0, None)

        assert not result.startswith("Error")
        assert src.read_text() == "content"

    def test_write_file_skips_snapshot_for_new_file(self, snapshot_env):
        from agent_tools import execute_write_file

        run_id = init_snapshot(str(snapshot_env))

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(snapshot_env)}):
            result = execute_write_file("src/NewFile.jsx", "content", 0, run_id)

        assert not result.startswith("Error")
        # No snapshot copy should exist for a new file
        snapshot_dir = snapshot_env / ".vci" / "snapshots" / run_id / "src"
        assert not snapshot_dir.exists() or not (snapshot_dir / "NewFile.jsx").exists()
