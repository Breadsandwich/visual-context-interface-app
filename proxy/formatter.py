"""VCI Prompt Formatter — Python port of cli/lib/formatter.js.

Formats VCI context payloads into structured prompts for the agent,
using a multi-pass budget strategy to fit within token limits.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ─── Constants ──────────────────────────────────────────────────────

DEFAULT_TOKEN_BUDGET = 4000
MAX_TOKEN_BUDGET = 100_000
MIN_TOKEN_BUDGET = 100
CHARS_PER_TOKEN = 4
MAX_HTML_LENGTH = 500
MAX_CONTEXT_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# ─── Token Budget ───────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """Estimate token count from character length."""
    return -(-len(text) // CHARS_PER_TOKEN)  # ceil division


def truncate_to_token_budget(text: str, max_tokens: int) -> str:
    """Hard-truncate text to fit within a token budget."""
    max_chars = max_tokens * CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text
    marker = "..."
    return text[: max(0, max_chars - len(marker))] + marker


# ─── Element Formatting ─────────────────────────────────────────────

def _format_source_ref(ctx: dict) -> Optional[str]:
    source_file = ctx.get("sourceFile")
    if not source_file:
        return None
    line = f":{ctx['sourceLine']}" if ctx.get("sourceLine") else ""
    return f"{source_file}{line}"


def _escape_backticks(s: str) -> str:
    """Escape backticks to prevent breaking markdown inline code."""
    return str(s).replace("`", "'")


def _format_edits(saved_edits: list[dict] | None) -> list[str]:
    """Format saved edits for an element (mirrors JS formatEdits)."""
    if not saved_edits:
        return []
    lines = ["   - Requested edits:"]
    for edit in saved_edits:
        prop = _escape_backticks(edit.get("property", ""))
        orig = _escape_backticks(edit.get("original", ""))
        val = _escape_backticks(edit.get("value", ""))
        lines.append(f"     - `{prop}`: `{orig}` -> `{val}`")
    return lines


def _format_element(ctx: dict, index: int) -> list[str]:
    lines: list[str] = []
    tag = f"<{ctx.get('tagName', 'unknown')}>"
    source_ref = _format_source_ref(ctx)
    component = f" ({ctx['componentName']})" if ctx.get("componentName") else ""

    if source_ref:
        lines.append(f"{index + 1}. **`{tag}` in `{source_ref}`**{component}")
    else:
        lines.append(f"{index + 1}. **`{tag}`**{component}")

    lines.append(f"   - Selector: `{ctx.get('selector', '')}`")

    if ctx.get("elementPrompt"):
        lines.append(f"   - Instruction: {ctx['elementPrompt']}")

    lines.extend(_format_edits(ctx.get("savedEdits")))

    return lines


def _format_vision_summary(analysis: Optional[dict]) -> Optional[str]:
    if not analysis:
        return None
    parts: list[str] = []
    if analysis.get("description"):
        parts.append(analysis["description"])
    color_palette = analysis.get("colorPalette", [])
    if color_palette:
        parts.append(f"Colors: {', '.join(str(c) for c in color_palette)}")
    ui_elements = analysis.get("uiElements", [])
    if ui_elements:
        parts.append(f"UI elements: {', '.join(str(el) for el in ui_elements)}")
    return "\n  - ".join(parts) if parts else None


def _collect_source_files(contexts: list[dict]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for ctx in contexts:
        ref = _format_source_ref(ctx)
        if ref and ref not in seen:
            seen.add(ref)
            result.append(ref)
    return result


# ─── Section Builders ───────────────────────────────────────────────

def _build_header(payload: dict) -> str:
    lines = ["## Visual Context\n"]
    if payload.get("route"):
        lines.append(f"The user is working on `{payload['route']}`.\n")
    if payload.get("prompt"):
        lines.append(f"> {payload['prompt']}\n")
    return "\n".join(lines) + "\n"


def _build_elements(contexts: Optional[list[dict]], include_html: bool) -> str:
    if not contexts:
        return ""
    lines = ["### Selected Elements\n"]

    for i, ctx in enumerate(contexts):
        lines.extend(_format_element(ctx, i))

        if include_html and ctx.get("html"):
            html = ctx["html"]
            truncated = html[:MAX_HTML_LENGTH] + "..." if len(html) > MAX_HTML_LENGTH else html
            lines.append(f"   - HTML: `{truncated}`")

        # Render linked images nested under this element
        for img in ctx.get("linkedImages", []):
            label = img.get("filename", "image")
            dims = img.get("dimensions", "")
            lines.append(f"   - Linked image: **{label}** ({dims})")
            if include_html:
                summary = _format_vision_summary(img.get("visionAnalysis"))
                if summary:
                    lines.append(f"     - {summary}")
                elif img.get("description"):
                    lines.append(f"     - {img['description']}")

        lines.append("")

    return "\n".join(lines) + "\n"


def _build_images(images: Optional[list[dict]], include_vision: bool) -> str:
    if not images:
        return ""
    lines = ["### Design References\n"]

    for img in images:
        lines.append(f"- **{img.get('filename', 'unknown')}** ({img.get('dimensions', 'unknown')})")

        if img.get("linkedElementSelector"):
            lines.append(f"  - Linked to: `{img['linkedElementSelector']}`")

        if include_vision:
            summary = _format_vision_summary(img.get("visionAnalysis"))
            if summary:
                lines.append(f"  - {summary}")
            elif img.get("description"):
                lines.append(f"  - {img['description']}")
        elif img.get("description"):
            lines.append(f"  - {img['description']}")

        lines.append("")

    return "\n".join(lines) + "\n"


def _build_screenshot(payload: dict) -> str:
    if not payload.get("visualAnalysis"):
        return ""
    lines = ["### Screenshot Analysis\n"]
    summary = _format_vision_summary(payload["visualAnalysis"])

    if summary:
        lines.append(summary)
    if payload.get("visualPrompt"):
        lines.append(f"\n> {payload['visualPrompt']}")

    lines.append("")
    return "\n".join(lines) + "\n"


def _build_files_to_modify(contexts: Optional[list[dict]]) -> str:
    if not contexts:
        return ""
    source_files = _collect_source_files(contexts)
    if not source_files:
        return ""

    lines = ["### Files to Modify\n"]
    for f in source_files:
        lines.append(f"- `{f}`")
    lines.append("")
    return "\n".join(lines) + "\n"


def _build_backend_section(backend_map: dict | None) -> str:
    """Format backend structure map for the agent prompt."""
    if not backend_map:
        return ""

    endpoints = backend_map.get("endpoints", [])
    models = backend_map.get("models", [])
    db = backend_map.get("database")

    if not endpoints and not models:
        return ""

    lines = ["### Backend Structure\n"]

    if endpoints:
        lines.append("**Endpoints:**")
        for ep in endpoints:
            method = ep.get("method", "?")
            path = ep.get("path", "?")
            file = ep.get("file", "?")
            line = ep.get("line", "")
            loc = f"{file}:{line}" if line else file
            lines.append(f"- {method} `{path}` -> `{loc}`")
        lines.append("")

    if models:
        lines.append("**Models:**")
        for model in models:
            name = model.get("name", "?")
            file = model.get("file", "?")
            line = model.get("line", "")
            loc = f"{file}:{line}" if line else file
            fields = model.get("fields", [])
            field_summary = ", ".join(
                f"{f['name']} ({f['type']})" for f in fields
            )
            lines.append(f"- **{name}** (`{loc}`): {field_summary}")
        lines.append("")

    if db:
        engine = db.get("engine", "unknown")
        lines.append(f"**Database:** {engine}")
        lines.append("")

    return "\n".join(lines) + "\n"


PRELOAD_MAX_LINES = 200
PRELOAD_TOKEN_BUDGET = 5000

_LANG_MAP = {
    ".py": "python", ".jsx": "jsx", ".tsx": "tsx", ".ts": "typescript",
    ".js": "javascript", ".css": "css", ".html": "html", ".json": "json",
}


def _build_preloaded_files(
    contexts: list[dict] | None, backend_map: dict | None
) -> str:
    """Read referenced files from disk and include contents in the prompt.

    Collects paths from contexts[].sourceFile and backendMap endpoints/models.
    Skips files over PRELOAD_MAX_LINES or outside VCI_OUTPUT_DIR.
    Stops adding files once total exceeds PRELOAD_TOKEN_BUDGET.
    """
    base = Path(os.getenv("VCI_OUTPUT_DIR", "/output")).resolve()

    # Collect unique file paths
    paths: list[str] = []
    seen: set[str] = set()

    for ctx in (contexts or []):
        sf = ctx.get("sourceFile")
        if sf and sf not in seen:
            seen.add(sf)
            paths.append(sf)

    if backend_map:
        for ep in backend_map.get("endpoints", []):
            f = ep.get("file")
            if f and f not in seen:
                seen.add(f)
                paths.append(f)
        for model in backend_map.get("models", []):
            f = model.get("file")
            if f and f not in seen:
                seen.add(f)
                paths.append(f)

    if not paths:
        return ""

    sections: list[str] = []
    total_tokens = 0

    for rel_path in paths:
        try:
            full = (base / rel_path).resolve()
            if not full.is_relative_to(base) or not full.is_file():
                continue
            content = full.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        lines = content.splitlines()
        if len(lines) > PRELOAD_MAX_LINES:
            continue

        file_tokens = estimate_tokens(content)
        if total_tokens + file_tokens > PRELOAD_TOKEN_BUDGET:
            continue

        total_tokens += file_tokens
        ext = Path(rel_path).suffix
        lang = _LANG_MAP.get(ext, "")
        sections.append(
            f"#### `{rel_path}` ({len(lines)} lines)\n```{lang}\n{content}\n```\n"
        )

    if not sections:
        return ""

    return "### Pre-loaded Files\n\n" + "\n".join(sections) + "\n"


# ─── Main Formatter ─────────────────────────────────────────────────

def format_payload(payload: dict, budget: int = DEFAULT_TOKEN_BUDGET) -> str:
    """Build the formatted prompt using a multi-pass budget strategy.

    Pass 1: Full fidelity (HTML + vision analysis)
    Pass 2: Strip HTML from elements
    Pass 3: Simplify vision summaries in images
    Pass 4: Drop images and screenshot entirely
    Pass 5: Hard truncate as last resort

    Always preserved: user prompt, source file paths, element selectors.
    """
    max_chars = budget * CHARS_PER_TOKEN

    header = _build_header(payload)
    elements_full = _build_elements(payload.get("contexts"), True)
    elements_lite = _build_elements(payload.get("contexts"), False)
    images_full = _build_images(payload.get("externalImages"), True)
    images_lite = _build_images(payload.get("externalImages"), False)
    screenshot = _build_screenshot(payload)
    backend = _build_backend_section(payload.get("backendMap"))
    files_to_modify = _build_files_to_modify(payload.get("contexts"))

    full = header + elements_full + images_full + screenshot + backend + files_to_modify
    if len(full) <= max_chars:
        return full

    pass2 = header + elements_lite + images_full + screenshot + backend + files_to_modify
    if len(pass2) <= max_chars:
        return pass2

    pass3 = header + elements_lite + images_lite + screenshot + backend + files_to_modify
    if len(pass3) <= max_chars:
        return pass3

    pass4 = header + elements_lite + backend + files_to_modify
    if len(pass4) <= max_chars:
        return pass4

    pass5 = header + elements_lite + files_to_modify
    if len(pass5) <= max_chars:
        return pass5

    return truncate_to_token_budget(pass5, budget)


def validate_payload(raw: Any) -> dict:
    """Validate and normalize a raw payload object.

    Returns a new dict (never mutates the input).
    """
    if not isinstance(raw, dict):
        raise ValueError("Invalid payload: must be a JSON object")

    return {
        "route": raw.get("route") if isinstance(raw.get("route"), str) else None,
        "prompt": raw.get("prompt") if isinstance(raw.get("prompt"), str) else None,
        "contexts": raw.get("contexts") if isinstance(raw.get("contexts"), list) else [],
        "externalImages": raw.get("externalImages") if isinstance(raw.get("externalImages"), list) else [],
        "visualAnalysis": raw.get("visualAnalysis") or None,
        "visualPrompt": raw.get("visualPrompt") if isinstance(raw.get("visualPrompt"), str) else None,
        "timestamp": raw.get("timestamp"),
        "backendMap": raw.get("backendMap") if isinstance(raw.get("backendMap"), dict) else None,
    }


def read_context_file(file_path: str | Path) -> dict:
    """Read and parse context.json with file size validation."""
    path = Path(file_path)
    size = path.stat().st_size
    if size > MAX_CONTEXT_FILE_SIZE:
        raise ValueError(
            f"Context file too large: {size / 1024 / 1024:.1f}MB (max 10MB)"
        )
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def format_edit_instructions(ai_edits: list[dict]) -> str:
    """Convert structured edit data into precise, unambiguous agent instructions."""
    lines = ["# Direct Edit Instructions", ""]
    lines.append(
        "The user has made specific visual edits that need to be applied to source code."
    )
    lines.append(
        "Apply EXACTLY these changes - do not interpret or expand them."
    )
    lines.append("")

    for edit in ai_edits:
        selector = edit.get("selector", "unknown")
        source = edit.get("sourceFile")
        line_num = edit.get("sourceLine")
        component = edit.get("componentName")

        location = ""
        if source:
            location = f" in {source}"
            if line_num:
                location += f":{line_num}"
            if component:
                location += f" ({component})"

        lines.append(f"## Element: `{_escape_backticks(selector)}`{location}")
        for change in edit.get("changes", []):
            prop = _escape_backticks(change.get("property", ""))
            old = _escape_backticks(change.get("original", ""))
            new = _escape_backticks(change.get("value", ""))
            lines.append(f"- Change `{prop}` from `{old}` to `{new}`")
        lines.append("")

    return "\n".join(lines)
