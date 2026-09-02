import {
  getAncestorNodeIds,
  getDescendantNodeIds,
  type MindMapDocument,
  type MindMapNodeId,
} from '@opentools/mindmap-core'

export interface EditorBranchFocusState {
  readonly rootNodeId: MindMapNodeId | null
  readonly breadcrumbNodeIds: readonly MindMapNodeId[]
  readonly previousSelectionNodeIds: readonly MindMapNodeId[]
}

export const emptyEditorBranchFocusState: EditorBranchFocusState = {
  rootNodeId: null,
  breadcrumbNodeIds: [],
  previousSelectionNodeIds: [],
}

export function createEditorBranchFocus(
  document: MindMapDocument,
  rootNodeId: MindMapNodeId,
  previousSelectionNodeIds: readonly MindMapNodeId[],
): EditorBranchFocusState {
  if (!document.nodes[rootNodeId]) return emptyEditorBranchFocusState
  return {
    rootNodeId,
    breadcrumbNodeIds: [
      ...getAncestorNodeIds(document, rootNodeId).reverse(),
      rootNodeId,
    ],
    previousSelectionNodeIds: previousSelectionNodeIds.filter((nodeId) =>
      Boolean(document.nodes[nodeId]),
    ),
  }
}

export function isNodeInsideBranchFocus(
  document: MindMapDocument,
  focusRootNodeId: MindMapNodeId | null,
  nodeId: MindMapNodeId,
): boolean {
  return (
    focusRootNodeId === null ||
    focusRootNodeId === nodeId ||
    getDescendantNodeIds(document, focusRootNodeId).includes(nodeId)
  )
}

export function restoreSelectionAfterBranchFocus(
  document: MindMapDocument,
  focus: EditorBranchFocusState,
): MindMapNodeId[] {
  const previous = focus.previousSelectionNodeIds.filter((nodeId) =>
    Boolean(document.nodes[nodeId]),
  )
  return previous.length > 0 ? previous : [document.rootNodeId]
}
