"""Deterministic source file editor for simple CSS property changes."""

import re
from pathlib import Path
from typing import Any

# CSS properties that can be safely edited deterministically
DETERMINISTIC_PROPERTIES = {
    "color", "backgroundColor", "background-color",
    "borderColor", "border-color",
    "fontSize", "font-size",
    "fontWeight", "font-weight",
    "fontFamily", "font-family",
    "lineHeight", "line-height",
    "letterSpacing", "letter-spacing",
    "marginTop", "margin-top",
    "marginRight", "margin-right",
    "marginBottom", "margin-bottom",
    "marginLeft", "margin-left",
    "paddingTop", "padding-top",
    "paddingRight", "padding-right",
    "paddingBottom", "padding-bottom",
    "paddingLeft", "padding-left",
    "display", "width", "height",
    "opacity", "gap",
    "flexDirection", "flex-direction",
    "alignItems", "align-items",
    "justifyContent", "justify-content",
}

AI_ONLY_PROPERTIES = {"textContent"}


def partition_edits(edits: list[dict[str, Any]]) -> tuple[list[dict], list[dict]]:
    """Split edits into deterministic (direct file write) and AI-assisted groups.

    For each element's changes:
    - CSS properties WITH source mapping -> deterministic
    - textContent or any property WITHOUT source mapping -> AI-assisted

    Returns (deterministic, ai_assisted) tuple.
    """
    deterministic = []
    ai_assisted = []

    for edit in edits:
        has_source = (
            edit.get("sourceFile") is not None
            and edit.get("sourceLine") is not None
        )
        det_changes = []
        ai_changes = []

        for change in edit.get("changes", []):
            prop = change.get("property", "")
            if has_source and prop in DETERMINISTIC_PROPERTIES:
                det_changes.append(change)
            else:
                ai_changes.append(change)

        if det_changes:
            deterministic.append({**edit, "changes": det_changes})
        if ai_changes:
            ai_assisted.append({**edit, "changes": ai_changes})

    return deterministic, ai_assisted


def camel_to_kebab(name: str) -> str:
    """Convert camelCase CSS property to kebab-case."""
    return re.sub(r"([A-Z])", r"-\1", name).lower()


def apply_inline_style_edit(
    project_dir: Path,
    source_file: str,
    source_line: int,
    property_name: str,
    new_value: str,
) -> bool:
    """Apply a CSS property change to an inline style object in a JSX file.

    Looks for `property: 'value'` or `property: "value"` patterns near the source line.
    Returns True if the edit was applied.
    """
    file_path = project_dir / source_file
    if not file_path.is_file():
        return False

    # Path traversal protection
    try:
        resolved = file_path.resolve()
        if not str(resolved).startswith(str(project_dir.resolve())):
            return False
    except (ValueError, OSError):
        return False

    content = file_path.read_text()
    lines = content.split("\n")

    line_idx = source_line - 1
    search_start = max(0, line_idx - 5)
    search_end = min(len(lines), line_idx + 15)

    camel_prop = property_name
    pattern = re.compile(
        rf"""({re.escape(camel_prop)}\s*:\s*)(['"])([^'"]*)\2"""
    )

    for i in range(search_start, search_end):
        match = pattern.search(lines[i])
        if match:
            lines[i] = (
                lines[i][:match.start()]
                + f"{match.group(1)}'{new_value}'"
                + lines[i][match.end():]
            )
            file_path.write_text("\n".join(lines))
            return True

    return False


def apply_css_class_edit(
    project_dir: Path,
    css_file: str,
    selector: str,
    property_name: str,
    new_value: str,
) -> bool:
    """Apply a CSS property change in a CSS/SCSS file."""
    file_path = project_dir / css_file
    if not file_path.is_file():
        return False

    # Path traversal protection
    try:
        resolved = file_path.resolve()
        if not str(resolved).startswith(str(project_dir.resolve())):
            return False
    except (ValueError, OSError):
        return False

    content = file_path.read_text()
    kebab_prop = camel_to_kebab(property_name)

    escaped_selector = re.escape(selector)
    block_pattern = re.compile(
        rf"({escaped_selector}\s*\{{[^}}]*?)({re.escape(kebab_prop)}\s*:\s*)([^;]+)(;[^}}]*\}})",
        re.DOTALL,
    )

    match = block_pattern.search(content)
    if match:
        new_content = (
            content[:match.start()]
            + match.group(1)
            + f"{kebab_prop}: {new_value}"
            + match.group(4)
            + content[match.end():]
        )
        file_path.write_text(new_content)
        return True

    return False
