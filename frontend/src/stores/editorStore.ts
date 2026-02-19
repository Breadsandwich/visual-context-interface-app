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
  addEdit: (selector: string, edit: PropertyEdit) => void
  revertElement: (selector: string) => void
  revertAll: () => void
  getPendingEditCount: () => number
  getEditsForApply: () => ElementEdits[]
  setComputedStyles: (selector: string, styles: Record<string, string>) => void
  setSourceInfo: (selector: string, info: SourceInfo) => void
  resetEditor: () => void
}

const initialState = {
  activeElement: null,
  pendingEdits: {},
  computedStyles: {},
  sourceInfoMap: {},
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  setActiveElement: (selector) => set({ activeElement: selector }),

  addEdit: (selector, edit) => set((state) => {
    const existing = state.pendingEdits[selector] ?? []

    if (edit.value === edit.original) {
      const filtered = existing.filter((e) => e.property !== edit.property)
      if (filtered.length === 0) {
        const { [selector]: _removed, ...rest } = state.pendingEdits
        return { pendingEdits: rest }
      }
      return {
        pendingEdits: {
          ...state.pendingEdits,
          [selector]: filtered,
        },
      }
    }

    const hasExisting = existing.some((e) => e.property === edit.property)

    if (hasExisting) {
      return {
        pendingEdits: {
          ...state.pendingEdits,
          [selector]: existing.map((e) =>
            e.property === edit.property ? { ...edit } : e
          ),
        },
      }
    }

    return {
      pendingEdits: {
        ...state.pendingEdits,
        [selector]: [...existing, { ...edit }],
      },
    }
  }),

  revertElement: (selector) => set((state) => {
    const { [selector]: _removed, ...rest } = state.pendingEdits
    return { pendingEdits: rest }
  }),

  revertAll: () => set({ pendingEdits: {} }),

  getPendingEditCount: () => {
    const { pendingEdits } = get()
    return Object.values(pendingEdits).reduce(
      (total, edits) => total + edits.length,
      0
    )
  },

  getEditsForApply: () => {
    const { pendingEdits, sourceInfoMap } = get()
    return Object.entries(pendingEdits).map(
      ([selector, changes]): ElementEdits => {
        const info = sourceInfoMap[selector]
        return {
          selector,
          sourceFile: info?.sourceFile ?? null,
          sourceLine: info?.sourceLine ?? null,
          componentName: info?.componentName ?? null,
          changes,
        }
      }
    )
  },

  setComputedStyles: (selector, styles) => set((state) => ({
    computedStyles: {
      ...state.computedStyles,
      [selector]: styles,
    },
  })),

  setSourceInfo: (selector, info) => set((state) => ({
    sourceInfoMap: {
      ...state.sourceInfoMap,
      [selector]: info,
    },
  })),

  resetEditor: () => set({ ...initialState }),
}))
