import type {
  MindMapClipboardPayload,
  MindMapSubtreeSnapshot,
} from './commands'
import type { MindMapDocument, MindMapNode, MindMapNodeId } from './model'
import {
  getDescendantNodeIds,
  normalizeTopLevelNodeSelection,
} from './traversal'

export type MindMapNodeIdFactory = (
  sourceNodeId: MindMapNodeId,
) => MindMapNodeId

function cloneNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    childIds: [...node.childIds],
    markers: node.markers.map((marker) =>
      typeof marker === 'string' ? marker : { ...marker },
    ),
    links: node.links.map((link) => ({ ...link })),
    style: { ...node.style },
  }
}

function createSubtreeSnapshot(
  document: MindMapDocument,
  rootNodeId: MindMapNodeId,
): MindMapSubtreeSnapshot {
  const nodeIds = [rootNodeId, ...getDescendantNodeIds(document, rootNodeId)]
  const nodes: Record<MindMapNodeId, MindMapNode> = {}

  for (const nodeId of nodeIds) {
    const sourceNode = document.nodes[nodeId]
    if (!sourceNode) continue

    const node = cloneNode(sourceNode)
    if (nodeId === rootNodeId) node.parentId = null
    nodes[nodeId] = node
  }

  return { rootNodeId, nodes }
}

export function createMindMapClipboardPayload(
  document: MindMapDocument,
  selectedNodeIds: Iterable<MindMapNodeId>,
): MindMapClipboardPayload {
  const rootNodeIds = normalizeTopLevelNodeSelection(document, selectedNodeIds)

  return {
    version: 1,
    roots: rootNodeIds.map((rootNodeId) =>
      createSubtreeSnapshot(document, rootNodeId),
    ),
  }
}

export function duplicateMindMapClipboardPayload(
  clipboard: MindMapClipboardPayload,
  createNodeId: MindMapNodeIdFactory,
): MindMapClipboardPayload {
  const usedNodeIds = new Set<MindMapNodeId>()

  return {
    version: 1,
    roots: clipboard.roots.map((subtree) => {
      const nodeIdMap = new Map<MindMapNodeId, MindMapNodeId>()

      for (const sourceNodeId of Object.keys(subtree.nodes)) {
        const duplicateNodeId = createNodeId(sourceNodeId)
        if (usedNodeIds.has(duplicateNodeId)) {
          throw new Error(`Duplicate node ID generated: ${duplicateNodeId}`)
        }

        usedNodeIds.add(duplicateNodeId)
        nodeIdMap.set(sourceNodeId, duplicateNodeId)
      }

      const nodes: Record<MindMapNodeId, MindMapNode> = {}
      for (const [sourceNodeId, sourceNode] of Object.entries(subtree.nodes)) {
        const nodeId = nodeIdMap.get(sourceNodeId)
        if (!nodeId)
          throw new Error(`Missing duplicate node ID: ${sourceNodeId}`)

        nodes[nodeId] = {
          ...cloneNode(sourceNode),
          id: nodeId,
          parentId: sourceNode.parentId
            ? (nodeIdMap.get(sourceNode.parentId) ?? null)
            : null,
          childIds: sourceNode.childIds.map((childId) => {
            const duplicateChildId = nodeIdMap.get(childId)
            if (!duplicateChildId) {
              throw new Error(`Missing duplicate child node ID: ${childId}`)
            }
            return duplicateChildId
          }),
        }
      }

      const rootNodeId = nodeIdMap.get(subtree.rootNodeId)
      if (!rootNodeId) {
        throw new Error(`Missing duplicate root node ID: ${subtree.rootNodeId}`)
      }

      return { rootNodeId, nodes }
    }),
  }
}
