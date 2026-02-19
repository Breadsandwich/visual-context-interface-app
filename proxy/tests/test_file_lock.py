import pytest
from agents.file_lock import FileLockManager


class TestAcquireLocks:
    def test_acquire_locks(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx", "src/index.ts"])
        assert manager.is_locked_by("worker-1", "src/App.tsx") is True
        assert manager.is_locked_by("worker-1", "src/index.ts") is True

    def test_cannot_acquire_already_locked(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        with pytest.raises(ValueError, match="src/App.tsx"):
            manager.acquire("worker-2", ["src/App.tsx"])

    def test_acquire_is_atomic_on_conflict(self):
        """If any file in the list is already locked, none should be acquired."""
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        with pytest.raises(ValueError):
            manager.acquire("worker-2", ["src/index.ts", "src/App.tsx"])
        # src/index.ts should NOT have been locked by worker-2
        assert manager.is_locked_by("worker-2", "src/index.ts") is False
        assert manager.can_write("worker-2", "src/index.ts") is True

    def test_same_worker_can_reacquire_own_locks(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        # Should not raise — worker-1 already holds it
        manager.acquire("worker-1", ["src/App.tsx", "src/index.ts"])
        assert manager.is_locked_by("worker-1", "src/App.tsx") is True
        assert manager.is_locked_by("worker-1", "src/index.ts") is True


class TestCanWrite:
    def test_can_write_own_locked_file(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        assert manager.can_write("worker-1", "src/App.tsx") is True

    def test_cannot_write_other_locked_file(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        assert manager.can_write("worker-2", "src/App.tsx") is False

    def test_can_write_unlocked_file(self):
        manager = FileLockManager()
        assert manager.can_write("worker-1", "src/App.tsx") is True


class TestIsLockedBy:
    def test_is_locked_by_correct_worker(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        assert manager.is_locked_by("worker-1", "src/App.tsx") is True

    def test_is_locked_by_wrong_worker(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        assert manager.is_locked_by("worker-2", "src/App.tsx") is False

    def test_is_locked_by_unlocked_file(self):
        manager = FileLockManager()
        assert manager.is_locked_by("worker-1", "src/App.tsx") is False


class TestRelease:
    def test_release_locks(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx", "src/index.ts"])
        manager.release("worker-1")
        assert manager.is_locked_by("worker-1", "src/App.tsx") is False
        assert manager.is_locked_by("worker-1", "src/index.ts") is False
        # Files should now be available for another worker
        manager.acquire("worker-2", ["src/App.tsx"])
        assert manager.is_locked_by("worker-2", "src/App.tsx") is True

    def test_release_only_affects_target_worker(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        manager.acquire("worker-2", ["src/index.ts"])
        manager.release("worker-1")
        assert manager.is_locked_by("worker-1", "src/App.tsx") is False
        assert manager.is_locked_by("worker-2", "src/index.ts") is True

    def test_release_nonexistent_worker_is_noop(self):
        manager = FileLockManager()
        # Should not raise
        manager.release("worker-999")


class TestReleaseAll:
    def test_release_all(self):
        manager = FileLockManager()
        manager.acquire("worker-1", ["src/App.tsx"])
        manager.acquire("worker-2", ["src/index.ts"])
        manager.release_all()
        assert manager.can_write("worker-1", "src/App.tsx") is True
        assert manager.can_write("worker-2", "src/index.ts") is True
        assert manager.is_locked_by("worker-1", "src/App.tsx") is False
        assert manager.is_locked_by("worker-2", "src/index.ts") is False
