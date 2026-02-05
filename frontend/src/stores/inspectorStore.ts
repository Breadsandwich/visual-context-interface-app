import { create } from 'zustand'
import type { InspectorMode, ElementContext, OutputPayload } from '../types/inspector'

interface InspectorState {
  mode: InspectorMode
  selectedElement: ElementContext | null
  screenshotData: string | null
  currentRoute: string
  pageTitle: string
  userPrompt: string
  isInspectorReady: boolean
  isSidebarOpen: boolean
  clearSelectionTrigger: number

  setMode: (mode: InspectorMode) => void
  setSelectedElement: (element: ElementContext | null) => void
  setScreenshotData: (data: string | null) => void
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
  selectedElement: null,
  screenshotData: null,
  currentRoute: '/',
  pageTitle: '',
  userPrompt: '',
  isInspectorReady: false,
  isSidebarOpen: false,
  clearSelectionTrigger: 0,

  setMode: (mode) => set({ mode }),

  setSelectedElement: (element) => set({
    selectedElement: element,
    isSidebarOpen: element !== null ? true : get().isSidebarOpen
  }),

  setScreenshotData: (data) => set({
    screenshotData: data,
    isSidebarOpen: data !== null ? true : get().isSidebarOpen
  }),

  setCurrentRoute: (route, title) => set({
    currentRoute: route,
    pageTitle: title ?? get().pageTitle
  }),

  setUserPrompt: (prompt) => set({ userPrompt: prompt }),

  setInspectorReady: (ready) => set({ isInspectorReady: ready }),

  clearSelection: () => set({
    selectedElement: null,
    screenshotData: null
  }),

  clearScreenshot: () => set({ screenshotData: null }),

  resetAll: () => set((state) => ({
    mode: 'interaction',
    selectedElement: null,
    screenshotData: null,
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
      context: state.selectedElement ? {
        html: state.selectedElement.outerHTML,
        selector: state.selectedElement.selector,
        tagName: state.selectedElement.tagName,
        id: state.selectedElement.id,
        classes: state.selectedElement.classes
      } : null,
      visual: state.screenshotData,
      prompt: state.userPrompt,
      timestamp: new Date().toISOString()
    }
    return payload
  }
}))
