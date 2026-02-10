/**
 * TypeScript interfaces for Visual Context Interface
 */

export type InspectorMode = 'interaction' | 'inspection' | 'screenshot'

export interface ElementContext {
  tagName: string
  id: string
  classes: string[]
  selector: string
  outerHTML: string
  boundingRect: DOMRect
}

export type ContentType = 'screenshot' | 'photo' | 'illustration' | 'icon' | 'chart' | 'text-heavy' | 'mixed'
export type Complexity = 'minimal' | 'moderate' | 'complex'
export type VisualWeight = 'top' | 'center' | 'bottom' | 'left' | 'right' | 'balanced'
export type TextProminence = 'none' | 'minimal' | 'moderate' | 'dominant'
export type FontScale = 'small' | 'medium' | 'large' | 'mixed'
export type FontWeight = 'light' | 'regular' | 'bold' | 'mixed'

export interface ImageCodemap {
  filename: string
  dimensions: string
  aspectRatio: string
  fileSize: string
  dominantColors: string[]
  brightness: 'dark' | 'medium' | 'light'
  hasTransparency: boolean
  summary: string
  contentType?: ContentType
  complexity?: Complexity
  visualWeight?: VisualWeight
  hasText?: boolean
  textProminence?: TextProminence
  estimatedFontScale?: FontScale
  fontWeight?: FontWeight
}

export interface ExternalImagePayload extends ImageCodemap {
  description: string
  linkedElementSelector?: string
}

export interface UploadedImage {
  id: string
  dataUrl: string
  filename: string
  size: number
  linkedElementSelector?: string
  codemap?: ImageCodemap
}

export interface InspectorEvent {
  type: 'INSPECTOR_EVENT'
  action: 'ELEMENT_SELECTED' | 'SCREENSHOT_CAPTURED' | 'ROUTE_CHANGED' | 'READY' | 'SCREENSHOT_ERROR'
  payload: ElementSelectedPayload | ScreenshotPayload | RouteChangedPayload | ReadyPayload | ScreenshotErrorPayload
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
  action: 'SET_MODE' | 'CAPTURE_SCREENSHOT' | 'CAPTURE_ELEMENT' | 'CLEAR_SELECTION' | 'GET_ROUTE'
  payload?: {
    mode?: InspectorMode
    region?: {
      x: number
      y: number
      width: number
      height: number
    }
    selector?: string
  }
}

export interface OutputPayload {
  route: string
  contexts: Array<{
    html: string
    selector: string
    tagName: string
    id: string
    classes: string[]
    elementPrompt: string
  }>
  externalImages: ExternalImagePayload[]
  visual: string | null
  visualPrompt: string
  prompt: string
  timestamp: string
}
