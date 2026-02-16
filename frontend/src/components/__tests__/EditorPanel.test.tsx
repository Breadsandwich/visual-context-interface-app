import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorPanel } from '../EditorPanel'
import { useEditorStore } from '../../stores/editorStore'

import { useInspectorStore } from '../../stores/inspectorStore'

const mockApplyEdit = vi.fn()
const mockRevertEdits = vi.fn()
const mockRevertElement = vi.fn()
const mockGetComputedStyles = vi.fn()

function renderPanel() {
  return render(
    <EditorPanel
      applyEdit={mockApplyEdit}
      revertEdits={mockRevertEdits}
      revertElement={mockRevertElement}
      getComputedStyles={mockGetComputedStyles}
    />
  )
}

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useInspectorStore.getState().resetAll()
  })

  it('shows empty state when no element is active', () => {
    renderPanel()
    expect(screen.getByText(/no element selected/i)).toBeInTheDocument()
  })

  it('requests computed styles when active element is set', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()
    expect(mockGetComputedStyles).toHaveBeenCalledWith('.btn')
  })

  it('renders all editor sections when element is active with styles', () => {
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
      marginTop: '0px',
      marginRight: '0px',
      marginBottom: '0px',
      marginLeft: '0px',
      paddingTop: '8px',
      paddingRight: '16px',
      paddingBottom: '8px',
      paddingLeft: '16px',
      display: 'block',
      width: '100px',
      height: '40px',
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      gap: '0px',
      opacity: '1',
    })

    renderPanel()

    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Colors')).toBeInTheDocument()
    expect(screen.getByText('Typography')).toBeInTheDocument()
    expect(screen.getByText('Spacing')).toBeInTheDocument()
    expect(screen.getByText('Layout')).toBeInTheDocument()
  })

  it('shows element badge in header when element is active', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    expect(screen.getByText('.btn')).toBeInTheDocument()
  })

  it('shows Save button disabled when no edits', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).toBeDisabled()
  })

  it('shows Save button enabled when edits exist', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().setComputedStyles('.btn', { color: 'rgb(0,0,0)' })
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    renderPanel()

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).not.toBeDisabled()
  })

  it('saves edits to inspectorStore when Save Changes is clicked', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    renderPanel()

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    const savedEdits = useInspectorStore.getState().elementEdits['.btn']
    expect(savedEdits).toHaveLength(1)
    expect(savedEdits[0]).toEqual({
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    // Should clear pending edits
    expect(useEditorStore.getState().pendingEdits).toEqual({})
    // Should navigate back
    expect(useEditorStore.getState().activeElement).toBeNull()
    expect(useInspectorStore.getState().mode).toBe('inspection')
  })

  it('shows pending edit count badge', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    useEditorStore.getState().addEdit('.btn', {
      property: 'fontSize',
      value: '20px',
      original: '16px',
    })
    renderPanel()

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('calls revertElement when Revert Element button is clicked', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    renderPanel()

    const revertBtn = screen.getByRole('button', { name: /revert element/i })
    fireEvent.click(revertBtn)

    expect(mockRevertElement).toHaveBeenCalledWith('.btn')
    expect(useEditorStore.getState().pendingEdits['.btn']).toBeUndefined()
  })

  it('calls revertEdits when Revert All button is clicked', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    renderPanel()

    const revertAllBtn = screen.getByRole('button', { name: /revert all/i })
    fireEvent.click(revertAllBtn)

    expect(mockRevertEdits).toHaveBeenCalled()
    expect(useEditorStore.getState().pendingEdits).toEqual({})
  })

  it('disables Revert Element when the active element has no edits', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    const revertBtn = screen.getByRole('button', { name: /revert element/i })
    expect(revertBtn).toBeDisabled()
  })

  it('disables Revert All when no edits exist globally', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    const revertAllBtn = screen.getByRole('button', { name: /revert all/i })
    expect(revertAllBtn).toBeDisabled()
  })

  it('displays the active element selector as a badge', () => {
    useEditorStore.getState().setActiveElement('.btn-primary')
    renderPanel()

    expect(screen.getByText('.btn-primary')).toBeInTheDocument()
  })

  it('child edit auto-adds child to selection and tracks in pendingEdits', () => {
    const childContents = JSON.stringify([
      { tag: 'h1', text: 'Hello', selector: '.parent > h1' },
      { tag: 'p', text: 'World', selector: '.parent > p' },
    ])

    useEditorStore.getState().setActiveElement('.parent')
    useEditorStore.getState().setComputedStyles('.parent', {
      textContent: '',
      childContents,
    })

    renderPanel()

    // Find the h1 child textarea and edit it
    const textareas = screen.getAllByRole('textbox')
    const h1Textarea = textareas.find((t) => (t as HTMLTextAreaElement).value === 'Hello')
    expect(h1Textarea).toBeDefined()

    fireEvent.change(h1Textarea!, { target: { value: 'Updated' } })
    fireEvent.blur(h1Textarea!)

    // Child should be tracked in pendingEdits
    const childEdits = useEditorStore.getState().pendingEdits['.parent > h1']
    expect(childEdits).toHaveLength(1)
    expect(childEdits[0]).toEqual({
      property: 'textContent',
      value: 'Updated',
      original: 'Hello',
    })

    // Child should be auto-added to selectedElements
    const selected = useInspectorStore.getState().selectedElements
    expect(selected.some((el) => el.selector === '.parent > h1')).toBe(true)

    // Live preview should have been applied
    expect(mockApplyEdit).toHaveBeenCalledWith('.parent > h1', 'textContent', 'Updated')

    // Save Changes button should be enabled
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).not.toBeDisabled()
  })

  it('child edit does not duplicate selection when child already selected', () => {
    const childContents = JSON.stringify([
      { tag: 'h1', text: 'Hello', selector: '.parent > h1' },
      { tag: 'p', text: 'World', selector: '.parent > p' },
    ])

    // Pre-select the child
    useInspectorStore.getState().toggleSelectedElement({
      tagName: 'h1',
      id: '',
      classes: [],
      selector: '.parent > h1',
      outerHTML: '<h1>Hello</h1>',
      boundingRect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 } as DOMRect,
      sourceFile: null,
      sourceLine: null,
      componentName: null,
    })

    useEditorStore.getState().setActiveElement('.parent')
    useEditorStore.getState().setComputedStyles('.parent', {
      textContent: '',
      childContents,
    })

    renderPanel()

    const textareas = screen.getAllByRole('textbox')
    const h1Textarea = textareas.find((t) => (t as HTMLTextAreaElement).value === 'Hello')

    fireEvent.change(h1Textarea!, { target: { value: 'Updated' } })
    fireEvent.blur(h1Textarea!)

    // Should still be only one entry for this selector
    const selected = useInspectorStore.getState().selectedElements
    const matchCount = selected.filter((el) => el.selector === '.parent > h1').length
    expect(matchCount).toBe(1)
  })
})
