# Direct Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a direct-editing mode to VCI where users visually edit element properties (colors, text, spacing, typography, layout) with live preview, then batch-apply changes to source files through a hybrid deterministic/AI engine.

**Architecture:** Extends the existing inspector-driven postMessage architecture. Inspector.js gains bidirectional edit commands (APPLY_EDIT, REVERT_EDITS, GET_COMPUTED_STYLES). A new Zustand `editorStore` tracks pending edits. The sidebar conditionally renders an EditorPanel when in edit mode. Apply partitions edits into deterministic source writes (for CSS with React Fiber source mapping) and AI-assisted precise instructions (for complex or unmapped changes).

**Tech Stack:** React 18, TypeScript, Zustand 4, Vite 5, Vitest, vanilla JS (inspector.js), Python FastAPI (proxy)

**Design doc:** `docs/plans/2026-02-16-direct-editing-design.md`

---

## Phase 1: Types & Editor Store Foundation

### Task 1: Add Edit Mode to InspectorMode Type

**Files:**
- Modify: `frontend/src/types/inspector.ts:5`

**Step 1: Update InspectorMode type**

In `frontend/src/types/inspector.ts`, change line 5:

```typescript
// FROM:
export type InspectorMode = 'interaction' | 'inspection' | 'screenshot'

// TO:
export type InspectorMode = 'interaction' | 'inspection' | 'screenshot' | 'edit'
```

**Step 2: Add editor-related types to inspector.ts**

Append below the existing `OutputPayload` interface (after line 131):

```typescript
export interface PropertyEdit {
  property: string
  value: string
  original: string
}

export interface ElementEdits {
  selector: string
  sourceFile: string | null
  sourceLine: number | null
  componentName: string | null
  changes: PropertyEdit[]
}

export interface ComputedStylesPayload {
  selector: string
  styles: Record<string, string>
}
```

**Step 3: Update InspectorCommand to support new actions**

In `frontend/src/types/inspector.ts`, update the `InspectorCommand` interface:

```typescript
// FROM:
export interface InspectorCommand {
  type: 'INSPECTOR_COMMAND'
  action: 'SET_MODE' | 'CAPTURE_SCREENSHOT' | 'CAPTURE_ELEMENT' | 'CLEAR_SELECTION' | 'GET_ROUTE'
  payload?: {
    mode?: InspectorMode
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    selector?: string
  }
}

// TO:
export interface InspectorCommand {
  type: 'INSPECTOR_COMMAND'
  action: 'SET_MODE' | 'CAPTURE_SCREENSHOT' | 'CAPTURE_ELEMENT' | 'CLEAR_SELECTION' | 'GET_ROUTE' | 'APPLY_EDIT' | 'REVERT_EDITS' | 'REVERT_ELEMENT' | 'GET_COMPUTED_STYLES'
  payload?: {
    mode?: InspectorMode
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    selector?: string
    property?: string
    value?: string
  }
}
```

**Step 4: Update InspectorEvent to support COMPUTED_STYLES response**

Update the `InspectorEvent` interface:

```typescript
// FROM:
export interface InspectorEvent {
  type: 'INSPECTOR_EVENT'
  action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED' | 'READY' | 'SCREENSHOT_ERROR'
  payload: ElementSelectedPayload | ScreenshotPayload | RouteChangedPayload | ReadyPayload | ScreenshotErrorPayload
}

// TO:
export interface InspectorEvent {
  type: 'INSPECTOR_EVENT'
  action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED' | 'READY' | 'SCREENSHOT_ERROR' | 'COMPUTED_STYLES'
  payload: ElementSelectedPayload | ScreenshotPayload | RouteChangedPayload | ReadyPayload | ScreenshotErrorPayload | ComputedStylesPayload
}
```

**Step 5: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors (existing code still type-checks with the union expansion)

**Step 6: Commit**

```bash
git add frontend/src/types/inspector.ts
git commit -m "feat: add edit mode type and editor-related interfaces"
```

---

### Task 2: Create Editor Store

**Files:**
- Create: `frontend/src/stores/editorStore.ts`
- Test: `frontend/src/stores/__tests__/editorStore.test.ts`

**Step 1: Write failing tests for editor store**

Create `frontend/src/stores/__tests__/editorStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
  })

  describe('setActiveElement', () => {
    it('sets the active element selector', () => {
      useEditorStore.getState().setActiveElement('.btn-primary')
      expect(useEditorStore.getState().activeElement).toBe('.btn-primary')
    })

    it('clears active element when set to null', () => {
      useEditorStore.getState().setActiveElement('.btn-primary')
      useEditorStore.getState().setActiveElement(null)
      expect(useEditorStore.getState().activeElement).toBeNull()
    })
  })

  describe('addEdit', () => {
    it('adds a pending edit for an element', () => {
      useEditorStore.getState().addEdit('.btn', 'backgroundColor', '#0066ff', '#cccccc')
      const edits = useEditorStore.getState().pendingEdits
      expect(edits['.btn']).toBeDefined()
      expect(edits['.btn']).toContainEqual({
        property: 'backgroundColor',
        value: '#0066ff',
        original: '#cccccc'
      })
    })

    it('updates existing edit for same property', () => {
      useEditorStore.getState().addEdit('.btn', 'backgroundColor', '#0066ff', '#cccccc')
      useEditorStore.getState().addEdit('.btn', 'backgroundColor', '#ff0000', '#cccccc')
      const edits = useEditorStore.getState().pendingEdits['.btn']
      expect(edits).toHaveLength(1)
      expect(edits[0].value).toBe('#ff0000')
      expect(edits[0].original).toBe('#cccccc')
    })

    it('removes edit when value matches original', () => {
      useEditorStore.getState().addEdit('.btn', 'backgroundColor', '#0066ff', '#cccccc')
      useEditorStore.getState().addEdit('.btn', 'backgroundColor', '#cccccc', '#cccccc')
      const edits = useEditorStore.getState().pendingEdits['.btn']
      expect(edits).toBeUndefined()
    })

    it('tracks edits across multiple elements immutably', () => {
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      const before = useEditorStore.getState().pendingEdits
      useEditorStore.getState().addEdit('.header', 'fontSize', '20px', '16px')
      const after = useEditorStore.getState().pendingEdits
      expect(before).not.toBe(after)
      expect(Object.keys(after)).toHaveLength(2)
    })
  })

  describe('revertElement', () => {
    it('removes all pending edits for an element', () => {
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      useEditorStore.getState().addEdit('.btn', 'fontSize', '20px', '16px')
      useEditorStore.getState().revertElement('.btn')
      expect(useEditorStore.getState().pendingEdits['.btn']).toBeUndefined()
    })
  })

  describe('revertAll', () => {
    it('clears all pending edits', () => {
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      useEditorStore.getState().addEdit('.header', 'fontSize', '20px', '16px')
      useEditorStore.getState().revertAll()
      expect(useEditorStore.getState().pendingEdits).toEqual({})
    })
  })

  describe('pendingEditCount', () => {
    it('returns total count of pending edits across all elements', () => {
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      useEditorStore.getState().addEdit('.btn', 'fontSize', '20px', '16px')
      useEditorStore.getState().addEdit('.header', 'padding', '10px', '0px')
      expect(useEditorStore.getState().getPendingEditCount()).toBe(3)
    })
  })

  describe('getEditsForApply', () => {
    it('returns edits grouped by element with source info', () => {
      useEditorStore.getState().setSourceInfo('.btn', 'Button.tsx', 24, 'Button')
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      const result = useEditorStore.getState().getEditsForApply()
      expect(result).toHaveLength(1)
      expect(result[0].selector).toBe('.btn')
      expect(result[0].sourceFile).toBe('Button.tsx')
      expect(result[0].sourceLine).toBe(24)
      expect(result[0].changes).toHaveLength(1)
    })
  })

  describe('setComputedStyles', () => {
    it('stores computed styles for a selector', () => {
      const styles = { color: 'rgb(0,0,0)', fontSize: '16px' }
      useEditorStore.getState().setComputedStyles('.btn', styles)
      expect(useEditorStore.getState().computedStyles['.btn']).toEqual(styles)
    })
  })

  describe('resetEditor', () => {
    it('clears all editor state', () => {
      useEditorStore.getState().setActiveElement('.btn')
      useEditorStore.getState().addEdit('.btn', 'color', 'red', 'black')
      useEditorStore.getState().setComputedStyles('.btn', { color: 'black' })
      useEditorStore.getState().resetEditor()
      expect(useEditorStore.getState().activeElement).toBeNull()
      expect(useEditorStore.getState().pendingEdits).toEqual({})
      expect(useEditorStore.getState().computedStyles).toEqual({})
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx vitest run src/stores/__tests__/editorStore.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the editor store**

Create `frontend/src/stores/editorStore.ts`:

```typescript
import { create } from 'zustand'
import type { PropertyEdit, ElementEdits } from '../types/inspector'

