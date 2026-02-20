"""Sandboxed file tools for the VCI headless agent.

All operations are confined to VCI_OUTPUT_DIR via path resolution checks.
"""

import glob as glob_module
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MAX_READ_SIZE = 1 * 1024 * 1024   # 1MB
MAX_WRITE_SIZE = 500 * 1024        # 500KB
MAX_WRITES_PER_RUN = 20

# Files that must never be written by the agent (security blocklist)
BLOCKED_FILENAMES = frozenset({
    ".env", ".env.local", ".env.production", ".env.development",
    ".bashrc", ".zshrc", ".profile", ".bash_profile",
    ".npmrc", ".yarnrc", ".gitconfig",
})

BLOCKED_EXTENSIONS = frozenset({
    ".sh", ".bash", ".zsh", ".exe", ".bat", ".cmd",
})

# ─── Path Validation ────────────────────────────────────────────────


def _get_base_dir() -> Path:
    """Return the resolved base directory for all file operations."""
    return Path(os.getenv("VCI_OUTPUT_DIR", "/output")).resolve()


def _resolve_safe_path(user_path: str) -> tuple[Path | None, str | None]:
    """Resolve a user-provided path and verify it stays within the sandbox.

    Checks for symlinks that escape the sandbox to prevent TOCTOU attacks.
    Returns (resolved_path, error_message). One will always be None.
    """
    base = _get_base_dir()
    try:
        target = (base / user_path).resolve()
    except (ValueError, OSError) as exc:
        return None, f"Invalid path: {exc}"

    if not target.is_relative_to(base):
        return None, "Path outside project directory"

    # Walk each path component to detect symlinks escaping the sandbox
    current = base / user_path
    for parent in [current, *current.parents]:
        if parent == base or not str(parent).startswith(str(base)):
            break
        if parent.is_symlink():
            link_target = parent.resolve()
            if not link_target.is_relative_to(base):
                return None, "Symlink escapes project directory"

    return target, None


# ─── Tool Definitions (for Claude API) ──────────────────────────────

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "read_file",
        "description": (
            "Read the contents of a file by relative path. "
            "Returns the file content as a string. Max 1MB."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from the project root (e.g. 'src/App.tsx')",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write content to a file. Creates parent directories if needed. "
            "Overwrites existing files. Max 500KB."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path from the project root",
                },
                "content": {
                    "type": "string",
                    "description": "The full file content to write",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "list_directory",
        "description": (
            "List the contents of a directory. "
            "Returns file and subdirectory names."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative directory path (e.g. 'src/components'). Use '.' for project root.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_files",
        "description": (
            "Search for files matching a glob pattern. "
            "Returns matching file paths relative to the project root."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern (e.g. 'src/**/*.tsx', '**/*.css')",
                },
            },
            "required": ["pattern"],
        },
    },
]


# ─── Tool Execution ─────────────────────────────────────────────────


def execute_read_file(path: str) -> str:
    """Read a file within the sandbox."""
    target, error = _resolve_safe_path(path)
    if error:
        return f"Error: {error}"

    if not target.is_file():
        return f"Error: File not found: {path}"

    size = target.stat().st_size
    if size > MAX_READ_SIZE:
        return f"Error: File too large ({size:,} bytes, max {MAX_READ_SIZE:,})"

    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"Error: File is not valid UTF-8 text: {path}"
    except OSError as exc:
        return f"Error reading file: {exc}"


def execute_write_file(path: str, content: str, write_count: int, run_id: str | None = None) -> str:
    """Write a file within the sandbox. Optionally captures snapshot before overwriting."""
    if write_count >= MAX_WRITES_PER_RUN:
        return f"Error: Maximum write limit reached ({MAX_WRITES_PER_RUN} files per run)"

    # Block writes to sensitive files
    filename = Path(path).name.lower()
    if filename in BLOCKED_FILENAMES:
        return f"Error: Writing to {filename} is not allowed"
    if Path(path).suffix.lower() in BLOCKED_EXTENSIONS:
        return f"Error: Writing files with {Path(path).suffix} extension is not allowed"

    target, error = _resolve_safe_path(path)
    if error:
        return f"Error: {error}"

    content_bytes = content.encode("utf-8")
    if len(content_bytes) > MAX_WRITE_SIZE:
        return f"Error: Content too large ({len(content_bytes):,} bytes, max {MAX_WRITE_SIZE:,})"

    # Capture snapshot before overwriting (if run_id provided and file exists)
    if run_id and target.is_file():
        from snapshot import capture_file
        capture_file(str(_get_base_dir()), run_id, path)

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"Successfully wrote {len(content_bytes):,} bytes to {path}"
    except OSError as exc:
        return f"Error writing file: {exc}"


def execute_list_directory(path: str) -> str:
    """List contents of a directory within the sandbox."""
    target, error = _resolve_safe_path(path)
    if error:
        return f"Error: {error}"

    if not target.is_dir():
        return f"Error: Directory not found: {path}"

    try:
        entries = sorted(target.iterdir())
        lines: list[str] = []
        for entry in entries[:200]:  # Cap at 200 entries
            suffix = "/" if entry.is_dir() else ""
            lines.append(f"{entry.name}{suffix}")
        if len(entries) > 200:
            lines.append(f"... and {len(entries) - 200} more entries")
        return "\n".join(lines) if lines else "(empty directory)"
    except OSError as exc:
        return f"Error listing directory: {exc}"


def execute_search_files(pattern: str) -> str:
    """Search for files matching a glob pattern within the sandbox."""
    base = _get_base_dir()

    # Prevent pattern from escaping sandbox
    if ".." in pattern:
        return "Error: Pattern must not contain '..'"

    if os.path.isabs(pattern):
        return "Error: Pattern must be a relative path"

    try:
        full_pattern = str(base / pattern)
        matches = sorted(glob_module.glob(full_pattern, recursive=True))

        # Filter to ensure all matches are within base (safe boundary check)
        safe_matches = [
            m for m in matches
            if Path(m).resolve().is_relative_to(base)
        ]

        # Return relative paths
        relative = [os.path.relpath(m, base) for m in safe_matches[:100]]

        if not relative:
            return "No files matched the pattern."
        result = "\n".join(relative)
        if len(safe_matches) > 100:
            result += f"\n... and {len(safe_matches) - 100} more matches"
        return result
    except OSError as exc:
        return f"Error searching files: {exc}"


def execute_tool(
    tool_name: str, tool_input: dict, write_count: int, run_id: str | None = None
) -> tuple[str, int]:
    """Dispatch a tool call. Returns (result_text, updated_write_count)."""
    if tool_name == "read_file":
        result = execute_read_file(tool_input.get("path", ""))
    elif tool_name == "write_file":
        result = execute_write_file(
            tool_input.get("path", ""),
            tool_input.get("content", ""),
            write_count,
            run_id,
        )
        if not result.startswith("Error"):
            write_count += 1
    elif tool_name == "list_directory":
        result = execute_list_directory(tool_input.get("path", ""))
    elif tool_name == "search_files":
        result = execute_search_files(tool_input.get("pattern", ""))
    else:
        result = f"Error: Unknown tool '{tool_name}'"

    return result, write_count
