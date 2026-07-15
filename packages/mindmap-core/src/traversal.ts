import type { MindMapDocument, MindMapNodeId } from './model'
import { assertMindMapDocument, MindMapValidationError } from './validation'

export function getNodeIdsInDocumentOrder(
  document: MindMapDocument,
): MindMapNodeId[] {
  assertMindMapDocument(document)

  const nodeIds: MindMapNodeId[] = []
  const nodeStack: MindMapNodeId[] = [document.rootNodeId]

  while (nodeStack.length > 0) {
    const nodeId = nodeStack.pop()
    if (!nodeId) continue

    nodeIds.push(nodeId)
    const node = document.nodes[nodeId]
    if (!node) continue

    nodeStack.push(...[...node.childIds].reverse())
  }

  return nodeIds
}

export function getAncestorNodeIds(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNodeId[] {
  assertMindMapDocument(document)

  const node = document.nodes[nodeId]
  if (!node) {
    throw new MindMapValidationError(
      'missing-child',
      `Mind map node not found: ${nodeId}`,
      { nodeId },
    )
  }

  const ancestors: MindMapNodeId[] = []
  let parentId = node.parentId

  while (parentId) {
    ancestors.push(parentId)
    parentId = document.nodes[parentId]?.parentId ?? null
  }

  return ancestors
}

export function getDescendantNodeIds(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNodeId[] {
  assertMindMapDocument(document)

  const node = document.nodes[nodeId]
  if (!node) {
    throw new MindMapValidationError(
      'missing-child',
      `Mind map node not found: ${nodeId}`,
      { nodeId },
    )
  }

  const descendants: MindMapNodeId[] = []
  const nodeStack: MindMapNodeId[] = [...node.childIds].reverse()

  while (nodeStack.length > 0) {
    const descendantId = nodeStack.pop()
    if (!descendantId) continue

    descendants.push(descendantId)
    const descendant = document.nodes[descendantId]
    if (descendant) {
      nodeStack.push(...[...descendant.childIds].reverse())
    }
  }

  return descendants
}

export function normalizeTopLevelNodeSelection(
  document: MindMapDocument,
  selectedNodeIds: Iterable<MindMapNodeId>,
): MindMapNodeId[] {
  assertMindMapDocument(document)

  const selected = new Set(selectedNodeIds)
  for (const nodeId of selected) {
    if (!document.nodes[nodeId]) {
      throw new MindMapValidationError(
        'missing-child',
        `Mind map node not found: ${nodeId}`,
        { nodeId },
      )
    }
  }

  return getNodeIdsInDocumentOrder(document).filter((nodeId) => {
    if (!selected.has(nodeId)) return false
    return !getAncestorNodeIds(document, nodeId).some((ancestorId) =>
      selected.has(ancestorId),
    )
  })
}