interface SourceInfo {
  sourceFile: string | null
  sourceLine: number | null
  componentName: string | null
}

interface EditorState {
  activeElement: string | null
  pendingEdits: Record<string, PropertyEdit[]>
  computedStyles: Record<string, Record<string, string>>
  sourceInfoMap: Record<string, SourceInfo>

  setActiveElement: (selector: string | null) => void
  addEdit: (selector: string, property: string, value: string, original: string) => void
  revertElement: (selector: string) => void
  revertAll: () => void
  getPendingEditCount: () => number
  getEditsForApply: () => ElementEdits[]
  setComputedStyles: (selector: string, styles: Record<string, string>) => void
  setSourceInfo: (selector: string, sourceFile: string | null, sourceLine: number | null, componentName: string | null) => void
  resetEditor: () => void
}

const initialState = {
  activeElement: null as string | null,
  pendingEdits: {} as Record<string, PropertyEdit[]>,
  computedStyles: {} as Record<string, Record<string, string>>,
  sourceInfoMap: {} as Record<string, SourceInfo>,
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setActiveElement: (selector) => set({ activeElement: selector }),

  addEdit: (selector, property, value, original) => set((state) => {
    const elementEdits = state.pendingEdits[selector] ?? []

    // If value matches original, remove the edit (no-op change)
    if (value === original) {
      const filtered = elementEdits.filter((e) => e.property !== property)
      if (filtered.length === 0) {
        const { [selector]: _removed, ...rest } = state.pendingEdits
        return { pendingEdits: rest }
      }
      return {
        pendingEdits: { ...state.pendingEdits, [selector]: filtered }
      }
    }

    const existingIndex = elementEdits.findIndex((e) => e.property === property)
    if (existingIndex !== -1) {
      // Update existing edit, preserve original
      const updated = elementEdits.map((e, i) =>
        i === existingIndex ? { ...e, value } : e
      )
      return {
        pendingEdits: { ...state.pendingEdits, [selector]: updated }
      }
    }

    // Add new edit
    return {
      pendingEdits: {
        ...state.pendingEdits,
        [selector]: [...elementEdits, { property, value, original }]
      }
    }
  }),

  revertElement: (selector) => set((state) => {
    const { [selector]: _removed, ...rest } = state.pendingEdits
    return { pendingEdits: rest }
  }),

  revertAll: () => set({ pendingEdits: {} }),

  getPendingEditCount: () => {
    const edits = get().pendingEdits
    return Object.values(edits).reduce((sum, arr) => sum + arr.length, 0)
  },

  getEditsForApply: () => {
    const { pendingEdits, sourceInfoMap } = get()
    return Object.entries(pendingEdits).map(([selector, changes]): ElementEdits => {
      const info = sourceInfoMap[selector]
      return {
        selector,
        sourceFile: info?.sourceFile ?? null,
        sourceLine: info?.sourceLine ?? null,
        componentName: info?.componentName ?? null,
        changes,
      }
    })
  },

  setComputedStyles: (selector, styles) => set((state) => ({
    computedStyles: { ...state.computedStyles, [selector]: styles }
  })),

  setSourceInfo: (selector, sourceFile, sourceLine, componentName) => set((state) => ({
    sourceInfoMap: {
      ...state.sourceInfoMap,
      [selector]: { sourceFile, sourceLine, componentName }
    }
  })),

  resetEditor: () => set({ ...initialState }),
}))
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx vitest run src/stores/__tests__/editorStore.test.ts`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add frontend/src/stores/editorStore.ts frontend/src/stores/__tests__/editorStore.test.ts
git commit -m "feat: add editor store with pending edits and computed styles tracking"
```

---

## Phase 2: Inspector.js Edit Handlers

### Task 3: Add Edit Command Handlers to Inspector

**Files:**
- Modify: `inspector/inspector.js`

**Step 1: Add pendingEdits tracking to inspector state**

In `inspector/inspector.js`, after the existing `state` object (around line 34), add:

```javascript
// Edit mode: tracks DOM changes for revert
const pendingEdits = new Map(); // selector → Map<property, { original, current }>
```

**Step 2: Add APPLY_EDIT handler**

In the `switch` statement that handles incoming commands (around line 605), add new cases after the existing `CLEAR_SELECTION` case:

