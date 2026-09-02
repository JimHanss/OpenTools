import type {
  MindMapDocument,
  MindMapMarkerKind,
  MindMapNode,
  MindMapNodeId,
} from './model'
import { getAncestorNodeIds, getNodeIdsInDocumentOrder } from './traversal'

export interface MindMapQuery {
  readonly text?: string | undefined
  readonly labelIds?: readonly string[] | undefined
  readonly priorities?: readonly string[] | undefined
  readonly statuses?: readonly string[] | undefined
  readonly markerValues?: readonly string[] | undefined
  readonly hasNotes?: boolean | undefined
  readonly operator?: 'and' | 'or' | undefined
}

export interface MindMapQueryResult {
  readonly matchedNodeIds: readonly MindMapNodeId[]
  readonly contextNodeIds: readonly MindMapNodeId[]
  readonly pathsByNodeId: Readonly<
    Record<MindMapNodeId, readonly MindMapNodeId[]>
  >
}

function markerValues(node: MindMapNode, kind?: MindMapMarkerKind): string[] {
  return node.markers
    .filter((marker) => !kind || marker.kind === kind)
    .map((marker) => marker.value)
}

export function queryMindMap(
  document: MindMapDocument,
  query: MindMapQuery,
): MindMapQueryResult {
  const text = query.text?.trim().toLocaleLowerCase()
  const predicates: Array<(node: MindMapNode) => boolean> = []
  if (text) {
    predicates.push((node) =>
      [node.text, node.notes].some((value) =>
        value.toLocaleLowerCase().includes(text),
      ),
    )
  }
  if (query.labelIds?.length) {
    predicates.push((node) =>
      query.labelIds!.some((labelId) => node.labelIds.includes(labelId)),
    )
  }
  if (query.priorities?.length) {
    predicates.push((node) =>
      markerValues(node, 'priority').some((value) =>
        query.priorities!.includes(value),
      ),
    )
  }
  if (query.statuses?.length) {
    predicates.push((node) =>
      markerValues(node, 'status').some((value) =>
        query.statuses!.includes(value),
      ),
    )
  }
  if (query.markerValues?.length) {
    predicates.push((node) =>
      markerValues(node).some((value) => query.markerValues!.includes(value)),
    )
  }
  if (query.hasNotes !== undefined) {
    predicates.push((node) =>
      query.hasNotes
        ? node.notes.trim().length > 0
        : node.notes.trim().length === 0,
    )
  }

  const operator = query.operator ?? 'and'
  const matchedNodeIds = getNodeIdsInDocumentOrder(document).filter(
    (nodeId) => {
      const node = document.nodes[nodeId]
      if (!node) return false
      if (predicates.length === 0) return true
      return operator === 'and'
        ? predicates.every((predicate) => predicate(node))
        : predicates.some((predicate) => predicate(node))
    },
  )
  const pathsByNodeId = Object.fromEntries(
    matchedNodeIds.map((nodeId) => [
      nodeId,
      [...getAncestorNodeIds(document, nodeId).reverse(), nodeId],
    ]),
  )
  const context = new Set<MindMapNodeId>()
  for (const path of Object.values(pathsByNodeId)) {
    path.forEach((nodeId) => context.add(nodeId))
  }
  return {
    matchedNodeIds,
    contextNodeIds: getNodeIdsInDocumentOrder(document).filter((nodeId) =>
      context.has(nodeId),
    ),
    pathsByNodeId,
  }
}
