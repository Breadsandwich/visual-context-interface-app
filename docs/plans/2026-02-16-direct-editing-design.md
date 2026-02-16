# Direct Editing Feature Design

**Date:** 2026-02-16
**Branch:** feat/headless-agent-service (base)
**Status:** Approved

## Problem

VCI currently relies on natural language prompts to describe desired changes. Users select elements, write instructions, and an AI agent interprets them. This introduces ambiguity — "make the button bigger" could mean font size, padding, width, or all three. Direct manipulation eliminates this ambiguity.

## Solution

Add a **Direct Editing** mode to VCI where users select elements and edit their visual properties and content through a control panel. Changes preview live in the iframe, then batch-apply to source files through a hybrid engine: deterministic file writes for simple CSS changes, AI agent for complex structural changes.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edit scope | Visual properties + content | Full manipulation covers the most common editing needs |
| Change flow | Hybrid (deterministic + AI) | Simple CSS edits don't need AI; complex changes benefit from it |
| UI placement | Sidebar transforms into editor | Keeps single-panel UX, context-sensitive to mode |
| Controls | Text, colors, typography, spacing, layout | Comprehensive property coverage from v1 |
| Source mapping | React dev mode only | Fiber `_debugSource` provides file:line; non-dev falls back to AI |
| Apply flow | Live preview + batch apply | Instant feedback, deliberate commits to source |

## Architecture

### New Mode: Edit Mode

Added as fourth mode alongside `interaction`, `inspection`, `screenshot`.

- In Edit mode, clicking a previously selected element opens its property editor in the sidebar
- Hover shows edit cursor on selected elements only
- Separate from Inspection mode to avoid conflicting click behaviors

### Editor Panel (Sidebar)

When editing an element, the sidebar replaces its content with:

1. **Content section** — contenteditable text field for inline text changes
2. **Colors section** — text color, background, border with color pickers + hex input
3. **Typography section** — font family (dropdown), size (slider), weight, line-height, letter-spacing
4. **Spacing section** — box model visualizer with editable margin/padding values
5. **Layout section** — display, width, height, flex/grid properties
6. **Source info** — file path and line number from React Fiber
7. **Actions** — "Apply Changes" and "Revert" buttons with pending change counter

"Back to Selection" returns to the existing prompt-based view.

### Live Preview via PostMessage

New message types from frontend to inspector:

- `APPLY_EDIT { selector, property, value }` — applies inline style or text content change
- `REVERT_EDITS` — restores all elements to original state
- `REVERT_ELEMENT { selector }` — restores single element

Inspector tracks original values in a `Map<selector, Map<property, {original, current}>>` for clean revert. Uses `el.style[property]` for CSS preview (highest specificity, non-destructive to stylesheets).

### Hybrid Apply Engine

When user clicks "Apply Changes", edits are partitioned:

**Deterministic path** (simple CSS with source mapping):
- Element has React Fiber `_debugSource` (file + line)
- Edit is a CSS property change
- `POST /api/apply-edits` → `source_editor.py` reads file, locates style at line, writes change

**AI-assisted path** (complex or unmapped edits):
- No source mapping, OR structural changes (text content, new elements)
- Generates precise instructions from edit data: exact property, selector, old value, new value
- Sends to existing agent service — same flow, but zero-ambiguity prompt

**Batch processing:**
1. Partition all pending edits
2. Execute deterministic edits immediately
3. Batch AI-assisted edits into one agent prompt
4. Show progress: "Applied N/M directly. Agent handling K complex changes..."
5. On completion, reload iframe

### Computed Style Extraction

New postMessage exchange to populate editor controls:

- Frontend sends `GET_COMPUTED_STYLES { selector }` to inspector
- Inspector reads `getComputedStyle(element)` for all relevant properties
- Returns `COMPUTED_STYLES { selector, styles: { color, fontSize, ... } }` via postMessage
- `useComputedStyles` hook manages the request/response cycle

## New/Modified Files

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/components/EditorPanel.tsx` | Main editor panel with property sections |
| `frontend/src/components/EditorPanel.css` | Editor panel styles |
| `frontend/src/components/editor/ColorPicker.tsx` | Color picker with hex input |
| `frontend/src/components/editor/SpacingEditor.tsx` | Box model margin/padding editor |
| `frontend/src/components/editor/TypographyEditor.tsx` | Font family, size, weight controls |
| `frontend/src/components/editor/LayoutEditor.tsx` | Display, dimensions, flex/grid controls |
| `frontend/src/components/editor/ContentEditor.tsx` | Inline text editing |
| `frontend/src/stores/editorStore.ts` | Editor state management |
| `frontend/src/hooks/useComputedStyles.ts` | Computed style request/response hook |
| `proxy/source_editor.py` | Deterministic source file editing |

### Modified Files
| File | Change |
|------|--------|
| `inspector/inspector.js` | Add APPLY_EDIT, REVERT_EDITS, GET_COMPUTED_STYLES handlers; edit mode behavior |
| `frontend/src/components/ExpandableSidebar.tsx` | Conditionally render EditorPanel vs current content |
| `frontend/src/components/FloatingWidget.tsx` | Add Edit mode button |
| `proxy/routes.py` | Add `/api/apply-edits` endpoint |
| `proxy/formatter.py` | Format precise edit instructions for AI path |

## What Stays the Same

- Existing inspection flow (selection, screenshots, vision analysis)
- Prompt-based flow accessible via "Back to Selection"
- Agent service architecture (tools, sandboxing, polling)
- CLI/MCP integration
- PostMessage origin validation
- Zustand immutable state patterns

## Constraints

- Deterministic source editing requires React dev mode builds (`_debugSource` present)
- Non-React or production builds fall back entirely to AI-assisted path
- Source editor v1 handles inline styles and simple CSS class modifications
- Complex CSS-in-JS (styled-components, emotion) deferred to AI path
