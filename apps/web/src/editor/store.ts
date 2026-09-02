import { create } from 'zustand'

import type { MindMapNodeStyleOverride } from '@opentools/mindmap-core'

import type { AutosaveStatus } from './autosave'
import type { EditorBranchFocusState } from './focus'
import { emptyEditorSelection, type EditorSelectionTarget } from './selection'

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

export interface EditorFilterState {
  readonly text: string
  readonly labelIds: readonly string[]
  readonly priorities: readonly string[]
  readonly statuses: readonly string[]
  readonly hasNotes: boolean | undefined
  readonly operator: 'and' | 'or'
}

export type EditorDialog =
  'none' | 'confirm-delete-map' | 'rename-map' | 'import-conflict'

interface EditorUiState {
  selection: EditorSelectionTarget
  editingNodeId: string | null
  viewport: EditorViewport
  dragPreview: EditorDragPreview | null
  search: EditorSearchState
  filter: EditorFilterState
  branchFocus: EditorBranchFocusState
  dialog: EditorDialog
  saveStatus: AutosaveStatus
  styleClipboard: MindMapNodeStyleOverride | null
  setSelection: (selection: EditorSelectionTarget) => void
  setSelectedNodeIds: (nodeIds: readonly string[]) => void
  toggleSelectedNodeId: (nodeId: string) => void
  setEditingNodeId: (nodeId: string | null) => void
  setViewport: (viewport: EditorViewport) => void
  setDragPreview: (preview: EditorDragPreview | null) => void
  setSearch: (search: EditorSearchState) => void
  setFilter: (filter: EditorFilterState) => void
  setBranchFocus: (focus: EditorBranchFocusState) => void
  setDialog: (dialog: EditorDialog) => void
  setSaveStatus: (status: AutosaveStatus) => void
  setStyleClipboard: (style: MindMapNodeStyleOverride | null) => void
  resetEditorUi: () => void
}

const initialEditorUiState = {
  selection: emptyEditorSelection,
  editingNodeId: null,
  viewport: { x: 0, y: 0, zoom: 1 } as EditorViewport,
  dragPreview: null,
  search: {
    query: '',
    resultNodeIds: [],
    activeResultIndex: -1,
  } as EditorSearchState,
  filter: {
    text: '',
    labelIds: [],
    priorities: [],
    statuses: [],
    hasNotes: undefined,
    operator: 'and',
  } as EditorFilterState,
  branchFocus: {
    rootNodeId: null,
    breadcrumbNodeIds: [],
    previousSelectionNodeIds: [],
  } as EditorBranchFocusState,
  dialog: 'none' as EditorDialog,
  saveStatus: { state: 'idle', revision: 0 } as AutosaveStatus,
  styleClipboard: null as MindMapNodeStyleOverride | null,
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  ...initialEditorUiState,
  setSelection: (selection) => set({ selection }),
  setSelectedNodeIds: (nodeIds) =>
    set({
      selection:
        nodeIds.length === 0
          ? emptyEditorSelection
          : { kind: 'topic', ids: [...new Set(nodeIds)] },
    }),
  toggleSelectedNodeId: (nodeId) =>
    set((state) => {
      const selectedNodeIds =
        state.selection.kind === 'topic' ? state.selection.ids : []
      const ids = selectedNodeIds.includes(nodeId)
        ? selectedNodeIds.filter((id) => id !== nodeId)
        : [...selectedNodeIds, nodeId]
      return {
        selection:
          ids.length === 0 ? emptyEditorSelection : { kind: 'topic', ids },
      }
    }),
  setEditingNodeId: (editingNodeId) => set({ editingNodeId }),
  setViewport: (viewport) => set({ viewport }),
  setDragPreview: (dragPreview) => set({ dragPreview }),
  setSearch: (search) => set({ search }),
  setFilter: (filter) => set({ filter }),
  setBranchFocus: (branchFocus) => set({ branchFocus }),
  setDialog: (dialog) => set({ dialog }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setStyleClipboard: (styleClipboard) =>
    set({ styleClipboard: styleClipboard ? { ...styleClipboard } : null }),
  resetEditorUi: () => set(initialEditorUiState),
}))
