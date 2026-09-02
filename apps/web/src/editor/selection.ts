import type { MindMapDocument, MindMapNodeId } from '@opentools/mindmap-core'

export type EditorSelectionTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'topic'; readonly ids: readonly MindMapNodeId[] }
  | { readonly kind: 'relationship'; readonly id: string }
  | { readonly kind: 'boundary'; readonly id: string }
  | { readonly kind: 'summary'; readonly id: string }
  | { readonly kind: 'callout'; readonly id: string }

export interface EditorSelectionCapabilities {
  readonly canApplyTopicBatch: boolean
  readonly canCreateCallout: boolean
  readonly canDelete: boolean
  readonly canEditGeometry: boolean
  readonly canEditStyle: boolean
  readonly canEditText: boolean
  readonly canFocusBranch: boolean
}

export interface EditorSelectionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface EditorSelectableTopicBounds extends EditorSelectionRect {
  readonly id: MindMapNodeId
}

export const emptyEditorSelection: EditorSelectionTarget = { kind: 'none' }

export function createEditorSelectionRect(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
): EditorSelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function getIntersectingEditorTopicIds(
  topics: readonly EditorSelectableTopicBounds[],
  selectionRect: EditorSelectionRect,
): MindMapNodeId[] {
  const selectionRight = selectionRect.x + selectionRect.width
  const selectionBottom = selectionRect.y + selectionRect.height
  return topics
    .filter((topic) => {
      const topicRight = topic.x + topic.width
      const topicBottom = topic.y + topic.height
      return (
        topic.x <= selectionRight &&
        topicRight >= selectionRect.x &&
        topic.y <= selectionBottom &&
        topicBottom >= selectionRect.y
      )
    })
    .map((topic) => topic.id)
}

export function getSelectedTopicIds(
  selection: EditorSelectionTarget,
): readonly MindMapNodeId[] {
  return selection.kind === 'topic' ? selection.ids : []
}

/** Reconciles transient UI selection after undo, redo, or document reload. */
export function reconcileEditorSelection(
  document: MindMapDocument,
  selection: EditorSelectionTarget,
): EditorSelectionTarget {
  if (selection.kind === 'topic') {
    const existingNodeIds = [...new Set(selection.ids)].filter((nodeId) =>
      Boolean(document.nodes[nodeId]),
    )
    if (existingNodeIds.length === selection.ids.length) {
      return { kind: 'topic', ids: existingNodeIds }
    }
    return {
      kind: 'topic',
      ids: existingNodeIds.length > 0 ? existingNodeIds : [document.rootNodeId],
    }
  }

  if (selection.kind === 'none') return selection

  const records =
    selection.kind === 'relationship'
      ? document.relationships
      : selection.kind === 'boundary'
        ? document.boundaries
        : selection.kind === 'summary'
          ? document.summaries
          : document.callouts
  return records.some((record) => record.id === selection.id)
    ? selection
    : { kind: 'topic', ids: [document.rootNodeId] }
}

export function getEditorSelectionCapabilities(
  document: MindMapDocument,
  selection: EditorSelectionTarget,
): EditorSelectionCapabilities {
  if (selection.kind === 'none') {
    return {
      canApplyTopicBatch: false,
      canCreateCallout: false,
      canDelete: false,
      canEditGeometry: false,
      canEditStyle: false,
      canEditText: false,
      canFocusBranch: false,
    }
  }

  if (selection.kind === 'topic') {
    const selectedNodes = selection.ids.flatMap((nodeId) => {
      const node = document.nodes[nodeId]
      return node ? [node] : []
    })
    const hasSingleTopic = selectedNodes.length === 1
    return {
      canApplyTopicBatch: selectedNodes.length > 0,
      canCreateCallout:
        hasSingleTopic &&
        !document.callouts.some(
          (callout) => callout.ownerNodeId === selectedNodes[0]!.id,
        ),
      canDelete:
        selectedNodes.length > 0 &&
        selectedNodes.every((node) => node.id !== document.rootNodeId),
      canEditGeometry: false,
      canEditStyle: selectedNodes.length > 0,
      canEditText: hasSingleTopic,
      canFocusBranch: hasSingleTopic,
    }
  }

  return {
    canApplyTopicBatch: false,
    canCreateCallout: false,
    canDelete: true,
    canEditGeometry:
      selection.kind === 'relationship' || selection.kind === 'callout',
    canEditStyle: true,
    canEditText: true,
    canFocusBranch: false,
  }
}
