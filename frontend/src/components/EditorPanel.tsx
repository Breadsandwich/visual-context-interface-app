import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../stores/editorStore'
import { applyEditsToSource } from '../services/editApi'
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

export function EditorPanel({
  applyEdit,
  revertEdits,
  revertElement,
  getComputedStyles,
}: EditorPanelProps) {
  const activeElement = useEditorStore((s) => s.activeElement)
  const pendingEdits = useEditorStore((s) => s.pendingEdits)
  const computedStyles = useEditorStore((s) => s.computedStyles)
  const sourceInfoMap = useEditorStore((s) => s.sourceInfoMap)
  const selectedElements = useInspectorStore((s) => s.selectedElements)

  const elementEdits = activeElement ? (pendingEdits[activeElement] ?? []) : []
  const styles = activeElement ? (computedStyles[activeElement] ?? {}) : {}
  const sourceInfo = activeElement ? sourceInfoMap[activeElement] : null
  const pendingEditCount = useEditorStore((s) => s.getPendingEditCount())
  const [isApplying, setIsApplying] = useState(false)

  // Populate source info from selected elements
  useEffect(() => {
    for (const el of selectedElements) {
      useEditorStore.getState().setSourceInfo(el.selector, {
        sourceFile: el.sourceFile,
        sourceLine: el.sourceLine,
        componentName: el.componentName,
      })
    }
  }, [selectedElements])

  // Request computed styles when active element changes
  useEffect(() => {
    if (activeElement) {
      getComputedStyles(activeElement)
    }
  }, [activeElement, getComputedStyles])

  const getVal = useCallback(
    (property: string): string => {
      const edit = elementEdits.find((e) => e.property === property)
      return edit ? edit.value : (styles[property] ?? '')
    },
    [elementEdits, styles]
  )

  const handlePropertyChange = useCallback(
    (property: string, value: string) => {
      if (!activeElement) return
      useEditorStore.getState().addEdit(activeElement, {
        property,
        value,
        original: styles[property] ?? '',
      })
      applyEdit(activeElement, property, value)
    },
    [activeElement, styles, applyEdit]
  )

  const handleRevertElement = useCallback(() => {
    if (!activeElement) return
    useEditorStore.getState().revertElement(activeElement)
    revertElement(activeElement)
  }, [activeElement, revertElement])

  const handleRevertAll = useCallback(() => {
    useEditorStore.getState().revertAll()
    revertEdits()
  }, [revertEdits])

  const handleApply = useCallback(async () => {
    const editsForApply = useEditorStore.getState().getEditsForApply()
    if (editsForApply.length === 0) return

    setIsApplying(true)
    try {
      const result = await applyEditsToSource(editsForApply)

      if (result.applied.length > 0) {
        useInspectorStore.getState().showToast(
          `Applied ${result.applied.length} change${result.applied.length !== 1 ? 's' : ''} directly`
        )
      }

      if (result.failed.length > 0) {
        useInspectorStore.getState().showToast(
          `${result.failed.length} change${result.failed.length !== 1 ? 's' : ''} could not be applied`
        )
      }

      if (result.aiAssisted.length > 0) {
        useInspectorStore.getState().showToast(
          `${result.aiAssisted.length} element${result.aiAssisted.length !== 1 ? 's' : ''} sent to agent`
        )
      }

      // Clear pending edits and revert live preview
      useEditorStore.getState().revertAll()
      revertEdits()

      // Reload iframe to show source changes
      useInspectorStore.getState().reloadIframe()
    } catch (error) {
      useInspectorStore.getState().showToast(
        `Failed to apply: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      setIsApplying(false)
    }
  }, [revertEdits])

  if (!activeElement) {
    return (
      <div className="editor-panel">
        <div className="editor-panel-empty">
          <p className="editor-empty-message">No element selected</p>
          <p className="editor-empty-hint">
            Click a selected element to edit its properties
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-panel">
      <div className="editor-panel-header">
        <span className="editor-element-badge">{activeElement}</span>
      </div>

      <div className="editor-panel-content">
        <ContentEditor
          value={getVal('textContent')}
          childContents={styles['childContents'] ?? ''}
          onChange={(value) => handlePropertyChange('textContent', value)}
        />

        <div className="editor-section">
          <h4 className="editor-section-title">Colors</h4>
          <ColorPicker
            label="Text"
            value={getVal('color')}
            onChange={(value) => handlePropertyChange('color', value)}
          />
          <ColorPicker
            label="Background"
            value={getVal('backgroundColor')}
            onChange={(value) => handlePropertyChange('backgroundColor', value)}
          />
          <ColorPicker
            label="Border"
            value={getVal('borderColor')}
            onChange={(value) => handlePropertyChange('borderColor', value)}
          />
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

        {sourceInfo && (sourceInfo.sourceFile || sourceInfo.componentName) && (
          <div className="editor-source-info">
            {sourceInfo.componentName && (
              <span className="editor-source-component">
                &lt;{sourceInfo.componentName}&gt;
              </span>
            )}
            {sourceInfo.sourceFile && (
              <span className="editor-source-file">
                {sourceInfo.sourceFile}
                {sourceInfo.sourceLine ? `:${sourceInfo.sourceLine}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="editor-panel-footer">
        <div className="editor-actions">
          <button
            className="editor-button editor-button-secondary"
            onClick={handleRevertElement}
            disabled={elementEdits.length === 0}
          >
            Revert Element
          </button>
          <button
            className="editor-button editor-button-secondary"
            onClick={handleRevertAll}
            disabled={pendingEditCount === 0}
          >
            Revert All
          </button>
          <button
            className="editor-button editor-button-primary"
            onClick={handleApply}
            disabled={pendingEditCount === 0 || isApplying}
          >
            {isApplying ? 'Applying...' : 'Apply Changes'}
            {!isApplying && pendingEditCount > 0 && (
              <span className="editor-pending-count">{pendingEditCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
