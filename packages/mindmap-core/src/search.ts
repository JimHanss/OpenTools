import type { MindMapDocument, MindMapNodeId } from './model'
import { getNodeIdsInDocumentOrder } from './traversal'

export function findNodeIdsByText(
  document: MindMapDocument,
  query: string,
): MindMapNodeId[] {
  if (query.length === 0) return []

  const normalizedQuery = query.toLowerCase()
  return getNodeIdsInDocumentOrder(document).filter((nodeId) => {
    const node = document.nodes[nodeId]
    return node?.text.toLowerCase().includes(normalizedQuery) ?? false
  })
}
