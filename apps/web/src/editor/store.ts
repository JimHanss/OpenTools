import { create } from 'zustand'

import type { AutosaveStatus } from './autosave'

export interface EditorViewport {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface EditorDragPreview {
  readonly nodeIds: readonly string[]
  readonly targetNodeId: string
  readonly placement: 'before' | 'after' | 'child'
}

export interface EditorSearchState {
  readonly query: string
  readonly resultNodeIds: readonly string[]
  readonly activeResultIndex: number
}

export type EditorDialog =
  'none' | 'confirm-delete-map' | 'rename-map' | 'import-conflict'

interface EditorUiState {
  selectedNodeIds: readonly string[]
  editingNodeId: string | null
  viewport: EditorViewport
  dragPreview: EditorDragPreview | null
  search: EditorSearchState
  dialog: EditorDialog
  saveStatus: AutosaveStatus
  setSelectedNodeIds: (nodeIds: readonly string[]) => void
  toggleSelectedNodeId: (nodeId: string) => void
  setEditingNodeId: (nodeId: string | null) => void
  setViewport: (viewport: EditorViewport) => void
  setDragPreview: (preview: EditorDragPreview | null) => void
  setSearch: (search: EditorSearchState) => void
  setDialog: (dialog: EditorDialog) => void
  setSaveStatus: (status: AutosaveStatus) => void
  resetEditorUi: () => void
}

const initialEditorUiState = {
  selectedNodeIds: [] as readonly string[],
  editingNodeId: null,
  viewport: { x: 0, y: 0, zoom: 1 } as EditorViewport,
  dragPreview: null,
  search: {
    query: '',
    resultNodeIds: [],
    activeResultIndex: -1,
  } as EditorSearchState,
  dialog: 'none' as EditorDialog,
  saveStatus: { state: 'idle', revision: 0 } as AutosaveStatus,
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  ...initialEditorUiState,
  setSelectedNodeIds: (nodeIds) =>
    set({ selectedNodeIds: [...new Set(nodeIds)] }),
  toggleSelectedNodeId: (nodeId) =>
    set((state) => ({
      selectedNodeIds: state.selectedNodeIds.includes(nodeId)
        ? state.selectedNodeIds.filter((id) => id !== nodeId)
        : [...state.selectedNodeIds, nodeId],
    })),
  setEditingNodeId: (editingNodeId) => set({ editingNodeId }),
  setViewport: (viewport) => set({ viewport }),
  setDragPreview: (dragPreview) => set({ dragPreview }),
  setSearch: (search) => set({ search }),
  setDialog: (dialog) => set({ dialog }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  resetEditorUi: () => set(initialEditorUiState),
}))