```javascript
case 'APPLY_EDIT': {
  if (!payload || !payload.selector || !payload.property) break;
  const el = document.querySelector(payload.selector);
  if (!el) break;

  if (!pendingEdits.has(payload.selector)) {
    pendingEdits.set(payload.selector, new Map());
  }
  const elementEdits = pendingEdits.get(payload.selector);

  // Store original value on first edit of this property
  if (!elementEdits.has(payload.property)) {
    const original = payload.property === 'textContent'
      ? el.textContent
      : getComputedStyle(el)[payload.property] || '';
    elementEdits.set(payload.property, { original: original, current: payload.value });
  } else {
    elementEdits.get(payload.property).current = payload.value;
  }

  // Apply to DOM
  if (payload.property === 'textContent') {
    el.textContent = payload.value;
  } else {
    el.style[payload.property] = payload.value;
  }
  break;
}

case 'REVERT_EDITS': {
  for (const [selector, edits] of pendingEdits) {
    const el = document.querySelector(selector);
    if (!el) continue;
    for (const [property, values] of edits) {
      if (property === 'textContent') {
        el.textContent = values.original;
      } else {
        el.style[property] = '';
      }
    }
  }
  pendingEdits.clear();
  break;
}

case 'REVERT_ELEMENT': {
  if (!payload || !payload.selector) break;
  const edits = pendingEdits.get(payload.selector);
  if (!edits) break;
  const el = document.querySelector(payload.selector);
  if (el) {
    for (const [property, values] of edits) {
      if (property === 'textContent') {
        el.textContent = values.original;
      } else {
        el.style[property] = '';
      }
    }
  }
  pendingEdits.delete(payload.selector);
  break;
}

case 'GET_COMPUTED_STYLES': {
  if (!payload || !payload.selector) break;
  const el = document.querySelector(payload.selector);
  if (!el) break;
  const computed = getComputedStyle(el);
  const styles = {
    color: computed.color,
    backgroundColor: computed.backgroundColor,
    borderColor: computed.borderColor,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    lineHeight: computed.lineHeight,
    letterSpacing: computed.letterSpacing,
    textContent: el.textContent || '',
    marginTop: computed.marginTop,
    marginRight: computed.marginRight,
    marginBottom: computed.marginBottom,
    marginLeft: computed.marginLeft,
    paddingTop: computed.paddingTop,
    paddingRight: computed.paddingRight,
    paddingBottom: computed.paddingBottom,
    paddingLeft: computed.paddingLeft,
    display: computed.display,
    width: computed.width,
    height: computed.height,
    flexDirection: computed.flexDirection,
    alignItems: computed.alignItems,
    justifyContent: computed.justifyContent,
    gap: computed.gap,
    opacity: computed.opacity,
  };
  sendToParent('COMPUTED_STYLES', { selector: payload.selector, styles: styles });
  break;
}
```

**Step 3: Add edit mode click behavior**

In the click handler for inspection mode (around line 555), add a branch for edit mode. When `state.mode === 'edit'`, clicking a selected element should send a `EDIT_ELEMENT_CLICKED` event instead of toggling selection:

```javascript
// Inside the click handler, before the existing inspection mode check:
if (state.mode === 'edit') {
  const target = event.target;
  // Check if clicked element is one of the selected elements
  const selectedMatch = state.selectedElements.find(function(item) {
    return item.element === target || target.closest(item.context.selector);
  });
  if (selectedMatch) {
    event.preventDefault();
    event.stopPropagation();
    sendToParent('EDIT_ELEMENT_CLICKED', { selector: selectedMatch.context.selector });
  }
  return;
}
```

**Step 4: Test manually in the browser**

Open VCI, select an element, open browser console, and verify:
- `postMessage({ type: 'INSPECTOR_COMMAND', action: 'GET_COMPUTED_STYLES', payload: { selector: '.some-element' } }, '*')` returns computed styles
- `postMessage({ type: 'INSPECTOR_COMMAND', action: 'APPLY_EDIT', payload: { selector: '.some-element', property: 'backgroundColor', value: 'red' } }, '*')` changes the element visually
- `postMessage({ type: 'INSPECTOR_COMMAND', action: 'REVERT_EDITS' }, '*')` restores original

**Step 5: Commit**

```bash
git add inspector/inspector.js
git commit -m "feat: add APPLY_EDIT, REVERT, and GET_COMPUTED_STYLES handlers to inspector"
```

---

### Task 4: Update usePostMessage Hook for Edit Commands

**Files:**
- Modify: `frontend/src/hooks/usePostMessage.ts`
- Modify: `frontend/src/types/inspector.ts` (add EDIT_ELEMENT_CLICKED to InspectorEvent)

**Step 1: Add EDIT_ELEMENT_CLICKED to InspectorEvent actions**

In `frontend/src/types/inspector.ts`, update InspectorEvent action union to include `'EDIT_ELEMENT_CLICKED'`:

```typescript
action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED' | 'READY' | 'SCREENSHOT_ERROR' | 'COMPUTED_STYLES' | 'EDIT_ELEMENT_CLICKED'
```

**Step 2: Add new command helpers to usePostMessage**

In `frontend/src/hooks/usePostMessage.ts`, add these to the returned object and handle the new incoming events:

```typescript
// In the handleMessage switch statement, add:
case 'COMPUTED_STYLES':
  if (data.payload && 'selector' in data.payload && 'styles' in data.payload) {
    const { setComputedStyles } = useEditorStore.getState()
    setComputedStyles(data.payload.selector as string, data.payload.styles as Record<string, string>)
  }
  break

case 'EDIT_ELEMENT_CLICKED':
  if (data.payload && 'selector' in data.payload) {
    const { setActiveElement } = useEditorStore.getState()
    setActiveElement(data.payload.selector as string)
  }
  break

// Add new command helpers:
const applyEdit = useCallback((selector: string, property: string, value: string) => {
  sendCommand({
    type: 'INSPECTOR_COMMAND',
    action: 'APPLY_EDIT',
    payload: { selector, property, value }
  })
}, [sendCommand])

const revertEdits = useCallback(() => {
  sendCommand({
    type: 'INSPECTOR_COMMAND',
    action: 'REVERT_EDITS'
  })
}, [sendCommand])

const revertElement = useCallback((selector: string) => {
  sendCommand({
    type: 'INSPECTOR_COMMAND',
    action: 'REVERT_ELEMENT',
    payload: { selector }
  })
}, [sendCommand])

const getComputedStyles = useCallback((selector: string) => {
  sendCommand({
    type: 'INSPECTOR_COMMAND',
    action: 'GET_COMPUTED_STYLES',
    payload: { selector }
  })
}, [sendCommand])
```

Add `import { useEditorStore } from '../stores/editorStore'` at the top.

Update the return statement to include the new helpers:

```typescript
return {
  sendCommand,
  setInspectorMode,
  captureScreenshot,
  captureElement,
  clearSelection,
  applyEdit,
  revertEdits,
  revertElement,
  getComputedStyles
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/hooks/usePostMessage.ts frontend/src/types/inspector.ts
git commit -m "feat: add edit command helpers and computed styles handling to usePostMessage"
```

---

## Phase 3: Editor UI Components

### Task 5: Create ContentEditor Component

**Files:**
- Create: `frontend/src/components/editor/ContentEditor.tsx`

**Step 1: Create the component**

```typescript
import { useState, useEffect, useRef } from 'react'

interface ContentEditorProps {
  value: string
  onChange: (value: string) => void
}

export function ContentEditor({ value, onChange }: ContentEditorProps) {
  const [localValue, setLocalValue] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    onChange(newValue)
  }

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Content</h4>
      <textarea
        ref={textareaRef}
        className="editor-content-input"
        value={localValue}
        onChange={handleChange}
        rows={3}
        placeholder="Element text content"
      />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/editor/ContentEditor.tsx
git commit -m "feat: add ContentEditor component for inline text editing"
```

---

### Task 6: Create ColorPicker Component

**Files:**
- Create: `frontend/src/components/editor/ColorPicker.tsx`

**Step 1: Create the component**

