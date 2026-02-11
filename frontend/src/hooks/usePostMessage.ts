import { useEffect, useCallback } from 'react'
import { useInspectorStore } from '../stores/inspectorStore'
import { saveImageToDisk } from '../utils/imageSaver'
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

function parseProxyOrigin(): string {
  const url = import.meta.env.VITE_PROXY_URL as string | undefined
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

const proxyOrigin = parseProxyOrigin()

export function usePostMessage(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const {
    setMode,
    toggleSelectedElement,
    setScreenshotData,
    setScreenshotFilePath,
    setCurrentRoute,
    setInspectorReady,
    showToast,
    mode,
    clearSelectionTrigger
  } = useInspectorStore()

  // Handle messages from inspector with origin validation
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin - accept messages from same origin or proxy origin
      const expectedOrigin = window.location.origin
      if (event.origin !== expectedOrigin && (!proxyOrigin || event.origin !== proxyOrigin)) {
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
            toggleSelectedElement(data.payload.element)
          }
          break

        case 'SCREENSHOT_CAPTURED':
          if (data.payload && 'imageData' in data.payload && typeof data.payload.imageData === 'string') {
            if (data.payload.imageData.startsWith('data:image/')) {
              setScreenshotData(data.payload.imageData)
              setScreenshotFilePath(null)
              setMode('interaction')
              saveImageToDisk(data.payload.imageData, 'screenshot')
                .then(({ filePath }) => setScreenshotFilePath(filePath))
                .catch(() => showToast('Failed to save screenshot to disk'))
            }
          }
          break

        case 'SCREENSHOT_ERROR':
          showToast('Screenshot capture failed')
          setMode('interaction')
          break

        case 'ROUTE_CHANGED':
          if (data.payload && 'route' in data.payload && typeof data.payload.route === 'string') {
            setCurrentRoute(data.payload.route)
          }
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setMode, toggleSelectedElement, setScreenshotData, setScreenshotFilePath, setCurrentRoute, setInspectorReady, showToast])

  // Send command to inspector with origin restriction
  const sendCommand = useCallback((command: InspectorCommand) => {
    if (iframeRef.current?.contentWindow) {
      const targetOrigin = proxyOrigin || window.location.origin
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
