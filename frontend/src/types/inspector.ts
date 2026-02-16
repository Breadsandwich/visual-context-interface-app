/**
 * TypeScript interfaces for Visual Context Interface
 */

export type InspectorMode = 'interaction' | 'inspection' | 'screenshot' | 'edit'

export interface ElementContext {
  tagName: string
  id: string
  classes: string[]
  selector: string
  outerHTML: string
  boundingRect: DOMRect
  sourceFile: string | null
  sourceLine: number | null
  componentName: string | null
}

export type ContentType = 'screenshot' | 'photo' | 'illustration' | 'icon' | 'chart' | 'text-heavy' | 'mixed'

export interface ImageCodemap {
  filename: string
  dimensions: string
  aspectRatio: string
  fileSize: string
  dominantColors: string[]
  brightness: 'dark' | 'medium' | 'light'
  hasTransparency: boolean
  contentType?: ContentType
}

export interface VisionAnalysis {
  description: string
  contentType: ContentType
  uiElements: string[]
  textContent: string
  colorPalette: string[]
  layout: string
  accessibility: string
}

export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error'

export interface ExternalImagePayload extends ImageCodemap {
  description: string
  linkedElementSelector?: string
  visionAnalysis?: VisionAnalysis
}

export interface UploadedImage {
  id: string
  dataUrl: string
  filename: string
  size: number
  linkedElementSelector?: string
  codemap?: ImageCodemap
  visionAnalysis?: VisionAnalysis
  analysisStatus?: AnalysisStatus
  analysisError?: string
}

export interface InspectorEvent {
  type: 'INSPECTOR_EVENT'
  action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED' | 'READY' | 'SCREENSHOT_ERROR' | 'COMPUTED_STYLES' | 'EDIT_ELEMENT_CLICKED'
  payload: ElementSelectedPayload | ScreenshotPayload | RouteChangedPayload | ReadyPayload | ScreenshotErrorPayload | ComputedStylesPayload
}

export interface ElementSelectedPayload {
  element: ElementContext
}

export interface ScreenshotPayload {
  imageData: string
  region: {
    x: number
    y: number
    width: number
    height: number
  } | null
  selector: string | null
}

export interface RouteChangedPayload {
  route: string
}

export interface ReadyPayload {
  version: string
}

export interface ScreenshotErrorPayload {
  error: string
}

export interface InspectorCommand {
  type: 'INSPECTOR_COMMAND'
  action: 'SET_MODE' | 'CAPTURE_SCREENSHOT' | 'CAPTURE_ELEMENT' | 'CLEAR_SELECTION' | 'GET_ROUTE' | 'APPLY_EDIT' | 'REVERT_EDITS' | 'REVERT_ELEMENT' | 'GET_COMPUTED_STYLES'
  payload?: {
    mode?: InspectorMode
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    selector?: string
    property?: string
    value?: string
  }
}

export interface ContextEntry {
  html: string
  selector: string
  tagName: string
  id: string
  classes: string[]
  elementPrompt: string
  sourceFile: string | null
  sourceLine: number | null
  componentName: string | null
  linkedImages: ExternalImagePayload[]
  savedEdits: PropertyEdit[]
}

export interface OutputPayload {
  route: string
  contexts: ContextEntry[]
  externalImages: ExternalImagePayload[]
  visualPrompt: string
  visualAnalysis: VisionAnalysis | null
  prompt: string
  timestamp: string
}

export interface PropertyEdit {
  property: string
  value: string
  original: string
}

export interface ElementEdits {
  selector: string
  sourceFile: string | null
  sourceLine: number | null
  componentName: string | null
  changes: PropertyEdit[]
}

export interface ComputedStylesPayload {
  selector: string
  styles: Record<string, string>
}
