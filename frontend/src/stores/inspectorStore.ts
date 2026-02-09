import { create } from 'zustand'
import type { InspectorMode, ElementContext, UploadedImage, OutputPayload } from '../types/inspector'

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
  currentRoute: string
  pageTitle: string
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
  setCurrentRoute: (route: string, title?: string) => void
  setUserPrompt: (prompt: string) => void
  setInspectorReady: (ready: boolean) => void
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
  currentRoute: '/',
  pageTitle: '',
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
      return {
        selectedElements: filtered,
        elementPrompts: remainingPrompts,
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
    return {
      selectedElements: state.selectedElements.filter(
        (el) => el.selector !== selector
      ),
      elementPrompts: remainingPrompts
    }
  }),

  setSelectedElements: (elements) => set((state) => {
    const newElements = elements.slice(0, MAX_SELECTED_ELEMENTS)
    const newSelectors = new Set(newElements.map((el) => el.selector))
    const cleanedPrompts = Object.fromEntries(
      Object.entries(state.elementPrompts).filter(([key]) => newSelectors.has(key))
    )
    return {
      selectedElements: newElements,
      elementPrompts: cleanedPrompts
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
    return { uploadedImages: [...state.uploadedImages, image] }
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

  setCurrentRoute: (route, title) => set({
    currentRoute: route,
    pageTitle: title ?? get().pageTitle
  }),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setInspectorReady: (ready) => set({ isInspectorReady: ready }),

  clearSelection: () => set({
    selectedElements: [],
    elementPrompts: {},
    screenshotData: null,
    screenshotPrompt: ''
  }),

  clearScreenshot: () => set({ screenshotData: null, screenshotPrompt: '' }),

  resetAll: () => set((state) => ({
    selectedElements: [],
    elementPrompts: {},
    uploadedImages: [],
    toastMessage: null,
    screenshotData: null,
    screenshotPrompt: '',
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
      externalImages: state.uploadedImages.map((img) => img.dataUrl),
      visual: state.screenshotData,
      visualPrompt: state.screenshotPrompt,
      prompt: state.userPrompt,
      timestamp: new Date().toISOString()
    }
    return payload
  }
}))