```typescript
import { useState, useEffect } from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return rgb
  const r = parseInt(match[1], 10)
  const g = parseInt(match[2], 10)
  const b = parseInt(match[3], 10)
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const hexValue = value.startsWith('#') ? value : rgbToHex(value)
  const [inputValue, setInputValue] = useState(hexValue)

  useEffect(() => {
    const newHex = value.startsWith('#') ? value : rgbToHex(value)
    setInputValue(newHex)
  }, [value])

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    setInputValue(hex)
    onChange(hex)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (isValidHex(val)) {
      onChange(val)
    }
  }

  const handleInputBlur = () => {
    if (!isValidHex(inputValue)) {
      setInputValue(hexValue)
    }
  }

  return (
    <div className="editor-color-row">
      <span className="editor-color-label">{label}</span>
      <input
        type="color"
        className="editor-color-picker"
        value={isValidHex(inputValue) ? inputValue : '#000000'}
        onChange={handlePickerChange}
      />
      <input
        type="text"
        className="editor-color-hex"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        maxLength={7}
        placeholder="#000000"
      />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/editor/ColorPicker.tsx
git commit -m "feat: add ColorPicker component with hex input and native picker"
```

---

### Task 7: Create TypographyEditor Component

**Files:**
- Create: `frontend/src/components/editor/TypographyEditor.tsx`

**Step 1: Create the component**

```typescript
interface TypographyEditorProps {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  onPropertyChange: (property: string, value: string) => void
}

const FONT_FAMILIES = [
  'inherit',
  'system-ui, sans-serif',
  'Georgia, serif',
  'Menlo, monospace',
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Times New Roman, serif',
  'Courier New, monospace',
]

const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900']

export function TypographyEditor({
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  onPropertyChange,
}: TypographyEditorProps) {
  const fontSizeNum = parseFloat(fontSize) || 16
  const lineHeightNum = parseFloat(lineHeight) || 1.5
  const letterSpacingNum = parseFloat(letterSpacing) || 0

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Typography</h4>

      <div className="editor-field">
        <label className="editor-field-label">Font Family</label>
        <select
          className="editor-select"
          value={fontFamily}
          onChange={(e) => onPropertyChange('fontFamily', e.target.value)}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>{f.split(',')[0]}</option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label className="editor-field-label">Font Size</label>
        <div className="editor-slider-row">
          <input
            type="range"
            className="editor-slider"
            min="8"
            max="72"
            step="1"
            value={fontSizeNum}
            onChange={(e) => onPropertyChange('fontSize', `${e.target.value}px`)}
          />
          <span className="editor-slider-value">{fontSizeNum}px</span>
        </div>
      </div>

      <div className="editor-field">
        <label className="editor-field-label">Weight</label>
        <select
          className="editor-select"
          value={fontWeight}
          onChange={(e) => onPropertyChange('fontWeight', e.target.value)}
        >
          {FONT_WEIGHTS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label className="editor-field-label">Line Height</label>
        <div className="editor-slider-row">
          <input
            type="range"
            className="editor-slider"
            min="0.5"
            max="3"
            step="0.1"
            value={lineHeightNum}
            onChange={(e) => onPropertyChange('lineHeight', e.target.value)}
          />
          <span className="editor-slider-value">{lineHeightNum}</span>
        </div>
      </div>

      <div className="editor-field">
        <label className="editor-field-label">Letter Spacing</label>
        <div className="editor-slider-row">
          <input
            type="range"
            className="editor-slider"
            min="-2"
            max="10"
            step="0.5"
            value={letterSpacingNum}
            onChange={(e) => onPropertyChange('letterSpacing', `${e.target.value}px`)}
          />
          <span className="editor-slider-value">{letterSpacingNum}px</span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/editor/TypographyEditor.tsx
git commit -m "feat: add TypographyEditor with font family, size, weight, line-height controls"
```

---

### Task 8: Create SpacingEditor Component

**Files:**
- Create: `frontend/src/components/editor/SpacingEditor.tsx`

**Step 1: Create the component**

This is the box-model visualizer with editable margin/padding values:

```typescript
interface SpacingEditorProps {
  marginTop: string
  marginRight: string
  marginBottom: string
  marginLeft: string
  paddingTop: string
  paddingRight: string
  paddingBottom: string
  paddingLeft: string
  onPropertyChange: (property: string, value: string) => void
}

function SpacingInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const numValue = parseFloat(value) || 0
  return (
    <input
      type="number"
      className="spacing-input"
      value={numValue}
      onChange={(e) => onChange(`${e.target.value}px`)}
      title={label}
      aria-label={label}
      min="-100"
      max="500"
      step="1"
    />
  )
}

export function SpacingEditor({
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  onPropertyChange,
}: SpacingEditorProps) {
  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Spacing</h4>
      <div className="box-model">
        <div className="box-model-label margin-label">margin</div>
        <div className="box-model-margin">
          <SpacingInput value={marginTop} onChange={(v) => onPropertyChange('marginTop', v)} label="Margin top" />
          <div className="box-model-margin-sides">
            <SpacingInput value={marginLeft} onChange={(v) => onPropertyChange('marginLeft', v)} label="Margin left" />
            <div className="box-model-padding">
              <div className="box-model-label padding-label">padding</div>
              <SpacingInput value={paddingTop} onChange={(v) => onPropertyChange('paddingTop', v)} label="Padding top" />
              <div className="box-model-padding-sides">
                <SpacingInput value={paddingLeft} onChange={(v) => onPropertyChange('paddingLeft', v)} label="Padding left" />
                <div className="box-model-element">el</div>
                <SpacingInput value={paddingRight} onChange={(v) => onPropertyChange('paddingRight', v)} label="Padding right" />
              </div>
              <SpacingInput value={paddingBottom} onChange={(v) => onPropertyChange('paddingBottom', v)} label="Padding bottom" />
            </div>
            <SpacingInput value={marginRight} onChange={(v) => onPropertyChange('marginRight', v)} label="Margin right" />
          </div>
          <SpacingInput value={marginBottom} onChange={(v) => onPropertyChange('marginBottom', v)} label="Margin bottom" />
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/editor/SpacingEditor.tsx
git commit -m "feat: add SpacingEditor with box-model margin/padding visualizer"
```

---

### Task 9: Create LayoutEditor Component

**Files:**
- Create: `frontend/src/components/editor/LayoutEditor.tsx`

**Step 1: Create the component**

