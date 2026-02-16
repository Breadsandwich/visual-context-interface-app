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


def _is_safe_path(project_dir: Path, file_path: Path) -> bool:
    """Check that resolved path stays within the project directory."""
    try:
        resolved = file_path.resolve()
        return str(resolved).startswith(str(project_dir.resolve()))
    except (ValueError, OSError):
        return False


def find_css_file(project_dir: Path, source_file: str) -> Path | None:
    """Find CSS file associated with a JSX/TSX/JS/TS source file.

    Tries common naming conventions: Home.jsx -> Home.css, Home.module.css, etc.
    """
    jsx_path = project_dir / source_file
    stem = jsx_path.stem
    parent = jsx_path.parent

    for ext in [".css", ".scss", ".module.css", ".module.scss"]:
        css_path = parent / f"{stem}{ext}"
        if css_path.is_file() and _is_safe_path(project_dir, css_path):
            return css_path

    return None


def extract_classes_from_selector(selector: str) -> list[str]:
    """Extract class names from a DOM selector path.

    '#root > div.app > main.main > section.hero:nth-child(1)' -> ['app', 'main', 'hero']
    Returns classes in reverse order (most specific first).
    """
    classes = re.findall(r"\.([a-zA-Z_][\w-]*)", selector)
    return list(reversed(classes))


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

    if not _is_safe_path(project_dir, file_path):
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
    css_file_path: Path,
    classes: list[str],
    property_name: str,
    new_value: str,
) -> bool:
    """Apply a CSS property change in a CSS file by matching class selectors.

    Tries each class name from the element, looking for a rule that contains
    the target property. Updates the value if found, or adds the property
    to the first matching rule block if not.
    """
    if not css_file_path.is_file():
        return False

    content = css_file_path.read_text()
    kebab_prop = camel_to_kebab(property_name)

    for class_name in classes:
        # Match .className { ... kebab-prop: value; ... }
        update_pattern = re.compile(
            rf"(\.{re.escape(class_name)}\s*\{{[^}}]*?)"
            rf"({re.escape(kebab_prop)}\s*:\s*)([^;]+)"
            rf"(;[^}}]*\}})",
            re.DOTALL,
        )
        match = update_pattern.search(content)
        if match:
            new_content = (
                content[:match.start()]
                + match.group(1)
                + f"{kebab_prop}: {new_value}"
                + match.group(4)
                + content[match.end():]
            )
            css_file_path.write_text(new_content)
            return True

        # Property not in the rule — try to add it before the closing brace
        add_pattern = re.compile(
            rf"(\.{re.escape(class_name)}\s*\{{[^}}]*?)"
            rf"(\}})",
            re.DOTALL,
        )
        add_match = add_pattern.search(content)
        if add_match:
            block_before = add_match.group(1).rstrip()
            # Detect indentation from existing content
            existing_lines = block_before.split("\n")
            indent = "  "
            if len(existing_lines) > 1:
                last_prop_line = existing_lines[-1]
                leading = re.match(r"^(\s+)", last_prop_line)
                if leading:
                    indent = leading.group(1)
            new_content = (
                content[:add_match.start()]
                + block_before + "\n"
                + f"{indent}{kebab_prop}: {new_value};\n"
                + add_match.group(2)
                + content[add_match.end():]
            )
            css_file_path.write_text(new_content)
            return True

    return False
