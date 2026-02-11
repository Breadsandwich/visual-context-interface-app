import { create } from 'zustand'
import type { InspectorMode, ElementContext, UploadedImage, ImageCodemap, OutputPayload, VisionAnalysis, AnalysisStatus, ExternalImagePayload } from '../types/inspector'

const MAX_SELECTED_ELEMENTS = 10
const MAX_UPLOADED_IMAGES = 10

let toastTimer: ReturnType<typeof setTimeout> | null = null

interface InspectorState {
  mode: InspectorMode
  selectedElements: ElementContext[]
  elementPrompts: Record<string, string>
  uploadedImages: UploadedImage[]
  toastMessage: string | null
  screenshotData: string | null
  screenshotPrompt: string
  screenshotAnalysis: VisionAnalysis | null
  screenshotAnalysisStatus: AnalysisStatus
  currentRoute: string
  userPrompt: string
  isInspectorReady: boolean
  isSidebarOpen: boolean
  clearSelectionTrigger: number

  setMode: (mode: InspectorMode) => void
  toggleSelectedElement: (element: ElementContext) => void
  removeSelectedElement: (selector: string) => void
  setSelectedElements: (elements: ElementContext[]) => void
  setElementPrompt: (selector: string, prompt: string) => void
  addUploadedImage: (image: UploadedImage) => void
  removeUploadedImage: (id: string) => void
  clearUploadedImages: () => void
  showToast: (message: string) => void
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
  openSidebar: () => void
  closeSidebar: () => void
  toggleSidebar: () => void
}

export const useInspectorStore = create<InspectorState>((set, get) => ({
  mode: 'interaction',
  selectedElements: [],
  elementPrompts: {},
  uploadedImages: [],
  toastMessage: null,
  screenshotData: null,
  screenshotPrompt: '',
  screenshotAnalysis: null,
  screenshotAnalysisStatus: 'idle',
  currentRoute: '/',
  userPrompt: '',
  isInspectorReady: false,
  isSidebarOpen: false,
  clearSelectionTrigger: 0,

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
      const unlinkedImages = state.uploadedImages.map((img) =>
        img.linkedElementSelector === element.selector
          ? { ...img, linkedElementSelector: undefined }
          : img
      )
      return {
        selectedElements: filtered,
        elementPrompts: remainingPrompts,
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
      uploadedImages: unlinkedImages
    }
  }),

  setSelectedElements: (elements) => set((state) => {
    const newElements = elements.slice(0, MAX_SELECTED_ELEMENTS)
    const newSelectors = new Set(newElements.map((el) => el.selector))
    const cleanedPrompts = Object.fromEntries(
      Object.entries(state.elementPrompts).filter(([key]) => newSelectors.has(key))
    )
    const unlinkedImages = state.uploadedImages.map((img) =>
      img.linkedElementSelector && !newSelectors.has(img.linkedElementSelector)
        ? { ...img, linkedElementSelector: undefined }
        : img
    )
    return {
      selectedElements: newElements,
      elementPrompts: cleanedPrompts,
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
    set({ toastMessage: message })
    toastTimer = setTimeout(() => {
      set({ toastMessage: null })
      toastTimer = null
    }, 3000)
  },

  dismissToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toastMessage: null })
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
    uploadedImages: [],
    toastMessage: null,
    screenshotData: null,
    screenshotPrompt: '',
    screenshotAnalysis: null,
    screenshotAnalysisStatus: 'idle',
    userPrompt: '',
    isSidebarOpen: false,
    clearSelectionTrigger: state.clearSelectionTrigger + 1
  })),

  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  generatePayload: () => {
    const state = get()

    const payload: OutputPayload = {
      route: state.currentRoute,
      contexts: state.selectedElements.map((el) => ({
        html: el.outerHTML,
        selector: el.selector,
        tagName: el.tagName,
        id: el.id,
        classes: el.classes,
        elementPrompt: state.elementPrompts[el.selector] ?? ''
      })),
      externalImages: state.uploadedImages.map((img): ExternalImagePayload => ({
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
      })),
      visual: state.screenshotData,
      visualPrompt: state.screenshotPrompt,
      visualAnalysis: state.screenshotAnalysis,
      prompt: state.userPrompt,
      timestamp: new Date().toISOString()
    }
    return payload
  }
}))
