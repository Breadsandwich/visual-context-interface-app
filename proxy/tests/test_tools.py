import subprocess
from unittest.mock import patch, MagicMock

from agents.tools import execute_run_tests, execute_write_file, TOOL_DEFINITIONS


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


class TestWriteFileDocBlock:
    def test_blocks_markdown_files(self):
        """write_file rejects .md files."""
        result = execute_write_file("NOTES.md", "some content", 0)
        assert result.startswith("Error")
        assert ".md" in result

    def test_blocks_txt_files(self):
        """write_file rejects .txt files."""
        result = execute_write_file("readme.txt", "content", 0)
        assert result.startswith("Error")
        assert ".txt" in result

    def test_blocks_log_files(self):
        """write_file rejects .log files."""
        result = execute_write_file("debug.log", "content", 0)
        assert result.startswith("Error")
        assert ".log" in result

    def test_blocks_rst_files(self):
        """write_file rejects .rst files."""
        result = execute_write_file("docs.rst", "content", 0)
        assert result.startswith("Error")
        assert ".rst" in result

    def test_blocks_demo_prefix(self):
        """write_file rejects files starting with 'demo_'."""
        result = execute_write_file("demo_feature.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_verify_prefix(self):
        """write_file rejects files starting with 'verify_'."""
        result = execute_write_file("verify_models.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_verification_prefix(self):
        """write_file rejects files starting with 'verification_'."""
        result = execute_write_file("verification_summary.py", "content", 0)
        assert result.startswith("Error")

    def test_blocks_check_prefix(self):
        """write_file rejects files starting with 'check_'."""
        result = execute_write_file("check_models.py", "content", 0)
        assert result.startswith("Error")

    def test_allows_test_prefix(self):
        """write_file allows test_ prefix .py files (these are legitimate tests)."""
        result = execute_write_file("test_models.py", "content", 0)
        assert "Cannot write utility" not in result


class TestRunTestsSuiteParameter:
    @patch("agents.tools.subprocess.run")
    def test_suite_selects_backend_command(self, mock_run):
        """suite='backend' picks pytest command from test_commands dict."""
        mock_run.return_value = MagicMock(
            stdout="5 passed", stderr="", returncode=0,
        )
        result = execute_run_tests(
            test_commands={"backend": "python -m pytest", "frontend": "npm test"},
            suite="backend",
        )
        assert "[PASS]" in result
        cmd_args = mock_run.call_args[0][0]
        assert "pytest" in " ".join(cmd_args)

    @patch("agents.tools.subprocess.run")
    def test_suite_selects_frontend_command(self, mock_run):
        """suite='frontend' runs npm test."""
        mock_run.return_value = MagicMock(
            stdout="Tests passed", stderr="", returncode=0,
        )
        result = execute_run_tests(
            test_commands={"backend": "python -m pytest", "frontend": "npm test"},
            suite="frontend",
        )
        assert "[PASS]" in result
        cmd_args = mock_run.call_args[0][0]
        assert "npm" in " ".join(cmd_args)

    @patch("agents.tools.subprocess.run")
    def test_invalid_suite_returns_error(self, mock_run):
        """Unknown suite returns error without running anything."""
        result = execute_run_tests(
            test_commands={"backend": "pytest", "frontend": "npm test"},
            suite="database",
        )
        assert "Error" in result
        mock_run.assert_not_called()

    @patch("agents.tools.subprocess.run")
    def test_legacy_test_command_still_works(self, mock_run):
        """Backward compat: string test_command still works."""
        mock_run.return_value = MagicMock(
            stdout="ok", stderr="", returncode=0,
        )
        result = execute_run_tests(test_command="pytest tests/")
        assert "[PASS]" in result

    @patch("agents.tools.subprocess.run")
    def test_no_command_returns_error(self, mock_run):
        """Returns error when no test_command or test_commands provided."""
        result = execute_run_tests()
        assert "Error" in result
        mock_run.assert_not_called()