```typescript
interface LayoutEditorProps {
  display: string
  width: string
  height: string
  flexDirection: string
  alignItems: string
  justifyContent: string
  gap: string
  opacity: string
  onPropertyChange: (property: string, value: string) => void
}

const DISPLAY_VALUES = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none']
const FLEX_DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse']
const ALIGN_VALUES = ['stretch', 'flex-start', 'flex-end', 'center', 'baseline']
const JUSTIFY_VALUES = ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']

export function LayoutEditor({
  display,
  width,
  height,
  flexDirection,
  alignItems,
  justifyContent,
  gap,
  opacity,
  onPropertyChange,
}: LayoutEditorProps) {
  const isFlex = display === 'flex' || display === 'inline-flex'
  const opacityNum = parseFloat(opacity) || 1

  return (
    <div className="editor-section">
      <h4 className="editor-section-title">Layout</h4>

      <div className="editor-field">
        <label className="editor-field-label">Display</label>
        <select
          className="editor-select"
          value={display}
          onChange={(e) => onPropertyChange('display', e.target.value)}
        >
          {DISPLAY_VALUES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="editor-field-row">
        <div className="editor-field editor-field-half">
          <label className="editor-field-label">Width</label>
          <input
            type="text"
            className="editor-text-input"
            value={width}
            onChange={(e) => onPropertyChange('width', e.target.value)}
            placeholder="auto"
          />
        </div>
        <div className="editor-field editor-field-half">
          <label className="editor-field-label">Height</label>
          <input
            type="text"
            className="editor-text-input"
            value={height}
            onChange={(e) => onPropertyChange('height', e.target.value)}
            placeholder="auto"
          />
        </div>
      </div>

      {isFlex && (
        <>
          <div className="editor-field">
            <label className="editor-field-label">Flex Direction</label>
            <select
              className="editor-select"
              value={flexDirection}
              onChange={(e) => onPropertyChange('flexDirection', e.target.value)}
            >
              {FLEX_DIRECTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-field-label">Align Items</label>
            <select
              className="editor-select"
              value={alignItems}
              onChange={(e) => onPropertyChange('alignItems', e.target.value)}
            >
              {ALIGN_VALUES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-field-label">Justify Content</label>
            <select
              className="editor-select"
              value={justifyContent}
              onChange={(e) => onPropertyChange('justifyContent', e.target.value)}
            >
              {JUSTIFY_VALUES.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label className="editor-field-label">Gap</label>
            <input
              type="text"
              className="editor-text-input"
              value={gap}
              onChange={(e) => onPropertyChange('gap', e.target.value)}
              placeholder="0px"
            />
          </div>
        </>
      )}

      <div className="editor-field">
        <label className="editor-field-label">Opacity</label>
        <div className="editor-slider-row">
          <input
            type="range"
            className="editor-slider"
            min="0"
            max="1"
            step="0.05"
            value={opacityNum}
            onChange={(e) => onPropertyChange('opacity', e.target.value)}
          />
          <span className="editor-slider-value">{opacityNum}</span>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/editor/LayoutEditor.tsx
git commit -m "feat: add LayoutEditor with display, dimensions, flex, and opacity controls"
```

---

### Task 10: Create Main EditorPanel Component

**Files:**
- Create: `frontend/src/components/EditorPanel.tsx`
- Create: `frontend/src/components/EditorPanel.css`

**Step 1: Create EditorPanel.tsx**

This is the main orchestrator that wires up all sub-editors and handles the postMessage bridge:

```typescript
import { useEffect } from 'react'
import { useEditorStore } from '../stores/editorStore'
import { useInspectorStore } from '../stores/inspectorStore'
import { ContentEditor } from './editor/ContentEditor'
import { ColorPicker } from './editor/ColorPicker'
import { TypographyEditor } from './editor/TypographyEditor'
import { SpacingEditor } from './editor/SpacingEditor'
import { LayoutEditor } from './editor/LayoutEditor'
import './EditorPanel.css'

interface EditorPanelProps {
  applyEdit: (selector: string, property: string, value: string) => void
  revertEdits: () => void
  revertElement: (selector: string) => void
  getComputedStyles: (selector: string) => void
}

export function EditorPanel({ applyEdit, revertEdits, revertElement, getComputedStyles }: EditorPanelProps) {
  const activeElement = useEditorStore((s) => s.activeElement)
  const pendingEdits = useEditorStore((s) => s.pendingEdits)
  const computedStyles = useEditorStore((s) => s.computedStyles)
  const sourceInfoMap = useEditorStore((s) => s.sourceInfoMap)
  const { addEdit, revertAll, revertElement: revertElementEdits, getPendingEditCount, setActiveElement } = useEditorStore()
  const selectedElements = useInspectorStore((s) => s.selectedElements)

  // Request computed styles when active element changes
  useEffect(() => {
    if (activeElement) {
      getComputedStyles(activeElement)
    }
  }, [activeElement, getComputedStyles])

  // Populate source info from selected elements
  useEffect(() => {
    for (const el of selectedElements) {
      useEditorStore.getState().setSourceInfo(el.selector, el.sourceFile, el.sourceLine, el.componentName)
    }
  }, [selectedElements])

  if (!activeElement) {
    return (
      <div className="editor-panel editor-panel-empty">
        <p className="editor-empty-message">Click a selected element in Edit mode to start editing its properties.</p>
        {selectedElements.length === 0 && (
          <p className="editor-empty-hint">Switch to Inspect mode first to select elements.</p>
        )}
      </div>
    )
  }

  const styles = computedStyles[activeElement] ?? {}
  const elementEdits = pendingEdits[activeElement] ?? []
  const sourceInfo = sourceInfoMap[activeElement]

  // Get current value: pending edit overrides computed style
  const getVal = (property: string): string => {
    const edit = elementEdits.find((e) => e.property === property)
    return edit ? edit.value : (styles[property] ?? '')
  }

  const handlePropertyChange = (property: string, value: string) => {
    const original = styles[property] ?? ''
    addEdit(activeElement, property, value, original)
    applyEdit(activeElement, property, value)
  }

  const handleRevert = () => {
    revertElement(activeElement)
    revertElementEdits(activeElement)
    getComputedStyles(activeElement)
  }

  const handleRevertAll = () => {
    revertEdits()
    revertAll()
  }

  const handleBack = () => {
    setActiveElement(null)
  }

  const editCount = getPendingEditCount()

  return (
    <div className="editor-panel">
      <div className="editor-panel-header">
        <button className="editor-back-button" onClick={handleBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Selection
        </button>
        <span className="editor-element-badge" title={activeElement}>
          {activeElement.length > 30 ? `${activeElement.slice(0, 30)}...` : activeElement}
        </span>
      </div>

      <div className="editor-panel-content">
        <ContentEditor
          value={getVal('textContent')}
          onChange={(v) => handlePropertyChange('textContent', v)}
        />

        <div className="editor-section">
          <h4 className="editor-section-title">Colors</h4>
          <ColorPicker label="Text" value={getVal('color')} onChange={(v) => handlePropertyChange('color', v)} />
          <ColorPicker label="Background" value={getVal('backgroundColor')} onChange={(v) => handlePropertyChange('backgroundColor', v)} />
          <ColorPicker label="Border" value={getVal('borderColor')} onChange={(v) => handlePropertyChange('borderColor', v)} />
        </div>

        <TypographyEditor
          fontFamily={getVal('fontFamily')}
          fontSize={getVal('fontSize')}
          fontWeight={getVal('fontWeight')}
          lineHeight={getVal('lineHeight')}
          letterSpacing={getVal('letterSpacing')}
          onPropertyChange={handlePropertyChange}
        />

        <SpacingEditor
          marginTop={getVal('marginTop')}
          marginRight={getVal('marginRight')}
          marginBottom={getVal('marginBottom')}
          marginLeft={getVal('marginLeft')}
          paddingTop={getVal('paddingTop')}
          paddingRight={getVal('paddingRight')}
          paddingBottom={getVal('paddingBottom')}
          paddingLeft={getVal('paddingLeft')}
          onPropertyChange={handlePropertyChange}
        />

        <LayoutEditor
          display={getVal('display')}
          width={getVal('width')}
          height={getVal('height')}
          flexDirection={getVal('flexDirection')}
          alignItems={getVal('alignItems')}
          justifyContent={getVal('justifyContent')}
          gap={getVal('gap')}
          opacity={getVal('opacity')}
          onPropertyChange={handlePropertyChange}
        />
      </div>

      {sourceInfo?.sourceFile && (
        <div className="editor-source-info">
          Source: {sourceInfo.sourceFile}:{sourceInfo.sourceLine}
          {sourceInfo.componentName && ` (${sourceInfo.componentName})`}
        </div>
      )}

      <div className="editor-panel-footer">
        <div className="editor-actions">
          <button className="editor-button editor-button-primary" disabled={editCount === 0}>
            Apply Changes
          </button>
          <button className="editor-button editor-button-secondary" onClick={handleRevert} disabled={elementEdits.length === 0}>
            Revert Element
          </button>
          <button className="editor-button editor-button-secondary" onClick={handleRevertAll} disabled={editCount === 0}>
            Revert All
          </button>
        </div>
        {editCount > 0 && (
          <span className="editor-pending-count">{editCount} pending change{editCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Create EditorPanel.css**

Create `frontend/src/components/EditorPanel.css` with styles for all editor components. Key sections:

- `.editor-panel` — full height flex column
- `.editor-panel-header` — back button + element badge
- `.editor-panel-content` — scrollable middle with property sections
- `.editor-section` — grouped property area
- `.editor-color-row` — label + color picker + hex input inline
- `.editor-slider-row` — range slider + value display
- `.box-model` — nested div DevTools-style box model visualizer
- `.editor-panel-footer` — sticky bottom with apply/revert buttons
- `.editor-source-info` — subtle file path display

(CSS should follow the existing patterns in `ExpandableSidebar.css` and `FloatingWidget.css` for color variables and sizing.)

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/EditorPanel.tsx frontend/src/components/EditorPanel.css
git commit -m "feat: add EditorPanel orchestrating all property editor sub-components"
```

