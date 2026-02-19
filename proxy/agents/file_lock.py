"""File lock manager for multi-agent write coordination.

Ensures that multiple agent workers do not write to the same file
concurrently. Locks are acquired atomically: either all requested
files are locked or none are.
"""

from __future__ import annotations

import threading


class FileLockManager:
    """Thread-safe file lock manager mapping file paths to worker IDs.

    Internal state:
        _locks: dict mapping file_path -> worker_id
        _lock: threading.Lock for thread-safe access
    """

    def __init__(self) -> None:
        self._locks: dict[str, str] = {}
        self._lock = threading.Lock()

    def acquire(self, worker_id: str, file_paths: list[str]) -> None:
        """Acquire locks on files for a worker.

        Atomic: all files are locked or none are. A worker may re-acquire
        files it already holds without error.

        Args:
            worker_id: Identifier of the requesting worker.
            file_paths: List of file paths to lock.

        Raises:
            ValueError: If any file is already locked by a different worker.
                The message includes the conflicting file path and the
                worker that holds the lock.
        """
        with self._lock:
            # Check all files first (atomic: validate before mutating)
            conflicts: list[str] = []
            for path in file_paths:
                holder = self._locks.get(path)
                if holder is not None and holder != worker_id:
                    conflicts.append(
                        f"{path} (locked by {holder})"
                    )

            if conflicts:
                raise ValueError(
                    f"Cannot acquire locks -- files already locked: "
                    f"{', '.join(conflicts)}"
                )

            # All clear -- apply locks
            for path in file_paths:
                self._locks[path] = worker_id

    def can_write(self, worker_id: str, file_path: str) -> bool:
        """Check whether a worker may write to a file.

        Returns True if the file is unlocked or locked by this worker.
        """
        with self._lock:
            holder = self._locks.get(file_path)
            return holder is None or holder == worker_id

    def is_locked_by(self, worker_id: str, file_path: str) -> bool:
        """Check whether a specific worker holds the lock on a file."""
        with self._lock:
            return self._locks.get(file_path) == worker_id

    def release(self, worker_id: str) -> None:
        """Release all locks held by a worker."""
        with self._lock:
            self._locks = {
                path: holder
                for path, holder in self._locks.items()
                if holder != worker_id
            }

    def release_all(self) -> None:
        """Release all locks from all workers."""
        with self._lock:
            self._locks = {}
