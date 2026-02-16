import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../editorStore'

beforeEach(() => {
  useEditorStore.getState().resetEditor()
})

describe('editorStore', () => {
  describe('setActiveElement', () => {
    it('sets the active element selector', () => {
      useEditorStore.getState().setActiveElement('div.hero')
      expect(useEditorStore.getState().activeElement).toBe('div.hero')
    })

    it('clears active element when null', () => {
      useEditorStore.getState().setActiveElement('div.hero')
      useEditorStore.getState().setActiveElement(null)
      expect(useEditorStore.getState().activeElement).toBeNull()
    })
  })

  describe('addEdit', () => {
    it('adds a pending edit for an element', () => {
      useEditorStore.getState().addEdit('div.hero', {
        property: 'color',
        value: 'red',
        original: 'blue',
      })

      const edits = useEditorStore.getState().pendingEdits['div.hero']
      expect(edits).toHaveLength(1)
      expect(edits[0]).toEqual({
        property: 'color',
        value: 'red',
        original: 'blue',
      })
    })

    it('updates existing edit for the same property', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      addEdit('div.hero', { property: 'color', value: 'green', original: 'blue' })

      const edits = useEditorStore.getState().pendingEdits['div.hero']
      expect(edits).toHaveLength(1)
      expect(edits[0].value).toBe('green')
    })

    it('removes edit when value matches original', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      addEdit('div.hero', { property: 'color', value: 'blue', original: 'blue' })

      const edits = useEditorStore.getState().pendingEdits['div.hero']
      expect(edits ?? []).toHaveLength(0)
    })

    it('tracks edits across multiple elements immutably', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })

      const snapshot = useEditorStore.getState().pendingEdits
      addEdit('p.text', { property: 'font-size', value: '20px', original: '16px' })

      const after = useEditorStore.getState().pendingEdits
      expect(after['div.hero']).toHaveLength(1)
      expect(after['p.text']).toHaveLength(1)
      expect(after).not.toBe(snapshot)
    })
  })

  describe('revertElement', () => {
    it('removes all edits for an element', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      addEdit('div.hero', { property: 'font-size', value: '20px', original: '16px' })

      useEditorStore.getState().revertElement('div.hero')
      expect(useEditorStore.getState().pendingEdits['div.hero']).toBeUndefined()
    })
  })

  describe('revertAll', () => {
    it('clears all pending edits', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      addEdit('p.text', { property: 'font-size', value: '20px', original: '16px' })

      useEditorStore.getState().revertAll()
      expect(useEditorStore.getState().pendingEdits).toEqual({})
    })
  })

  describe('getPendingEditCount', () => {
    it('returns total edits across all elements', () => {
      const { addEdit } = useEditorStore.getState()
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      addEdit('div.hero', { property: 'font-size', value: '20px', original: '16px' })
      addEdit('p.text', { property: 'margin', value: '10px', original: '0' })

      expect(useEditorStore.getState().getPendingEditCount()).toBe(3)
    })
  })

  describe('getEditsForApply', () => {
    it('returns ElementEdits[] with source info', () => {
      const { addEdit, setSourceInfo } = useEditorStore.getState()
      setSourceInfo('div.hero', {
        sourceFile: 'Hero.tsx',
        sourceLine: 42,
        componentName: 'Hero',
      })
      addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })

      const result = useEditorStore.getState().getEditsForApply()
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        selector: 'div.hero',
        sourceFile: 'Hero.tsx',
        sourceLine: 42,
        componentName: 'Hero',
        changes: [{ property: 'color', value: 'red', original: 'blue' }],
      })
    })
  })

  describe('setComputedStyles', () => {
    it('stores styles for a selector', () => {
      useEditorStore.getState().setComputedStyles('div.hero', { color: 'blue', margin: '0px' })
      expect(useEditorStore.getState().computedStyles['div.hero']).toEqual({
        color: 'blue',
        margin: '0px',
      })
    })
  })

  describe('resetEditor', () => {
    it('clears all state', () => {
      const state = useEditorStore.getState()
      state.setActiveElement('div.hero')
      state.addEdit('div.hero', { property: 'color', value: 'red', original: 'blue' })
      state.setComputedStyles('div.hero', { color: 'blue' })
      state.setSourceInfo('div.hero', {
        sourceFile: 'Hero.tsx',
        sourceLine: 42,
        componentName: 'Hero',
      })

      useEditorStore.getState().resetEditor()
      const reset = useEditorStore.getState()
      expect(reset.activeElement).toBeNull()
      expect(reset.pendingEdits).toEqual({})
      expect(reset.computedStyles).toEqual({})
      expect(reset.sourceInfoMap).toEqual({})
    })
  })
})
