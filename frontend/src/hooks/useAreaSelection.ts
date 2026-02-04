import { useState, useCallback, useRef, useEffect } from 'react'

interface SelectionRegion {
  x: number
  y: number
  width: number
  height: number
}

interface UseAreaSelectionOptions {
  onSelectionComplete?: (region: SelectionRegion) => void
  enabled?: boolean
}

export function useAreaSelection({ onSelectionComplete, enabled = true }: UseAreaSelectionOptions = {}) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 })
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const getRelativeCoords = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled) return
    e.preventDefault()
    const coords = getRelativeCoords(e)
    setSelectionStart(coords)
    setSelectionEnd(coords)
    setIsSelecting(true)
  }, [enabled, getRelativeCoords])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelecting) return
    const coords = getRelativeCoords(e)
    setSelectionEnd(coords)
  }, [isSelecting, getRelativeCoords])

  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return
    setIsSelecting(false)

    const region: SelectionRegion = {
      x: Math.min(selectionStart.x, selectionEnd.x),
      y: Math.min(selectionStart.y, selectionEnd.y),
      width: Math.abs(selectionEnd.x - selectionStart.x),
      height: Math.abs(selectionEnd.y - selectionStart.y)
    }

    // Only trigger if selection is meaningful (at least 10x10 pixels)
    if (region.width > 10 && region.height > 10) {
      onSelectionComplete?.(region)
    }
  }, [isSelecting, selectionStart, selectionEnd, onSelectionComplete])

  useEffect(() => {
    if (isSelecting) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isSelecting, handleMouseMove, handleMouseUp])

  const selectionRect = isSelecting ? {
    left: Math.min(selectionStart.x, selectionEnd.x),
    top: Math.min(selectionStart.y, selectionEnd.y),
    width: Math.abs(selectionEnd.x - selectionStart.x),
    height: Math.abs(selectionEnd.y - selectionStart.y)
  } : null

  return {
    containerRef,
    isSelecting,
    selectionRect,
    handleMouseDown
  }
}
