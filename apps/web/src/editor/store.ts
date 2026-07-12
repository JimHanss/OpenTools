import { create } from 'zustand'

interface EditorUiState {
  selectedNodeId: string | null
  zoom: number
  selectNode: (nodeId: string) => void
  setZoom: (zoom: number) => void
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  selectedNodeId: null,
  zoom: 1,
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setZoom: (zoom) => set({ zoom: Math.min(1.8, Math.max(0.5, zoom)) }),
}))
