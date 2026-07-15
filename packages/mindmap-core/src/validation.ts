import type { MindMapDocument, MindMapNode, MindMapNodeId } from './model'

export type MindMapValidationErrorCode =
  | 'missing-root'
  | 'invalid-root'
  | 'duplicate-child'
  | 'missing-child'
  | 'parent-mismatch'
  | 'missing-parent'
  | 'missing-parent-reference'
  | 'tree-cycle'
  | 'disconnected-node'
  | 'invalid-relationship'
  | 'invalid-grouping'

export class MindMapValidationError extends Error {
  readonly code: MindMapValidationErrorCode
  readonly details: Readonly<Record<string, string>>

  constructor(
    code: MindMapValidationErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message)
    this.name = 'MindMapValidationError'
    this.code = code
    this.details = details
  }
}

function fail(
  code: MindMapValidationErrorCode,
  message: string,
  details: Readonly<Record<string, string>> = {},
): never {
  throw new MindMapValidationError(code, message, details)
}

function getNodeOrFail(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNode {
  const node = document.nodes[nodeId]
  if (!node) {
    fail('missing-child', `Mind map node not found: ${nodeId}`, { nodeId })
  }

  return node
}

function assertParentChainsAreAcyclic(document: MindMapDocument): void {
  for (const nodeId of Object.keys(document.nodes)) {
    const lineage = new Set<MindMapNodeId>()
    let currentNodeId: MindMapNodeId | null = nodeId

    while (currentNodeId) {
      if (lineage.has(currentNodeId)) {
        fail('tree-cycle', 'Mind map tree contains a parent cycle.', {
          nodeId: currentNodeId,
        })
      }

      lineage.add(currentNodeId)
      currentNodeId = getNodeOrFail(document, currentNodeId).parentId
    }
  }
}

function assertEnhancementRecords(document: MindMapDocument): void {
  const relationshipIds = new Set<string>()
  for (const relationship of document.relationships) {
    if (
      relationship.id.trim().length === 0 ||
      relationshipIds.has(relationship.id) ||
      !document.nodes[relationship.fromNodeId] ||
      !document.nodes[relationship.toNodeId] ||
      relationship.fromNodeId === relationship.toNodeId
    ) {
      fail(
        'invalid-relationship',
        'A relationship must have a unique ID and connect two existing topics.',
        { relationshipId: relationship.id },
      )
    }
    relationshipIds.add(relationship.id)
  }

  for (const [kind, groups] of [
    ['boundary', document.boundaries],
    ['summary', document.summaries],
  ] as const) {
    const groupIds = new Set<string>()
    for (const group of groups) {
      const nodeIds = new Set(group.nodeIds)
      if (
        group.id.trim().length === 0 ||
        groupIds.has(group.id) ||
        nodeIds.size === 0 ||
        nodeIds.size !== group.nodeIds.length ||
        [...nodeIds].some((nodeId) => !document.nodes[nodeId])
      ) {
        fail(
          'invalid-grouping',
          `A ${kind} must have a unique ID and reference existing topics.`,
          { groupingId: group.id, kind },
        )
      }
      groupIds.add(group.id)
    }
  }
}

export function assertMindMapDocument(
  document: MindMapDocument,
): MindMapDocument {
  const nodeIds = Object.keys(document.nodes)
  const rootNode = document.nodes[document.rootNodeId]

  if (!rootNode) {
    fail('missing-root', 'Mind map root node is missing.', {
      rootNodeId: document.rootNodeId,
    })
  }

  if (rootNode.parentId !== null) {
    fail('invalid-root', 'Mind map root node must not have a parent.', {
      rootNodeId: document.rootNodeId,
    })
  }

  const roots = nodeIds.filter(
    (nodeId) => document.nodes[nodeId]?.parentId === null,
  )
  if (roots.length !== 1 || roots[0] !== document.rootNodeId) {
    fail('invalid-root', 'Mind map document must contain exactly one root.', {
      rootNodeId: document.rootNodeId,
    })
  }

  const childReferenceCounts = new Map<MindMapNodeId, number>()

  for (const nodeId of nodeIds) {
    const node = getNodeOrFail(document, nodeId)
    const uniqueChildIds = new Set<MindMapNodeId>()

    for (const childId of node.childIds) {
      if (uniqueChildIds.has(childId)) {
        fail(
          'duplicate-child',
          'A parent contains the same child more than once.',
          {
            parentId: node.id,
            childId,
          },
        )
      }

      uniqueChildIds.add(childId)
      const child = document.nodes[childId]
      if (!child) {
        fail('missing-child', 'A parent references a missing child.', {
          parentId: node.id,
          childId,
        })
      }

      if (child.parentId !== node.id) {
        fail('parent-mismatch', 'Child and parent references disagree.', {
          parentId: node.id,
          childId,
        })
      }

      childReferenceCounts.set(
        childId,
        (childReferenceCounts.get(childId) ?? 0) + 1,
      )
    }
  }

  for (const nodeId of nodeIds) {
    const node = getNodeOrFail(document, nodeId)

    if (nodeId === document.rootNodeId) {
      if ((childReferenceCounts.get(nodeId) ?? 0) !== 0) {
        fail(
          'invalid-root',
          'Mind map root node cannot be another node child.',
          {
            rootNodeId: nodeId,
          },
        )
      }
      continue
    }

    if (node.parentId === null) {
      fail('invalid-root', 'Only the root node may have no parent.', { nodeId })
    }

    const parent = document.nodes[node.parentId]
    if (!parent) {
      fail('missing-parent', 'A node references a missing parent.', {
        nodeId,
        parentId: node.parentId,
      })
    }

    if (!parent.childIds.includes(nodeId)) {
      fail(
        'missing-parent-reference',
        'A parent does not reference its child.',
        {
          nodeId,
          parentId: parent.id,
        },
      )
    }

    if ((childReferenceCounts.get(nodeId) ?? 0) !== 1) {
      fail('parent-mismatch', 'A non-root node must have exactly one parent.', {
        nodeId,
      })
    }
  }

  assertParentChainsAreAcyclic(document)

  const visited = new Set<MindMapNodeId>()
  const nodeStack: MindMapNodeId[] = [document.rootNodeId]

  while (nodeStack.length > 0) {
    const nodeId = nodeStack.pop()
    if (!nodeId) continue

    if (visited.has(nodeId)) {
      fail('tree-cycle', 'Mind map tree contains a child cycle.', { nodeId })
    }

    visited.add(nodeId)
    const node = getNodeOrFail(document, nodeId)
    nodeStack.push(...node.childIds)
  }

  const disconnectedNodeId = nodeIds.find((nodeId) => !visited.has(nodeId))
  if (disconnectedNodeId) {
    fail('disconnected-node', 'Mind map contains a disconnected node.', {
      nodeId: disconnectedNodeId,
    })
  }

  assertEnhancementRecords(document)

  return document
}
