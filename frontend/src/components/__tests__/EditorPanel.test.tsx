import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorPanel } from '../EditorPanel'
import { useEditorStore } from '../../stores/editorStore'

vi.mock('../../services/editApi', () => ({
  applyEditsToSource: vi.fn(),
}))

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

  it('returns to empty state when Back button is clicked', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    const backButton = screen.getByRole('button', { name: /back to selection/i })
    fireEvent.click(backButton)

    expect(useEditorStore.getState().activeElement).toBeNull()
  })

  it('shows Apply button disabled when no edits', () => {
    useEditorStore.getState().setActiveElement('.btn')
    renderPanel()

    const applyButton = screen.getByRole('button', { name: /apply changes/i })
    expect(applyButton).toBeDisabled()
  })

  it('shows Apply button enabled when edits exist', () => {
    useEditorStore.getState().setActiveElement('.btn')
    useEditorStore.getState().setComputedStyles('.btn', { color: 'rgb(0,0,0)' })
    useEditorStore.getState().addEdit('.btn', {
      property: 'color',
      value: '#ff0000',
      original: 'rgb(0,0,0)',
    })
    renderPanel()

    const applyButton = screen.getByRole('button', { name: /apply changes/i })
    expect(applyButton).not.toBeDisabled()
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
})
