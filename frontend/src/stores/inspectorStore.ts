import { create } from 'zustand'
import type { InspectorMode, ElementContext, UploadedImage, ImageCodemap, OutputPayload, VisionAnalysis, AnalysisStatus, ExternalImagePayload, ContextEntry, PropertyEdit } from '../types/inspector'

const MAX_SELECTED_ELEMENTS = 10
const MAX_UPLOADED_IMAGES = 10

let toastTimer: ReturnType<typeof setTimeout> | null = null

interface InspectorState {
  mode: InspectorMode
  selectedElements: ElementContext[]
  elementPrompts: Record<string, string>
  elementEdits: Record<string, PropertyEdit[]>
  uploadedImages: UploadedImage[]
  toastMessage: string | null
  isToastPersistent: boolean
  screenshotData: string | null
  screenshotPrompt: string
  screenshotAnalysis: VisionAnalysis | null
  screenshotAnalysisStatus: AnalysisStatus
  currentRoute: string
  userPrompt: string
  isInspectorReady: boolean
  isSidebarOpen: boolean
  clearSelectionTrigger: number
  iframeReloadTrigger: number
  agentProgress: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
  agentClarification: { question: string; context: string } | null
  agentPlan: string | null
  agentWorkers: Record<string, {
    agentId: string
    agentName: string
    status: 'running' | 'success' | 'error' | 'clarifying'
    progress: Array<{ turn: number; summary: string; files_read?: string[]; files_written?: string[] }>
    clarification: { question: string; context: string } | null
    task: string
  }>
  orchestratorStatus: 'idle' | 'planning' | 'delegating' | 'running' | 'reviewing' | 'done' | 'error'
  orchestratorPlan: Record<string, unknown> | null

  setMode: (mode: InspectorMode) => void
  toggleSelectedElement: (element: ElementContext) => void
  removeSelectedElement: (selector: string) => void
  setSelectedElements: (elements: ElementContext[]) => void
  setElementPrompt: (selector: string, prompt: string) => void
  setElementEdits: (selector: string, edits: PropertyEdit[]) => void
  clearElementEdits: (selector: string) => void
  addUploadedImage: (image: UploadedImage) => void
  removeUploadedImage: (id: string) => void
  clearUploadedImages: () => void
  showToast: (message: string) => void
  showPersistentToast: (message: string) => void
  dismissToast: () => void
  setScreenshotData: (data: string | null) => void
  setScreenshotPrompt: (prompt: string) => void
  setScreenshotAnalysis: (analysis: VisionAnalysis | null) => void
  setScreenshotAnalysisStatus: (status: AnalysisStatus) => void
  setCurrentRoute: (route: string) => void
  setUserPrompt: (prompt: string) => void
  setInspectorReady: (ready: boolean) => void
  setImageCodemap: (imageId: string, codemap: ImageCodemap) => void
  setImageVisionAnalysis: (imageId: string, analysis: VisionAnalysis) => void
  setImageAnalysisStatus: (imageId: string, status: AnalysisStatus) => void
  linkImageToElement: (imageId: string, selector: string | null) => void
  clearSelection: () => void
  clearScreenshot: () => void
  resetAll: () => void
  generatePayload: () => OutputPayload
  reloadIframe: () => void
  openSidebar: () => void
  closeSidebar: () => void
  toggleSidebar: () => void
  setAgentProgress: (progress: InspectorState['agentProgress']) => void
  setAgentClarification: (clarification: InspectorState['agentClarification']) => void
  setAgentPlan: (plan: string | null) => void
  submitClarification: (response: string) => Promise<void>
  clearAgentState: () => void
  setAgentWorkers: (workers: InspectorState['agentWorkers']) => void
  setOrchestratorStatus: (status: InspectorState['orchestratorStatus']) => void
  setOrchestratorPlan: (plan: InspectorState['orchestratorPlan']) => void
}

