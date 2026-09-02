import type { MindMapDocument, MindMapNodeId } from './model'
import { getDescendantNodeIds } from './traversal'

export interface TidyLayoutPreview {
  readonly childIdsByParent: Readonly<
    Record<MindMapNodeId, readonly MindMapNodeId[]>
  >
  readonly changedParentIds: readonly MindMapNodeId[]
}

function compareTopicOrder(
  document: MindMapDocument,
  leftId: MindMapNodeId,
  rightId: MindMapNodeId,
): number {
  const left = document.nodes[leftId]
  const right = document.nodes[rightId]
  if (!left || !right) return leftId.localeCompare(rightId)

  const byText = left.text.localeCompare(right.text, undefined, {
    sensitivity: 'base',
  })
  return byText === 0 ? left.id.localeCompare(right.id) : byText
}

/**
 * Produces a non-mutating all-map tidy preview. It only sorts siblings, so
 * parent links and branch membership remain untouched.
 */
export function createTidyLayoutPreview(
  document: MindMapDocument,
  rootNodeId?: MindMapNodeId,
): TidyLayoutPreview {
  const childIdsByParent: Record<MindMapNodeId, readonly MindMapNodeId[]> = {}
  const changedParentIds: MindMapNodeId[] = []

  const nodes = rootNodeId
    ? [
        document.nodes[rootNodeId],
        ...getDescendantNodeIds(document, rootNodeId).map(
          (nodeId) => document.nodes[nodeId],
        ),
      ].filter((node) => node !== undefined)
    : Object.values(document.nodes)

  for (const node of nodes) {
    if (node.childIds.length < 2) continue
    const childIds = [...node.childIds].sort((leftId, rightId) =>
      compareTopicOrder(document, leftId, rightId),
    )
    if (childIds.some((nodeId, index) => nodeId !== node.childIds[index])) {
      childIdsByParent[node.id] = childIds
      changedParentIds.push(node.id)
    }
  }

  return { childIdsByParent, changedParentIds }
}
