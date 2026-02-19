import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../stores/editorStore'
import { useInspectorStore } from '../stores/inspectorStore'
import { ContentEditor } from './editor/ContentEditor'
import { FillEditor } from './editor/FillEditor'
import { StrokeEditor } from './editor/StrokeEditor'
import { BorderRadiusEditor } from './editor/BorderRadiusEditor'
import { TypographyEditor } from './editor/TypographyEditor'
import { EffectsEditor } from './editor/EffectsEditor'
import { ShadowEditor } from './editor/ShadowEditor'
import { TransformEditor } from './editor/TransformEditor'
import { SpacingEditor } from './editor/SpacingEditor'
import { LayoutEditor } from './editor/LayoutEditor'
import { PositionEditor } from './editor/PositionEditor'
import { OverflowEditor } from './editor/OverflowEditor'
import { TransitionEditor } from './editor/TransitionEditor'
import { HoverStateEditor, type InteractionState } from './editor/HoverStateEditor'
import type { PropertyEdit } from '../types/inspector'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
import './EditorPanel.css'

function mergeEdits(existing: PropertyEdit[], incoming: PropertyEdit[]): PropertyEdit[] {
  const byProperty = new Map(existing.map((e) => [e.property, e]))
  for (const edit of incoming) {
    byProperty.set(edit.property, { ...edit })
  }
  return Array.from(byProperty.values()).filter((e) => e.value !== e.original)
}

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

  const [activeState, setActiveState] = useState<InteractionState>('normal')
  const [revisionKey, setRevisionKey] = useState(0)

  const elementEdits = activeElement ? (pendingEdits[activeElement] ?? []) : []
  const styles = activeElement ? (computedStyles[activeElement] ?? {}) : {}
  const sourceInfo = activeElement ? sourceInfoMap[activeElement] : null
  const pendingEditCount = useEditorStore((s) => s.getPendingEditCount())

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
      const prefixedProperty = activeState === 'normal' ? property : `${activeState}:${property}`
      useEditorStore.getState().addEdit(activeElement, {
        property: prefixedProperty,
        value,
        original: styles[property] ?? '',
      })
      // Only apply live preview for normal state edits
      if (activeState === 'normal') {
        applyEdit(activeElement, property, value)
      }
    },
    [activeElement, styles, applyEdit, activeState]
  )

  const handleChildChange = useCallback(
    (childSelector: string, value: string, original: string, tagName: string) => {
      // Track edit in pendingEdits (enables Save Changes button)
      useEditorStore.getState().addEdit(childSelector, {
        property: 'textContent',
        value,
        original,
      })

      // Auto-add child to selection if not already there
      const inspectorState = useInspectorStore.getState()
      const alreadySelected = inspectorState.selectedElements.some(
        (el) => el.selector === childSelector
      )
      if (!alreadySelected) {
        inspectorState.toggleSelectedElement({
          tagName,
          id: '',
          classes: [],
          selector: childSelector,
          outerHTML: `<${tagName}>${escapeHtml(original)}</${tagName}>`,
          boundingRect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 } as DOMRect,
          sourceFile: null,
          sourceLine: null,
          componentName: null,
        })
      }

      // Apply live preview to iframe
      applyEdit(childSelector, 'textContent', value)
    },
    [applyEdit]
  )

  const handleRevertElement = useCallback(() => {
    if (!activeElement) return
    useEditorStore.getState().revertElement(activeElement)
    revertElement(activeElement)
    getComputedStyles(activeElement)
    setRevisionKey((k) => k + 1)
  }, [activeElement, revertElement, getComputedStyles])

  const handleRevertAll = useCallback(() => {
    useEditorStore.getState().revertAll()
    revertEdits()
    if (activeElement) {
      getComputedStyles(activeElement)
    }
    setRevisionKey((k) => k + 1)
  }, [revertEdits, activeElement, getComputedStyles])

  const handleSave = useCallback(() => {
    const allPending = useEditorStore.getState().pendingEdits
    const inspectorState = useInspectorStore.getState()

    let totalSaved = 0
    for (const [selector, edits] of Object.entries(allPending)) {
      const existing = inspectorState.elementEdits[selector] ?? []
      const merged = mergeEdits(existing, edits)
      inspectorState.setElementEdits(selector, merged)
      totalSaved += edits.length
    }

    inspectorState.showToast(
      `Saved ${totalSaved} edit${totalSaved !== 1 ? 's' : ''} to context`
    )

    // Clear pending edits but keep iframe preview live
    useEditorStore.getState().revertAll()

    // Navigate back to context panel
    useEditorStore.getState().setActiveElement(null)
    inspectorState.setMode('inspection')
  }, [])

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

      <div className="editor-panel-content" key={revisionKey}>
        <div className="editor-section">
          <HoverStateEditor
            activeState={activeState}
            onStateChange={setActiveState}
          />
        </div>

        <ContentEditor
          value={getVal('textContent')}
          childContents={styles['childContents'] ?? ''}
          onChange={(value) => handlePropertyChange('textContent', value)}
          onChildChange={handleChildChange}
        />

        <FillEditor
          color={getVal('color')}
          backgroundColor={getVal('backgroundColor')}
          backgroundImage={getVal('backgroundImage')}
          onPropertyChange={handlePropertyChange}
        />

        <StrokeEditor
          borderColor={getVal('borderColor')}
          borderWidth={getVal('borderWidth')}
          borderStyle={getVal('borderStyle')}
          onPropertyChange={handlePropertyChange}
        />

        <BorderRadiusEditor
          borderTopLeftRadius={getVal('borderTopLeftRadius')}
          borderTopRightRadius={getVal('borderTopRightRadius')}
          borderBottomRightRadius={getVal('borderBottomRightRadius')}
          borderBottomLeftRadius={getVal('borderBottomLeftRadius')}
          onPropertyChange={handlePropertyChange}
        />

        <TypographyEditor
          fontFamily={getVal('fontFamily')}
          fontSize={getVal('fontSize')}
          fontWeight={getVal('fontWeight')}
          lineHeight={getVal('lineHeight')}
          letterSpacing={getVal('letterSpacing')}
          textAlign={getVal('textAlign')}
          textDecoration={getVal('textDecoration')}
          textTransform={getVal('textTransform')}
          whiteSpace={getVal('whiteSpace')}
          wordSpacing={getVal('wordSpacing')}
          onPropertyChange={handlePropertyChange}
        />

        <EffectsEditor
          opacity={getVal('opacity')}
          filter={getVal('filter')}
          backdropFilter={getVal('backdropFilter')}
          mixBlendMode={getVal('mixBlendMode')}
          onPropertyChange={handlePropertyChange}
        />

        <ShadowEditor
          boxShadow={getVal('boxShadow')}
          onPropertyChange={handlePropertyChange}
        />

        <TransformEditor
          transform={getVal('transform')}
          transformOrigin={getVal('transformOrigin')}
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
          gridTemplateColumns={getVal('gridTemplateColumns')}
          gridTemplateRows={getVal('gridTemplateRows')}
          gridGap={getVal('gridGap')}
          flexWrap={getVal('flexWrap')}
          flexGrow={getVal('flexGrow')}
          flexShrink={getVal('flexShrink')}
          flexBasis={getVal('flexBasis')}
          minWidth={getVal('minWidth')}
          maxWidth={getVal('maxWidth')}
          minHeight={getVal('minHeight')}
          maxHeight={getVal('maxHeight')}
          onPropertyChange={handlePropertyChange}
        />

        <PositionEditor
          position={getVal('position')}
          top={getVal('top')}
          right={getVal('right')}
          bottom={getVal('bottom')}
          left={getVal('left')}
          zIndex={getVal('zIndex')}
          onPropertyChange={handlePropertyChange}
        />

        <OverflowEditor
          overflowX={getVal('overflowX')}
          overflowY={getVal('overflowY')}
          cursor={getVal('cursor')}
          onPropertyChange={handlePropertyChange}
        />

        <TransitionEditor
          transition={getVal('transition')}
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
            onClick={handleSave}
            disabled={pendingEditCount === 0}
          >
            Save Changes
            {pendingEditCount > 0 && (
              <span className="editor-pending-count">{pendingEditCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