---

## Phase 4: Sidebar Integration & Edit Mode Button

### Task 11: Add Edit Mode Button to FloatingWidget

**Files:**
- Modify: `frontend/src/components/FloatingWidget.tsx`

**Step 1: Add edit mode button**

In `FloatingWidget.tsx`, add a new button between the Screenshot button (line 85) and the Sidebar Toggle button (line 87):

```typescript
<button
  className={`widget-button ${mode === 'edit' ? 'active' : ''}`}
  onClick={() => setMode('edit')}
  title="Edit Element"
  aria-label="Edit element mode"
  aria-pressed={mode === 'edit'}
>
  <span className="widget-icon">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  </span>
</button>
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/FloatingWidget.tsx
git commit -m "feat: add Edit mode button to FloatingWidget"
```

---

### Task 12: Wire EditorPanel into ExpandableSidebar

**Files:**
- Modify: `frontend/src/components/ExpandableSidebar.tsx`

**Step 1: Conditionally render EditorPanel when in edit mode**

Update `ExpandableSidebar.tsx` to show the EditorPanel when `mode === 'edit'`, otherwise show the existing context panel content:

```typescript
import { useEffect } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { useEditorStore } from '../stores/editorStore'
import { SelectionPreview } from './SelectionPreview'
import { ImageUpload } from './ImageUpload'
import { InstructionInput } from './InstructionInput'
import { PayloadPreview } from './PayloadPreview'
import { EditorPanel } from './EditorPanel'
import './ExpandableSidebar.css'

interface ExpandableSidebarProps {
  applyEdit: (selector: string, property: string, value: string) => void
  revertEdits: () => void
  revertElement: (selector: string) => void
  getComputedStyles: (selector: string) => void
}

export function ExpandableSidebar({ applyEdit, revertEdits, revertElement, getComputedStyles }: ExpandableSidebarProps) {
  const { isSidebarOpen, closeSidebar, mode } = useInspectorStore()
  const activeElement = useEditorStore((s) => s.activeElement)
  const isEditMode = mode === 'edit'

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        closeSidebar()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isSidebarOpen, closeSidebar])

  return (
    <aside
      className={`expandable-sidebar ${isSidebarOpen ? 'open' : ''}`}
      role="complementary"
      aria-label={isEditMode ? 'Editor Panel' : 'Context Panel'}
      aria-hidden={!isSidebarOpen}
    >
      <div className="sidebar-header">
        <h2>{isEditMode ? 'Editor' : 'Context Panel'}</h2>
        <button
          className="sidebar-close"
          onClick={closeSidebar}
          title="Close Panel (Escape)"
          aria-label="Close Panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="sidebar-content">
        {isEditMode ? (
          <EditorPanel
            applyEdit={applyEdit}
            revertEdits={revertEdits}
            revertElement={revertElement}
            getComputedStyles={getComputedStyles}
          />
        ) : (
          <>
            <div className="sidebar-section">
              <h3>Selection</h3>
              <SelectionPreview />
            </div>
            <div className="sidebar-section">
              <h3>Reference Images</h3>
              <ImageUpload />
            </div>
            <div className="sidebar-section">
              <h3>Instructions</h3>
              <InstructionInput />
            </div>
            <div className="sidebar-section">
              <h3>Export</h3>
              <PayloadPreview />
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
```

**Step 2: Update parent component to pass postMessage helpers**

The parent component that renders `<ExpandableSidebar />` needs to pass the edit command props. Find where `ExpandableSidebar` is used (likely in `App.tsx` or `Viewport.tsx`) and pass the `applyEdit`, `revertEdits`, `revertElement`, and `getComputedStyles` props from the `usePostMessage` hook.

