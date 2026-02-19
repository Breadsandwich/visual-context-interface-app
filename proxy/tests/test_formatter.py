import pytest
from formatter import _format_edits, _format_element, format_payload


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