export const useInspectorStore = create<InspectorState>((set, get) => ({
  mode: 'interaction',
  selectedElements: [],
  elementPrompts: {},
  elementEdits: {},
  uploadedImages: [],
  toastMessage: null,
  isToastPersistent: false,
  screenshotData: null,
  screenshotPrompt: '',
  screenshotAnalysis: null,
  screenshotAnalysisStatus: 'idle',
  currentRoute: '/',
  userPrompt: '',
  isInspectorReady: false,
  isSidebarOpen: false,
  clearSelectionTrigger: 0,
  iframeReloadTrigger: 0,
  agentProgress: [],
  agentClarification: null,
  agentPlan: null,
  agentWorkers: {},
  orchestratorStatus: 'idle' as const,
  orchestratorPlan: null,

  setMode: (mode) => set({ mode }),

  toggleSelectedElement: (element) => set((state) => {
    const exists = state.selectedElements.some(
      (el) => el.selector === element.selector
    )
    if (exists) {
      const filtered = state.selectedElements.filter(
        (el) => el.selector !== element.selector
      )
      const { [element.selector]: _removed, ...remainingPrompts } = state.elementPrompts
      const { [element.selector]: _removedEdits, ...remainingEdits } = state.elementEdits
      const unlinkedImages = state.uploadedImages.map((img) =>
        img.linkedElementSelector === element.selector
          ? { ...img, linkedElementSelector: undefined }
          : img
      )
      return {
        selectedElements: filtered,
        elementPrompts: remainingPrompts,
        elementEdits: remainingEdits,
        uploadedImages: unlinkedImages,
        isSidebarOpen: filtered.length > 0 ? true : state.isSidebarOpen
      }
    }
    if (state.selectedElements.length >= MAX_SELECTED_ELEMENTS) {
      setTimeout(() => get().showToast(`Maximum ${MAX_SELECTED_ELEMENTS} elements allowed`), 0)
      return state
    }
    return {
      selectedElements: [...state.selectedElements, element],
      isSidebarOpen: true
    }
  }),

  removeSelectedElement: (selector) => set((state) => {
    const { [selector]: _removed, ...remainingPrompts } = state.elementPrompts
    const { [selector]: _removedEdits, ...remainingEdits } = state.elementEdits
    const unlinkedImages = state.uploadedImages.map((img) =>
      img.linkedElementSelector === selector
        ? { ...img, linkedElementSelector: undefined }
        : img
    )
    return {
      selectedElements: state.selectedElements.filter(
        (el) => el.selector !== selector
      ),
      elementPrompts: remainingPrompts,
      elementEdits: remainingEdits,
      uploadedImages: unlinkedImages
    }
  }),

  setSelectedElements: (elements) => set((state) => {
    const newElements = elements.slice(0, MAX_SELECTED_ELEMENTS)
    const newSelectors = new Set(newElements.map((el) => el.selector))
    const cleanedPrompts = Object.fromEntries(
      Object.entries(state.elementPrompts).filter(([key]) => newSelectors.has(key))
    )
    const cleanedEdits = Object.fromEntries(
      Object.entries(state.elementEdits).filter(([key]) => newSelectors.has(key))
    )
    const unlinkedImages = state.uploadedImages.map((img) =>
      img.linkedElementSelector && !newSelectors.has(img.linkedElementSelector)
        ? { ...img, linkedElementSelector: undefined }
        : img
    )
    return {
      selectedElements: newElements,
      elementPrompts: cleanedPrompts,
      elementEdits: cleanedEdits,
      uploadedImages: unlinkedImages
    }
  }),

  setElementPrompt: (selector, prompt) => set((state) => {
    if (!prompt) {
      const { [selector]: _removed, ...rest } = state.elementPrompts
      return { elementPrompts: rest }
    }
    return {
      elementPrompts: {
        ...state.elementPrompts,
        [selector]: prompt
      }
    }
  }),

  setElementEdits: (selector, edits) => set((state) => {
    if (edits.length === 0) {
      const { [selector]: _removed, ...rest } = state.elementEdits
      return { elementEdits: rest }
    }
    return {
      elementEdits: {
        ...state.elementEdits,
        [selector]: edits
      }
    }
  }),

  clearElementEdits: (selector) => set((state) => {
    const { [selector]: _removed, ...rest } = state.elementEdits
    return { elementEdits: rest }
  }),

  addUploadedImage: (image) => set((state) => {
    if (state.uploadedImages.length >= MAX_UPLOADED_IMAGES) {
      setTimeout(() => get().showToast(`Maximum ${MAX_UPLOADED_IMAGES} images allowed`), 0)
      return state
    }
    return { uploadedImages: [...state.uploadedImages, { ...image, analysisStatus: 'idle' as const }] }
  }),

  removeUploadedImage: (id) => set((state) => ({
    uploadedImages: state.uploadedImages.filter((img) => img.id !== id)
  })),

  clearUploadedImages: () => set({ uploadedImages: [] }),

  showToast: (message) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    set({ toastMessage: message, isToastPersistent: false })
    toastTimer = setTimeout(() => {
      set({ toastMessage: null })
      toastTimer = null
    }, 3000)
  },

  showPersistentToast: (message) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toastMessage: message, isToastPersistent: true })
  },

  dismissToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toastMessage: null, isToastPersistent: false })
  },

  setScreenshotData: (data) => set({
    screenshotData: data,
    screenshotPrompt: data === null ? '' : get().screenshotPrompt,
    isSidebarOpen: data !== null ? true : get().isSidebarOpen
  }),

  setScreenshotPrompt: (prompt) => set({ screenshotPrompt: prompt }),

  setScreenshotAnalysis: (analysis) => set({ screenshotAnalysis: analysis }),

  setScreenshotAnalysisStatus: (status) => set({ screenshotAnalysisStatus: status }),

  setCurrentRoute: (route) => set({ currentRoute: route }),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setInspectorReady: (ready) => set({ isInspectorReady: ready }),

  setImageCodemap: (imageId, codemap) => set((state) => ({
    uploadedImages: state.uploadedImages.map((img) =>
      img.id === imageId ? { ...img, codemap } : img
    )
  })),

  setImageVisionAnalysis: (imageId, analysis) => set((state) => ({
    uploadedImages: state.uploadedImages.map((img) =>
      img.id === imageId ? { ...img, visionAnalysis: analysis } : img
    )
  })),

  setImageAnalysisStatus: (imageId, status) => set((state) => ({
    uploadedImages: state.uploadedImages.map((img) =>
      img.id === imageId ? { ...img, analysisStatus: status } : img
    )
  })),

  linkImageToElement: (imageId, selector) => set((state) => ({
    uploadedImages: state.uploadedImages.map((img) =>
      img.id === imageId
        ? { ...img, linkedElementSelector: selector ?? undefined }
        : img
    )
  })),

  clearSelection: () => set((state) => ({
    selectedElements: [],
    elementPrompts: {},
    elementEdits: {},
    screenshotData: null,
    screenshotPrompt: '',
    uploadedImages: state.uploadedImages.map((img) =>
      img.linkedElementSelector ? { ...img, linkedElementSelector: undefined } : img
    )
  })),

  clearScreenshot: () => set({
    screenshotData: null,
    screenshotPrompt: '',
    screenshotAnalysis: null,
    screenshotAnalysisStatus: 'idle',
  }),

  resetAll: () => set((state) => ({
    mode: 'interaction',
    selectedElements: [],
    elementPrompts: {},
    elementEdits: {},
    uploadedImages: [],
    toastMessage: null,
    isToastPersistent: false,
    screenshotData: null,
    screenshotPrompt: '',
    screenshotAnalysis: null,
    screenshotAnalysisStatus: 'idle',
    userPrompt: '',
    isSidebarOpen: false,
    clearSelectionTrigger: state.clearSelectionTrigger + 1,
    agentProgress: [],
    agentClarification: null,
    agentPlan: null,
    agentWorkers: {},
    orchestratorStatus: 'idle' as const,
    orchestratorPlan: null,
  })),

  reloadIframe: () => set((state) => ({ iframeReloadTrigger: state.iframeReloadTrigger + 1 })),

  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setAgentProgress: (progress) => set({ agentProgress: progress }),

  setAgentClarification: (clarification) => set({ agentClarification: clarification }),

  setAgentPlan: (plan) => set({ agentPlan: plan }),

  submitClarification: async (response) => {
    try {
      const resp = await fetch('/api/agent-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!resp.ok) {
        const data = await resp.json()
        get().showToast(data.error ?? 'Failed to send response')
      }
    } catch {
      get().showToast('Failed to send response')
    }
  },

  clearAgentState: () => set({
    agentProgress: [],
    agentClarification: null,
    agentPlan: null,
    agentWorkers: {},
    orchestratorStatus: 'idle' as const,
    orchestratorPlan: null,
  }),

  setAgentWorkers: (workers) => set({ agentWorkers: workers }),
  setOrchestratorStatus: (status) => set({ orchestratorStatus: status }),
  setOrchestratorPlan: (plan) => set({ orchestratorPlan: plan }),

  generatePayload: () => {
    const state = get()

    const toImagePayload = (img: UploadedImage): ExternalImagePayload => ({
      filename: img.codemap?.filename ?? img.filename,
      dimensions: img.codemap?.dimensions ?? 'unknown',
      aspectRatio: img.codemap?.aspectRatio ?? 'unknown',
      fileSize: img.codemap?.fileSize ?? `${img.size} B`,
      dominantColors: img.codemap?.dominantColors ?? [],
      brightness: img.codemap?.brightness ?? 'medium',
      hasTransparency: img.codemap?.hasTransparency ?? false,
      contentType: img.visionAnalysis?.contentType ?? img.codemap?.contentType,
      description: img.visionAnalysis?.description ?? img.filename,
      linkedElementSelector: img.linkedElementSelector,
      visionAnalysis: img.visionAnalysis,
    })

    const linkedBySelector = new Map<string, ExternalImagePayload[]>()
    const unlinkedImages: ExternalImagePayload[] = []

    for (const img of state.uploadedImages) {
      const payload = toImagePayload(img)
      if (img.linkedElementSelector) {
        const existing = linkedBySelector.get(img.linkedElementSelector) ?? []
        linkedBySelector.set(img.linkedElementSelector, [...existing, payload])
      } else {
        unlinkedImages.push(payload)
      }
    }

    const applyTextEditsToHtml = (html: string, edits: PropertyEdit[]): string => {
      let result = html
      for (const edit of edits) {
        if (edit.property === 'textContent' && edit.original && edit.value !== edit.original) {
          result = result.replace(edit.original, edit.value)
        }
      }
      return result
    }

    const payload: OutputPayload = {
      route: state.currentRoute,
      contexts: state.selectedElements.map((el): ContextEntry => {
        const edits = state.elementEdits[el.selector] ?? []
        return {
          html: applyTextEditsToHtml(el.outerHTML, edits),
          selector: el.selector,
          tagName: el.tagName,
          id: el.id,
          classes: el.classes,
          elementPrompt: state.elementPrompts[el.selector] ?? '',
          sourceFile: el.sourceFile ?? null,
          sourceLine: el.sourceLine ?? null,
          componentName: el.componentName ?? null,
          linkedImages: linkedBySelector.get(el.selector) ?? [],
          savedEdits: edits,
        }
      }),
      externalImages: unlinkedImages,
      visualPrompt: state.screenshotPrompt,
      visualAnalysis: state.screenshotAnalysis,
      prompt: state.userPrompt,
      timestamp: new Date().toISOString()
    }
    return payload
  }
}))