Check: `frontend/src/App.tsx` — look for `<ExpandableSidebar />` and add the props.

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/ExpandableSidebar.tsx frontend/src/App.tsx
git commit -m "feat: wire EditorPanel into sidebar with conditional edit/context mode rendering"
```

---

## Phase 5: Deterministic Source Editor (Backend)

### Task 13: Create Source Editor Python Module

**Files:**
- Create: `proxy/source_editor.py`
- Test: `proxy/tests/test_source_editor.py`

**Step 1: Write failing tests**

Create `proxy/tests/test_source_editor.py`:

```python
import pytest
import os
import tempfile
from pathlib import Path
from source_editor import apply_inline_style_edit, apply_css_class_edit, partition_edits


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project directory with sample files."""
    # React component with inline styles
    comp_file = tmp_path / "src" / "components" / "Button.tsx"
    comp_file.parent.mkdir(parents=True, exist_ok=True)
    comp_file.write_text('''import React from 'react'

export function Button({ children }) {
  return (
    <button style={{ backgroundColor: '#cccccc', fontSize: '14px' }}>
      {children}
    </button>
  )
}
''')

    # CSS file
    css_file = tmp_path / "src" / "components" / "Button.css"
    css_file.write_text('''.btn-primary {
  background-color: #cccccc;
  font-size: 14px;
  padding: 8px 16px;
}

.btn-secondary {
  background-color: #eeeeee;
}
''')

    return tmp_path


class TestPartitionEdits:
    def test_simple_css_with_source_goes_deterministic(self):
        edits = [{
            "selector": ".btn",
            "sourceFile": "src/Button.tsx",
            "sourceLine": 5,
            "componentName": "Button",
            "changes": [{"property": "backgroundColor", "value": "#0066ff", "original": "#cccccc"}]
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
            "changes": [{"property": "textContent", "value": "Submit", "original": "Click"}]
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
            "changes": [{"property": "backgroundColor", "value": "#0066ff", "original": "#cccccc"}]
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
                {"property": "textContent", "value": "Submit", "original": "Click"}
            ]
        }]
        deterministic, ai_assisted = partition_edits(edits)
        assert len(deterministic) == 1
        assert len(deterministic[0]["changes"]) == 1
        assert deterministic[0]["changes"][0]["property"] == "backgroundColor"
        assert len(ai_assisted) == 1
        assert ai_assisted[0]["changes"][0]["property"] == "textContent"
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_source_editor.py -v`
Expected: FAIL — module not found

**Step 3: Implement source_editor.py**

Create `proxy/source_editor.py`:

```python
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

# Properties that require AI assistance (structural changes)
AI_ONLY_PROPERTIES = {"textContent"}


def partition_edits(edits: list[dict[str, Any]]) -> tuple[list[dict], list[dict]]:
    """Split edits into deterministic (direct file write) and AI-assisted groups.

    For each element's changes:
    - CSS properties WITH source mapping → deterministic
    - textContent or any property WITHOUT source mapping → AI-assisted
    """
    deterministic = []
    ai_assisted = []

    for edit in edits:
        has_source = edit.get("sourceFile") is not None and edit.get("sourceLine") is not None
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

    content = file_path.read_text()
    lines = content.split("\n")

    # Search within a window around the source line (0-indexed internally)
    line_idx = source_line - 1
    search_start = max(0, line_idx - 5)
    search_end = min(len(lines), line_idx + 15)

    camel_prop = property_name
    # Pattern: camelCase: 'value' or camelCase: "value"
    pattern = re.compile(
        rf"""({re.escape(camel_prop)}\s*:\s*)(['"])([^'"]*)\2"""
    )

    for i in range(search_start, search_end):
        match = pattern.search(lines[i])
        if match:
            lines[i] = lines[i][: match.start()] + f"{match.group(1)}'{new_value}'" + lines[i][match.end():]
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
    """Apply a CSS property change in a CSS/SCSS file.

    Finds the selector block and updates or adds the property.
    Returns True if the edit was applied.
    """
    file_path = project_dir / css_file
    if not file_path.is_file():
        return False

    content = file_path.read_text()
    kebab_prop = camel_to_kebab(property_name)

    # Find the selector block
    # Simple approach: find selector { ... } and update the property inside
    escaped_selector = re.escape(selector)
    block_pattern = re.compile(
        rf"({escaped_selector}\s*\{{[^}}]*?)({re.escape(kebab_prop)}\s*:\s*)([^;]+)(;[^}}]*\}})",
        re.DOTALL,
    )

    match = block_pattern.search(content)
    if match:
        new_content = (
            content[: match.start()]
            + match.group(1)
            + f"{kebab_prop}: {new_value}"
            + match.group(4)
            + content[match.end():]
        )
        file_path.write_text(new_content)
        return True

    return False
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/test_source_editor.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add proxy/source_editor.py proxy/tests/test_source_editor.py
git commit -m "feat: add source_editor with edit partitioning and deterministic CSS writes"
```

---

### Task 14: Add /api/apply-edits Endpoint

**Files:**
- Modify: `proxy/main.py`

**Step 1: Add the apply-edits endpoint**

In `proxy/main.py`, add a new Pydantic model and endpoint:

```python
from source_editor import partition_edits, apply_inline_style_edit

class ApplyEditsRequest(BaseModel):
    edits: list[dict]

@app.post("/api/apply-edits")
async def apply_edits(request: ApplyEditsRequest):
    """Apply direct edits to source files.

    Partitions edits into deterministic (direct file write) and AI-assisted.
    Executes deterministic edits immediately.
    Returns AI-assisted edits for the frontend to route to the agent.
    """
    output_dir = os.environ.get("VCI_OUTPUT_DIR")
    if not output_dir:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "VCI_OUTPUT_DIR not configured"}
        )

    project_dir = Path(output_dir)
    deterministic, ai_assisted = partition_edits(request.edits)

    applied = []
    failed = []
    for edit in deterministic:
        source_file = edit.get("sourceFile")
        source_line = edit.get("sourceLine")
        for change in edit.get("changes", []):
            success = apply_inline_style_edit(
                project_dir,
                source_file,
                source_line,
                change["property"],
                change["value"],
            )
            entry = {
                "selector": edit["selector"],
                "property": change["property"],
                "value": change["value"],
            }
            if success:
                applied.append(entry)
            else:
                failed.append(entry)

    return {
        "success": True,
        "applied": applied,
        "failed": failed,
        "aiAssisted": ai_assisted,
    }
```

**Step 2: Verify the endpoint works**

Run the proxy and test with curl:
```bash
curl -X POST http://localhost:8000/api/apply-edits \
  -H "Content-Type: application/json" \
  -d '{"edits": []}'
```
Expected: `{"success": true, "applied": [], "failed": [], "aiAssisted": []}`

**Step 3: Commit**

```bash
git add proxy/main.py
git commit -m "feat: add /api/apply-edits endpoint for deterministic source editing"
```

---

## Phase 6: Apply Flow Integration

### Task 15: Wire Apply Button to Hybrid Engine

**Files:**
- Modify: `frontend/src/components/EditorPanel.tsx`
- Create: `frontend/src/services/editApi.ts`

**Step 1: Create the edit API service**

Create `frontend/src/services/editApi.ts`:

```typescript
import type { ElementEdits } from '../types/inspector'

interface ApplyEditsResponse {
  success: boolean
  applied: Array<{ selector: string; property: string; value: string }>
  failed: Array<{ selector: string; property: string; value: string }>
  aiAssisted: ElementEdits[]
}

const PROXY_URL = import.meta.env.VITE_PROXY_URL || ''

export async function applyEditsToSource(edits: ElementEdits[]): Promise<ApplyEditsResponse> {
  const response = await fetch(`${PROXY_URL}/api/apply-edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits }),
  })

  if (!response.ok) {
    throw new Error(`Apply edits failed: ${response.statusText}`)
  }

  return response.json()
}
```

**Step 2: Update EditorPanel to use apply flow**

In `EditorPanel.tsx`, update the "Apply Changes" button to call the apply service, then route AI-assisted edits to the existing agent flow:

```typescript
// Add to imports:
import { applyEditsToSource } from '../services/editApi'

// Replace the Apply Changes button with:
const [isApplying, setIsApplying] = useState(false)

const handleApply = async () => {
  const editsForApply = getEditsForApply()
  if (editsForApply.length === 0) return

  setIsApplying(true)
  try {
    const result = await applyEditsToSource(editsForApply)

    if (result.applied.length > 0) {
      useInspectorStore.getState().showToast(
        `Applied ${result.applied.length} change${result.applied.length !== 1 ? 's' : ''} directly`
      )
    }

    if (result.aiAssisted.length > 0) {
      // TODO: Route to agent service with precise instructions
      useInspectorStore.getState().showToast(
        `${result.aiAssisted.length} change${result.aiAssisted.length !== 1 ? 's' : ''} sent to agent`
      )
    }

    // Clear pending edits and reload iframe
    revertAll()
    revertEdits()
    useInspectorStore.getState().reloadIframe()
  } catch (error) {
    useInspectorStore.getState().showToast(
      `Failed to apply changes: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    setIsApplying(false)
  }
}
```

Update the Apply button JSX:

```typescript
<button
  className="editor-button editor-button-primary"
  onClick={handleApply}
  disabled={editCount === 0 || isApplying}
