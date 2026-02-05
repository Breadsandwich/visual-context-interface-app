import { useEffect, useCallback } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import type { InspectorEvent, InspectorCommand, InspectorMode, ElementContext } from '../types/inspector'

// Type guard for InspectorEvent
function isInspectorEvent(data: unknown): data is InspectorEvent {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return obj.type === 'INSPECTOR_EVENT' && typeof obj.action === 'string'
}

// Type guard for ElementContext
function isElementContext(data: unknown): data is ElementContext {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    typeof obj.tagName === 'string' &&
    typeof obj.selector === 'string' &&
    typeof obj.outerHTML === 'string'
  )
}

export function usePostMessage(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const {
    setMode,
    setSelectedElement,
    setScreenshotData,
    setCurrentRoute,
    setInspectorReady,
    mode,
    clearSelectionTrigger
  } = useInspectorStore()

  // Handle messages from inspector with origin validation
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin - only accept messages from same origin (proxied content)
      const expectedOrigin = window.location.origin
      if (event.origin !== expectedOrigin) {
        return
      }

      // Validate message structure
      if (!isInspectorEvent(event.data)) return

      const data = event.data

      switch (data.action) {
        case 'READY':
          setInspectorReady(true)
          break

        case 'ELEMENT_SELECTED':
          if (data.payload && 'element' in data.payload && isElementContext(data.payload.element)) {
            setSelectedElement(data.payload.element)
          }
          break

        case 'SCREENSHOT_CAPTURED':
          if (data.payload && 'imageData' in data.payload && typeof data.payload.imageData === 'string') {
            // Validate it's a valid data URL
            if (data.payload.imageData.startsWith('data:image/')) {
              setScreenshotData(data.payload.imageData)
              setMode('interaction')
            }
          }
          break

        case 'ROUTE_CHANGED':
          if (data.payload && 'route' in data.payload && typeof data.payload.route === 'string') {
            const title = 'title' in data.payload && typeof data.payload.title === 'string'
              ? data.payload.title
              : undefined
            setCurrentRoute(data.payload.route, title)
          }
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setMode, setSelectedElement, setScreenshotData, setCurrentRoute, setInspectorReady])

  // Send command to inspector with origin restriction
  const sendCommand = useCallback((command: InspectorCommand) => {
    if (iframeRef.current?.contentWindow) {
      // Use same origin for security
      const targetOrigin = window.location.origin
      iframeRef.current.contentWindow.postMessage(command, targetOrigin)
    }
  }, [iframeRef])

  // Send mode changes to inspector
  useEffect(() => {
    sendCommand({
      type: 'INSPECTOR_COMMAND',
      action: 'SET_MODE',
      payload: { mode }
    })
  }, [mode, sendCommand])

  // Clear iframe selection when triggered
  useEffect(() => {
    if (clearSelectionTrigger > 0) {
      sendCommand({
        type: 'INSPECTOR_COMMAND',
        action: 'CLEAR_SELECTION'
      })
    }
  }, [clearSelectionTrigger, sendCommand])

  const setInspectorMode = useCallback((newMode: InspectorMode) => {
    sendCommand({
      type: 'INSPECTOR_COMMAND',
      action: 'SET_MODE',
      payload: { mode: newMode }
    })
  }, [sendCommand])

  const captureScreenshot = useCallback((region?: { x: number; y: number; width: number; height: number }) => {
    sendCommand({
      type: 'INSPECTOR_COMMAND',
      action: 'CAPTURE_SCREENSHOT',
      payload: { region }
    })
  }, [sendCommand])

  const captureElement = useCallback(() => {
    sendCommand({
      type: 'INSPECTOR_COMMAND',
      action: 'CAPTURE_ELEMENT'
    })
  }, [sendCommand])

  const clearSelection = useCallback(() => {
    sendCommand({
      type: 'INSPECTOR_COMMAND',
      action: 'CLEAR_SELECTION'
    })
  }, [sendCommand])

  return {
    sendCommand,
    setInspectorMode,
    captureScreenshot,
    captureElement,
    clearSelection
  }
}
