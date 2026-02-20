"""Snapshot module for agent undo/restore.

Manages file-level snapshots in .vci/snapshots/ that allow users
to undo agent changes. Each snapshot captures pre-edit file contents
and stores them alongside a manifest describing the run.
"""

from __future__ import annotations

import json
import logging
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_FULL_SNAPSHOTS = 10
VALID_FINAL_STATUSES = frozenset({"success", "error"})


def _snapshots_dir(output_dir: str) -> Path:
    """Return the .vci/snapshots/ directory for a given output dir."""
    return Path(output_dir) / ".vci" / "snapshots"


def _snapshot_dir(output_dir: str, run_id: str) -> Path:
    """Return the directory for a specific snapshot run."""
    return _snapshots_dir(output_dir) / run_id


def _is_safe_relative_path(output_dir: str, relative_path: str) -> bool:
    """Validate that a relative path stays within the output directory."""
    base = Path(output_dir).resolve()
    target = (base / relative_path).resolve()
    try:
        target.relative_to(base)
        return True
    except ValueError:
        return False


def _generate_run_id() -> str:
    """Generate a unique run ID based on UTC timestamp with random suffix."""
    now = datetime.now(timezone.utc)
    suffix = secrets.token_hex(3)  # 6 hex chars
    return f"{now.strftime('%Y-%m-%dT%H-%M-%S')}_{suffix}"


def init_snapshot(output_dir: str) -> str:
    """Create a new snapshot directory with an initial manifest.

    Args:
        output_dir: The project output directory containing .vci/.

    Returns:
        The run_id string (timestamp format).
    """
    run_id = _generate_run_id()
    snap_dir = _snapshot_dir(output_dir, run_id)
    snap_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "run_id": run_id,
        "status": "in_progress",
        "files": [],
    }
    manifest_path = snap_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    return run_id


def capture_file(output_dir: str, run_id: str, relative_path: str) -> bool:
    """Copy a file into the snapshot directory before it is overwritten.

    Args:
        output_dir: The project output directory.
        run_id: The snapshot run ID.
        relative_path: Path relative to output_dir of the file to capture.

    Returns:
        True if the file was captured, False if it was skipped
        (nonexistent or path traversal).
    """
    if not _is_safe_relative_path(output_dir, relative_path):
        return False

    source = Path(output_dir) / relative_path
    if not source.is_file():
        return False

    snap_dir = _snapshot_dir(output_dir, run_id)
    dest = snap_dir / relative_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(source), str(dest))

    return True


def finalize_snapshot(
    output_dir: str,
    run_id: str,
    files_changed: list[str],
    context_summary: str,
    status: str,
) -> None:
    """Update the snapshot manifest and write latest.json.

    Args:
        output_dir: The project output directory.
        run_id: The snapshot run ID.
        files_changed: List of relative paths that were changed.
        context_summary: A short description of the agent action.
        status: Final status ("success" or "error").
    """
    if status not in VALID_FINAL_STATUSES:
        logger.warning("Invalid finalize status '%s', defaulting to 'error'", status)
        status = "error"

    snap_dir = _snapshot_dir(output_dir, run_id)
    manifest_path = snap_dir / "manifest.json"

    if not manifest_path.is_file():
        logger.warning("Snapshot manifest not found for run_id=%s", run_id)
        return

    manifest = json.loads(manifest_path.read_text())
    updated_manifest = {
        **manifest,
        "status": status,
        "files": list(files_changed),
        "context_summary": context_summary,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path.write_text(json.dumps(updated_manifest, indent=2))

    latest_path = _snapshots_dir(output_dir) / "latest.json"
    latest = {"run_id": run_id}
    latest_path.write_text(json.dumps(latest, indent=2))

    _prune_snapshots(_snapshots_dir(output_dir))


def _prune_snapshots(snapshots_dir: Path) -> None:
    """Keep only the last MAX_FULL_SNAPSHOTS full snapshots.

    Older snapshots are reduced to manifest-only (all captured files
    are deleted) and the manifest status is set to "pruned".
    """
    snapshot_dirs = sorted(
        [
            d
            for d in snapshots_dir.iterdir()
            if d.is_dir() and (d / "manifest.json").is_file()
        ],
        key=lambda d: d.name,
        reverse=True,
    )

    for old_dir in snapshot_dirs[MAX_FULL_SNAPSHOTS:]:
        manifest_path = old_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text())

        if manifest.get("status") == "pruned":
            continue

        # Delete all files except manifest.json
        for item in list(old_dir.rglob("*")):
            if item.is_file() and item.name != "manifest.json":
                item.unlink()

        # Remove now-empty subdirectories
        for item in sorted(old_dir.rglob("*"), reverse=True):
            if item.is_dir():
                try:
                    item.rmdir()
                except OSError:
                    pass

        pruned_manifest = {**manifest, "status": "pruned"}
        manifest_path.write_text(json.dumps(pruned_manifest, indent=2))


def list_snapshots(output_dir: str) -> list[dict]:
    """List all snapshot manifests, newest first.

    Args:
        output_dir: The project output directory.

    Returns:
        A list of manifest dicts sorted by run_id descending.
    """
    snapshots_path = _snapshots_dir(output_dir)
    if not snapshots_path.is_dir():
        return []

    manifests = []
    for d in snapshots_path.iterdir():
        if not d.is_dir():
            continue
        manifest_path = d / "manifest.json"
        if manifest_path.is_file():
            try:
                manifest = json.loads(manifest_path.read_text())
                manifests.append(manifest)
            except (json.JSONDecodeError, OSError):
                continue

    return sorted(manifests, key=lambda m: m.get("run_id", ""), reverse=True)


def restore_snapshot(output_dir: str, run_id: str) -> list[str] | None:
    """Restore files from a snapshot back to the output directory.

    Args:
        output_dir: The project output directory.
        run_id: The snapshot run ID to restore.

    Returns:
        A list of restored relative paths, or None if the snapshot
        is pruned or does not exist.
    """
    snap_dir = _snapshot_dir(output_dir, run_id)
    manifest_path = snap_dir / "manifest.json"

    if not manifest_path.is_file():
        return None

    manifest = json.loads(manifest_path.read_text())

    if manifest.get("status") == "pruned":
        return None

    restored_files = []
    base = Path(output_dir)

    for rel_path_str in manifest.get("files", []):
        if not _is_safe_relative_path(output_dir, rel_path_str):
            continue

        snapshot_file = snap_dir / rel_path_str
        if not snapshot_file.is_file():
            continue

        dest = base / rel_path_str
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(snapshot_file), str(dest))
        restored_files.append(rel_path_str)

    return restored_files
