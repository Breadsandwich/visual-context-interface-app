import os
import tempfile
from unittest.mock import patch

import pytest
from formatter import _build_preloaded_files, _format_edits, _format_element, format_payload


class TestFormatEdits:
    def test_returns_empty_for_none(self):
        assert _format_edits(None) == []

    def test_returns_empty_for_empty_list(self):
        assert _format_edits([]) == []

    def test_single_edit(self):
        edits = [{"property": "color", "original": "red", "value": "blue"}]
        lines = _format_edits(edits)
        assert lines[0] == "   - Requested edits:"
        assert lines[1] == "     - `color`: `red` -> `blue`"

    def test_multiple_edits(self):
        edits = [
            {"property": "color", "original": "red", "value": "blue"},
            {"property": "fontSize", "original": "12px", "value": "16px"},
        ]
        lines = _format_edits(edits)
        assert len(lines) == 3
        assert "`color`" in lines[1]
        assert "`fontSize`" in lines[2]

    def test_escapes_backticks(self):
        edits = [{"property": "content", "original": "`old`", "value": "`new`"}]
        lines = _format_edits(edits)
        assert "`" not in lines[1].replace("`content`", "").replace("`'old'`", "").replace("`'new'`", "")
        assert "'old'" in lines[1]
        assert "'new'" in lines[1]

    def test_handles_missing_keys(self):
        edits = [{}]
        lines = _format_edits(edits)
        assert lines[0] == "   - Requested edits:"
        assert lines[1] == "     - ``: `` -> ``"


class TestFormatElement:
    def test_includes_saved_edits(self):
        ctx = {
            "tagName": "button",
            "selector": ".btn",
            "savedEdits": [
                {"property": "color", "original": "red", "value": "blue"},
            ],
        }
        lines = _format_element(ctx, 0)
        joined = "\n".join(lines)
        assert "Requested edits:" in joined
        assert "`color`: `red` -> `blue`" in joined

    def test_no_edits_section_without_saved_edits(self):
        ctx = {"tagName": "div", "selector": ".box"}
        lines = _format_element(ctx, 0)
        joined = "\n".join(lines)
        assert "Requested edits:" not in joined


class TestBuildPreloadedFiles:
    def test_returns_empty_for_no_files(self):
        result = _build_preloaded_files(None, None)
        assert result == ""

    def test_preloads_context_source_files(self, tmp_path):
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("function App() { return <div /> }\n")

        contexts = [{"sourceFile": "src/App.jsx", "tagName": "div", "selector": ".app"}]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert "### Pre-loaded Files" in result
        assert "src/App.jsx" in result
        assert "function App()" in result

    def test_preloads_backend_map_files(self, tmp_path):
        models = tmp_path / "api" / "models.py"
        models.parent.mkdir(parents=True)
        models.write_text("class Task:\n    name: str\n")

        backend_map = {
            "endpoints": [],
            "models": [{"name": "Task", "file": "api/models.py", "line": 1, "fields": []}],
        }

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(None, backend_map)

        assert "api/models.py" in result
        assert "class Task:" in result

    def test_skips_files_over_line_limit(self, tmp_path):
        big_file = tmp_path / "src" / "Big.jsx"
        big_file.parent.mkdir(parents=True)
        big_file.write_text("\n".join(f"line {i}" for i in range(250)))

        contexts = [{"sourceFile": "src/Big.jsx", "tagName": "div", "selector": ".big"}]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert result == ""

    def test_respects_token_budget(self, tmp_path):
        file_a = tmp_path / "a.jsx"
        file_a.write_text("x" * 19000)  # ~4750 tokens, close to 5000 cap

        file_b = tmp_path / "b.jsx"
        file_b.write_text("y" * 4000)  # ~1000 tokens, would exceed cap

        contexts = [
            {"sourceFile": "a.jsx", "tagName": "div", "selector": ".a"},
            {"sourceFile": "b.jsx", "tagName": "div", "selector": ".b"},
        ]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert "a.jsx" in result
        assert "b.jsx" not in result

    def test_deduplicates_files(self, tmp_path):
        src = tmp_path / "src" / "App.jsx"
        src.parent.mkdir(parents=True)
        src.write_text("export default App\n")

        contexts = [
            {"sourceFile": "src/App.jsx", "tagName": "div", "selector": ".a"},
            {"sourceFile": "src/App.jsx", "tagName": "span", "selector": ".b"},
        ]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert result.count("#### `src/App.jsx`") == 1

    def test_rejects_path_traversal(self, tmp_path):
        secret = tmp_path.parent / "secret.txt"
        secret.write_text("password=hunter2\n")

        contexts = [{"sourceFile": "../../secret.txt", "tagName": "div", "selector": ".x"}]

        with patch.dict(os.environ, {"VCI_OUTPUT_DIR": str(tmp_path)}):
            result = _build_preloaded_files(contexts, None)

        assert result == ""
        assert "hunter2" not in result


class TestFormatPayloadWithEdits:
    def test_edits_appear_in_full_payload(self):
        payload = {
            "contexts": [
                {
                    "tagName": "h1",
                    "selector": "h1.title",
                    "sourceFile": "src/App.tsx",
                    "sourceLine": 10,
                    "savedEdits": [
                        {"property": "textContent", "original": "Hello", "value": "Welcome"},
                    ],
                }
            ],
        }
        result = format_payload(payload)
        assert "Requested edits:" in result
        assert "`textContent`: `Hello` -> `Welcome`" in result