>
  {isApplying ? 'Applying...' : 'Apply Changes'}
</button>
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/services/editApi.ts frontend/src/components/EditorPanel.tsx
git commit -m "feat: wire Apply button to hybrid engine with deterministic + AI routing"
```

---

### Task 16: Format Precise Edit Instructions for AI Path

**Files:**
- Modify: `proxy/formatter.py`

**Step 1: Add edit instruction formatting**

In `proxy/formatter.py`, add a function that converts AI-assisted edits into precise agent instructions:

```python
def format_edit_instructions(ai_edits: list[dict]) -> str:
    """Convert structured edit data into precise, unambiguous agent instructions."""
    lines = ["# Direct Edit Instructions", ""]
    lines.append("The user has made specific visual edits that need to be applied to source code.")
    lines.append("Apply EXACTLY these changes - do not interpret or expand them.")
    lines.append("")

    for edit in ai_edits:
        selector = edit.get("selector", "unknown")
        source = edit.get("sourceFile")
        line = edit.get("sourceLine")
        component = edit.get("componentName")

        location = ""
        if source:
            location = f" in {source}"
            if line:
                location += f":{line}"
            if component:
                location += f" ({component})"

        lines.append(f"## Element: `{selector}`{location}")
        for change in edit.get("changes", []):
            prop = change.get("property", "")
            old = change.get("original", "")
            new = change.get("value", "")
            lines.append(f"- Change `{prop}` from `{old}` to `{new}`")
        lines.append("")

    return "\n".join(lines)
```

**Step 2: Commit**

```bash
git add proxy/formatter.py
git commit -m "feat: add precise edit instruction formatter for AI-assisted path"
```

---

## Phase 7: End-to-End Integration Testing

### Task 17: Manual Integration Test

**No code changes — verify the full flow works.**

**Step 1: Start the application**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app && docker compose up
```

**Step 2: Test the flow**

1. Open VCI at `http://localhost:5173`
2. Switch to Inspection mode, click 2-3 elements to select them
3. Switch to Edit mode (new pencil button)
4. Click a selected element — sidebar should transform to Editor Panel
5. Change the background color using the color picker — should preview live
6. Change font size with the slider — should preview live
7. Edit text content — should preview live
8. Click "Revert Element" — element should restore to original
9. Make changes again, click "Apply Changes" — should write to source and reload
10. Verify source file was modified
11. Click "Back to Selection" — sidebar should return to context panel

**Step 3: Fix any issues found during manual testing**

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues found during manual testing"
```

---

### Task 18: Write Integration Tests

**Files:**
- Create: `frontend/src/components/__tests__/EditorPanel.test.tsx`

**Step 1: Write component integration tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorPanel } from '../EditorPanel'
import { useEditorStore } from '../../stores/editorStore'
import { useInspectorStore } from '../../stores/inspectorStore'

const mockApplyEdit = vi.fn()
const mockRevertEdits = vi.fn()
const mockRevertElement = vi.fn()
const mockGetComputedStyles = vi.fn()

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useInspectorStore.getState().resetAll()
  })

  it('shows empty state when no element is active', () => {
    render(
      <EditorPanel
        applyEdit={mockApplyEdit}
        revertEdits={mockRevertEdits}
        revertElement={mockRevertElement}
        getComputedStyles={mockGetComputedStyles}
      />
    )
    expect(screen.getByText(/click a selected element/i)).toBeInTheDocument()
  })

  it('requests computed styles when active element is set', () => {
    useEditorStore.getState().setActiveElement('.btn')
    render(
      <EditorPanel
        applyEdit={mockApplyEdit}
        revertEdits={mockRevertEdits}
        revertElement={mockRevertElement}
        getComputedStyles={mockGetComputedStyles}
      />
    )
    expect(mockGetComputedStyles).toHaveBeenCalledWith('.btn')
  })

  it('sends APPLY_EDIT via postMessage when property changes', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().setComputedStyles('.btn', {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)',
      borderColor: 'rgb(0, 0, 0)',
      fontSize: '16px',
      fontWeight: '400',
      fontFamily: 'Arial',
      lineHeight: '1.5',
      letterSpacing: '0px',
      textContent: 'Click me',
      marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
      paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px', paddingLeft: '16px',
      display: 'block', width: '100px', height: '40px',
      flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-start',
      gap: 'normal', opacity: '1',
    })

    render(
      <EditorPanel
        applyEdit={mockApplyEdit}
        revertEdits={mockRevertEdits}
        revertElement={mockRevertElement}
        getComputedStyles={mockGetComputedStyles}
      />
    )

    // Verify sections render
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Colors')).toBeInTheDocument()
    expect(screen.getByText('Typography')).toBeInTheDocument()
    expect(screen.getByText('Spacing')).toBeInTheDocument()
    expect(screen.getByText('Layout')).toBeInTheDocument()
  })
})
```

Note: You will need `@testing-library/react` and `@testing-library/jest-dom`. If not installed:
```bash
cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npm install -D @testing-library/react @testing-library/jest-dom
```

**Step 2: Run tests**

Run: `cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx vitest run src/components/__tests__/EditorPanel.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add frontend/src/components/__tests__/EditorPanel.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "test: add EditorPanel integration tests"
```

---

### Task 19: Final Verification & Cleanup

**Step 1: Run all tests**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx vitest run --coverage
```
Expected: All tests pass, coverage > 80% for new files

**Step 2: Run TypeScript check**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/frontend && npx tsc --noEmit
```
Expected: No errors

**Step 3: Run Python tests**

```bash
cd /Users/danielthai/Developer/visual-context-interface-app/proxy && python -m pytest tests/ -v
```
Expected: All tests pass

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup and verification for direct editing feature"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|------------------|
| **1: Foundation** | Tasks 1-2 | Types, editor store with full test coverage |
| **2: Inspector Handlers** | Tasks 3-4 | Bidirectional edit commands in inspector.js + usePostMessage |
| **3: Editor UI** | Tasks 5-10 | All editor sub-components + main EditorPanel |
| **4: Sidebar Integration** | Tasks 11-12 | Edit mode button + conditional sidebar rendering |
| **5: Source Editor** | Tasks 13-14 | Python deterministic edit engine + API endpoint |
| **6: Apply Flow** | Tasks 15-16 | Frontend apply service + AI instruction formatter |
| **7: Integration** | Tasks 17-19 | Manual testing, automated tests, final verification |
