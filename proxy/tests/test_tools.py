import subprocess
from unittest.mock import patch, MagicMock

from agents.tools import execute_run_tests, TOOL_DEFINITIONS


class TestRunTestsToolDefinition:
    def test_run_tests_tool_in_definitions(self):
        """Verify that 'run_tests' appears in TOOL_DEFINITIONS."""
        tool_names = [t["name"] for t in TOOL_DEFINITIONS]
        assert "run_tests" in tool_names


class TestExecuteRunTests:
    @patch("agents.tools.subprocess.run")
    def test_execute_run_tests_returns_output(self, mock_run):
        """Mock subprocess.run with returncode=0, verify PASS output."""
        mock_run.return_value = MagicMock(
            stdout="4 passed in 0.5s",
            stderr="",
            returncode=0,
        )
        result = execute_run_tests("pytest tests/")
        assert "[PASS]" in result
        assert "Exit code: 0" in result
        assert "4 passed" in result

    @patch("agents.tools.subprocess.run")
    def test_execute_run_tests_failure(self, mock_run):
        """Mock subprocess.run with returncode=1, verify FAIL output."""
        mock_run.return_value = MagicMock(
            stdout="1 failed, 3 passed",
            stderr="FAILURES",
            returncode=1,
        )
        result = execute_run_tests("pytest tests/")
        assert "[FAIL]" in result
        assert "Exit code: 1" in result
        assert "1 failed" in result

    @patch("agents.tools.subprocess.run")
    def test_execute_run_tests_timeout(self, mock_run):
        """Mock subprocess.run raising TimeoutExpired, verify timeout message."""
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd="pytest tests/", timeout=60
        )
        result = execute_run_tests("pytest tests/")
        assert "timed out" in result.lower()
