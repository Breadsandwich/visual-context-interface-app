import pytest
from pathlib import Path
from source_editor import (
    partition_edits,
    apply_inline_style_edit,
    apply_css_class_edit,
    camel_to_kebab,
)


class TestPartitionEdits:
    def test_simple_css_with_source_goes_deterministic(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": "src/Button.tsx",
            "sourceLine": 5,
            "componentName": "Button",
            "changes": [{"property": "backgroundColor", "value": "#0066ff", "original": "#cccccc"}],
        }]
        deterministic, ai_assisted = partition_edits(edits)
        assert len(deterministic) == 1
        assert len(ai_assisted) == 0

    def test_text_content_goes_to_ai(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": "src/Button.tsx",
            "sourceLine": 5,
            "componentName": "Button",
            "changes": [{"property": "textContent", "value": "Submit", "original": "Click"}],
        }]
        deterministic, ai_assisted = partition_edits(edits)
        assert len(deterministic) == 0
        assert len(ai_assisted) == 1

    def test_no_source_goes_to_ai(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": None,
            "sourceLine": None,
            "componentName": None,
            "changes": [{"property": "backgroundColor", "value": "#0066ff", "original": "#cccccc"}],
        }]
        deterministic, ai_assisted = partition_edits(edits)
        assert len(deterministic) == 0
        assert len(ai_assisted) == 1

    def test_mixed_edits_partition_correctly(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": "src/Button.tsx",
            "sourceLine": 5,
            "componentName": "Button",
            "changes": [
                {"property": "backgroundColor", "value": "#0066ff", "original": "#cccccc"},
                {"property": "textContent", "value": "Submit", "original": "Click"},
            ],
        }]
        deterministic, ai_assisted = partition_edits(edits)
        assert len(deterministic) == 1
        assert len(deterministic[0]["changes"]) == 1
        assert deterministic[0]["changes"][0]["property"] == "backgroundColor"
        assert len(ai_assisted) == 1
        assert ai_assisted[0]["changes"][0]["property"] == "textContent"

    def test_empty_edits(self):
        deterministic, ai_assisted = partition_edits([])
        assert deterministic == []
        assert ai_assisted == []

    def test_preserves_edit_metadata(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": "src/Button.tsx",
            "sourceLine": 5,
            "componentName": "Button",
            "changes": [{"property": "color", "value": "red", "original": "black"}],
        }]
        deterministic, _ = partition_edits(edits)
        assert deterministic[0]["selector"] == ".btn"
        assert deterministic[0]["sourceFile"] == "src/Button.tsx"
        assert deterministic[0]["sourceLine"] == 5


class TestCamelToKebab:
    def test_simple_conversion(self):
        assert camel_to_kebab("backgroundColor") == "background-color"

    def test_multiple_capitals(self):
        assert camel_to_kebab("borderTopLeftRadius") == "border-top-left-radius"

    def test_already_lowercase(self):
        assert camel_to_kebab("color") == "color"


class TestApplyInlineStyleEdit:
    def test_applies_style_change(self, tmp_path):
        comp = tmp_path / "src" / "Button.tsx"
        comp.parent.mkdir(parents=True)
        comp.write_text(
            "export function Button() {\n"
            "  return (\n"
            "    <button style={{ backgroundColor: '#cccccc', fontSize: '14px' }}>\n"
            "      Click\n"
            "    </button>\n"
            "  )\n"
            "}\n"
        )
        result = apply_inline_style_edit(
            tmp_path, "src/Button.tsx", 3, "backgroundColor", "#0066ff"
        )
        assert result is True
        content = comp.read_text()
        assert "'#0066ff'" in content

    def test_returns_false_for_missing_file(self, tmp_path):
        result = apply_inline_style_edit(
            tmp_path, "nonexistent.tsx", 1, "color", "red"
        )
        assert result is False

    def test_returns_false_for_missing_property(self, tmp_path):
        comp = tmp_path / "src" / "Button.tsx"
        comp.parent.mkdir(parents=True)
        comp.write_text(
            "export function Button() { return <button>Click</button> }"
        )
        result = apply_inline_style_edit(
            tmp_path, "src/Button.tsx", 1, "backgroundColor", "#0066ff"
        )
        assert result is False

    def test_rejects_path_traversal(self, tmp_path):
        result = apply_inline_style_edit(
            tmp_path, "../../../etc/passwd", 1, "color", "red"
        )
        assert result is False


class TestApplyCssClassEdit:
    def test_applies_css_change(self, tmp_path):
        css = tmp_path / "styles.css"
        css.write_text(
            ".btn-primary {\n"
            "  background-color: #cccccc;\n"
            "  font-size: 14px;\n"
            "}\n"
        )
        result = apply_css_class_edit(
            tmp_path, "styles.css", ".btn-primary", "backgroundColor", "#0066ff"
        )
        assert result is True
        content = css.read_text()
        assert "background-color: #0066ff" in content

    def test_returns_false_for_missing_selector(self, tmp_path):
        css = tmp_path / "styles.css"
        css.write_text(".other { color: red; }")
        result = apply_css_class_edit(
            tmp_path, "styles.css", ".missing", "color", "blue"
        )
        assert result is False

    def test_returns_false_for_missing_file(self, tmp_path):
        result = apply_css_class_edit(
            tmp_path, "nonexistent.css", ".btn", "color", "blue"
        )
        assert result is False

    def test_rejects_path_traversal(self, tmp_path):
        result = apply_css_class_edit(
            tmp_path, "../../../etc/shadow", ".btn", "color", "red"
        )
        assert result is False
