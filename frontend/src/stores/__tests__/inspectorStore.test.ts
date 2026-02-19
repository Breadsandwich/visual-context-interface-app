import { describe, it, expect, beforeEach } from 'vitest'
import { useInspectorStore } from '../inspectorStore'
import type { ElementContext } from '../../types/inspector'

const mockElement: ElementContext = {
  tagName: 'button',
  id: 'submit-btn',
  classes: ['btn', 'btn-primary'],
  selector: 'button#submit-btn',
  outerHTML: '<button id="submit-btn" class="btn btn-primary">Submit</button>',
  boundingRect: { x: 0, y: 0, width: 100, height: 40 } as DOMRect,
  sourceFile: 'Form.tsx',
  sourceLine: 25,
  componentName: 'Form',
}

beforeEach(() => {
  useInspectorStore.getState().resetAll()
})

describe('inspectorStore elementEdits', () => {
  describe('setElementEdits', () => {
    it('stores edits for a selector', () => {
      useInspectorStore.getState().setElementEdits('button#submit-btn', [
        { property: 'color', value: 'red', original: 'blue' },
      ])

      expect(useInspectorStore.getState().elementEdits['button#submit-btn']).toEqual([
        { property: 'color', value: 'red', original: 'blue' },
      ])
    })

    it('removes key when edits array is empty', () => {
      useInspectorStore.getState().setElementEdits('button#submit-btn', [
        { property: 'color', value: 'red', original: 'blue' },
      ])
      useInspectorStore.getState().setElementEdits('button#submit-btn', [])

      expect(useInspectorStore.getState().elementEdits['button#submit-btn']).toBeUndefined()
    })
  })

  describe('clearElementEdits', () => {
    it('removes edits for a selector', () => {
      useInspectorStore.getState().setElementEdits('button#submit-btn', [
        { property: 'color', value: 'red', original: 'blue' },
      ])
      useInspectorStore.getState().clearElementEdits('button#submit-btn')

      expect(useInspectorStore.getState().elementEdits['button#submit-btn']).toBeUndefined()
    })
  })

  describe('cleanup on element removal', () => {
    it('clears edits when element is toggled off', () => {
      useInspectorStore.getState().toggleSelectedElement(mockElement)
      useInspectorStore.getState().setElementEdits(mockElement.selector, [
        { property: 'color', value: 'red', original: 'blue' },
      ])

      useInspectorStore.getState().toggleSelectedElement(mockElement)

      expect(useInspectorStore.getState().elementEdits[mockElement.selector]).toBeUndefined()
    })

    it('clears edits when element is removed', () => {
      useInspectorStore.getState().toggleSelectedElement(mockElement)
      useInspectorStore.getState().setElementEdits(mockElement.selector, [
        { property: 'color', value: 'red', original: 'blue' },
      ])

      useInspectorStore.getState().removeSelectedElement(mockElement.selector)

      expect(useInspectorStore.getState().elementEdits[mockElement.selector]).toBeUndefined()
    })

    it('clears edits on clearSelection', () => {
      useInspectorStore.getState().toggleSelectedElement(mockElement)
      useInspectorStore.getState().setElementEdits(mockElement.selector, [
        { property: 'color', value: 'red', original: 'blue' },
      ])

      useInspectorStore.getState().clearSelection()

      expect(useInspectorStore.getState().elementEdits).toEqual({})
    })

    it('clears edits on resetAll', () => {
      useInspectorStore.getState().setElementEdits(mockElement.selector, [
        { property: 'color', value: 'red', original: 'blue' },
      ])

      useInspectorStore.getState().resetAll()

      expect(useInspectorStore.getState().elementEdits).toEqual({})
    })
  })
})

describe('inspectorStore generatePayload', () => {
  it('includes savedEdits in context entries', () => {
    useInspectorStore.getState().toggleSelectedElement(mockElement)
    useInspectorStore.getState().setElementEdits(mockElement.selector, [
      { property: 'color', value: 'red', original: 'blue' },
      { property: 'fontSize', value: '20px', original: '16px' },
    ])

    const payload = useInspectorStore.getState().generatePayload()

    expect(payload.contexts).toHaveLength(1)
    expect(payload.contexts[0].savedEdits).toEqual([
      { property: 'color', value: 'red', original: 'blue' },
      { property: 'fontSize', value: '20px', original: '16px' },
    ])
  })

  it('returns empty savedEdits array when no edits exist', () => {
    useInspectorStore.getState().toggleSelectedElement(mockElement)

    const payload = useInspectorStore.getState().generatePayload()

    expect(payload.contexts[0].savedEdits).toEqual([])
  })

  it('applies textContent edits to html in payload', () => {
    useInspectorStore.getState().toggleSelectedElement(mockElement)
    useInspectorStore.getState().setElementEdits(mockElement.selector, [
      { property: 'textContent', value: 'Confirm', original: 'Submit' },
    ])

    const payload = useInspectorStore.getState().generatePayload()

    expect(payload.contexts[0].html).toBe(
      '<button id="submit-btn" class="btn btn-primary">Confirm</button>'
    )
  })

  it('does not alter html for non-textContent edits', () => {
    useInspectorStore.getState().toggleSelectedElement(mockElement)
    useInspectorStore.getState().setElementEdits(mockElement.selector, [
      { property: 'color', value: 'red', original: 'blue' },
    ])

    const payload = useInspectorStore.getState().generatePayload()

    expect(payload.contexts[0].html).toBe(mockElement.outerHTML)
  })
})
