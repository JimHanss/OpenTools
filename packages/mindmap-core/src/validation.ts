import { mindMapStructures } from './model'
import type {
  MindMapBoundaryStyle,
  MindMapCalloutStyle,
  MindMapDocument,
  MindMapNode,
  MindMapNodeId,
  MindMapRelationshipStyle,
  MindMapSummaryStyle,
} from './model'
import { getMindMapLabelComparisonKey, isValidMindMapLabel } from './labels'
import { isValidMindMapNumberingPolicy } from './numbering'
import {
  isValidMindMapNodeStyle,
  isValidMindMapNodeStyleOverride,
  isValidMindMapTheme,
} from './styles'

export type MindMapValidationErrorCode =
  | 'missing-root'
  | 'invalid-root'
  | 'invalid-floating-topic'
  | 'duplicate-child'
  | 'duplicate-ownership'
  | 'missing-child'
  | 'parent-mismatch'
  | 'missing-parent'
  | 'missing-parent-reference'
  | 'tree-cycle'
  | 'disconnected-node'
  | 'invalid-structure'
  | 'invalid-label'
  | 'invalid-asset'
  | 'invalid-content-block'
  | 'invalid-numbering'
  | 'invalid-style'
  | 'invalid-callout'
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

function getRegisteredRootNodeIds(document: MindMapDocument): MindMapNodeId[] {
  return [document.rootNodeId, ...Object.keys(document.floatingTopics)]
}

function assertParentChainsAreAcyclic(document: MindMapDocument): void {
  for (const nodeId of Object.keys(document.nodes)) {
    const lineage = new Set<MindMapNodeId>()
    let currentNodeId: MindMapNodeId | null = nodeId

    while (currentNodeId) {
      if (lineage.has(currentNodeId)) {
        fail('tree-cycle', 'Mind map forest contains a parent cycle.', {
          nodeId: currentNodeId,
        })
      }

      lineage.add(currentNodeId)
      currentNodeId = getNodeOrFail(document, currentNodeId).parentId
    }
  }
}

function assertStructureRecords(document: MindMapDocument): void {
  const structures = new Set<string>(mindMapStructures)
  if (!structures.has(document.defaultStructure)) {
    fail('invalid-structure', 'The default mind map structure is invalid.', {
      structure: String(document.defaultStructure),
    })
  }

  for (const [nodeId, structure] of Object.entries(
    document.structureOverrides,
  )) {
    if (!document.nodes[nodeId] || !structures.has(structure)) {
      fail(
        'invalid-structure',
        'A structure override must reference an existing topic and supported structure.',
        { nodeId, structure: String(structure) },
      )
    }
  }
}

function assertSemanticRecords(document: MindMapDocument): void {
  if (!isValidMindMapTheme(document.theme)) {
    fail('invalid-style', 'The mind map theme is invalid.')
  }
  const labelNames = new Set<string>()
  for (const [labelId, label] of Object.entries(document.labels)) {
    const comparisonKey = getMindMapLabelComparisonKey(label.name)
    if (
      label.id !== labelId ||
      !isValidMindMapLabel(label) ||
      labelNames.has(comparisonKey)
    ) {
      fail('invalid-label', 'A label record is invalid.', { labelId })
    }
    labelNames.add(comparisonKey)
  }

  for (const [assetId, asset] of Object.entries(document.assets)) {
    if (
      asset.id !== assetId ||
      asset.id.trim().length === 0 ||
      asset.kind !== 'image' ||
      asset.mimeType.trim().length === 0 ||
      !Number.isFinite(asset.byteSize) ||
      asset.byteSize < 0 ||
      asset.checksum.trim().length === 0 ||
      !Number.isFinite(asset.intrinsicWidth) ||
      asset.intrinsicWidth <= 0 ||
      !Number.isFinite(asset.intrinsicHeight) ||
      asset.intrinsicHeight <= 0
    ) {
      fail('invalid-asset', 'An asset metadata record is invalid.', {
        assetId,
      })
    }
  }

  for (const node of Object.values(document.nodes)) {
    if (
      node.numbering &&
      !isValidMindMapNumberingPolicy(document, node.id, node.numbering)
    ) {
      fail('invalid-numbering', 'A topic numbering policy is invalid.', {
        nodeId: node.id,
      })
    }
    if (
      !isValidMindMapNodeStyle(node.style) ||
      !isValidMindMapNodeStyleOverride(node.styleOverrides)
    ) {
      fail('invalid-style', 'A topic style is invalid.', {
        nodeId: node.id,
      })
    }

    if (
      new Set(node.labelIds).size !== node.labelIds.length ||
      node.labelIds.some((labelId) => !document.labels[labelId])
    ) {
      fail('invalid-label', 'A topic references an invalid label.', {
        nodeId: node.id,
      })
    }

    const contentBlockIds = new Set<string>()
    for (const block of node.contentBlocks) {
      if (block.id.trim().length === 0 || contentBlockIds.has(block.id)) {
        fail(
          'invalid-content-block',
          'Content blocks must have unique non-empty IDs within a topic.',
          { nodeId: node.id, blockId: block.id },
        )
      }
      contentBlockIds.add(block.id)

      if (
        block.type === 'image' &&
        (!document.assets[block.assetId] ||
          !Number.isFinite(block.width) ||
          block.width <= 0 ||
          (block.height !== undefined &&
            (!Number.isFinite(block.height) || block.height <= 0)))
      ) {
        fail('invalid-content-block', 'An image content block is invalid.', {
          nodeId: node.id,
          blockId: block.id,
        })
      }

      if (
        block.type === 'equation' &&
        (block.displayMode !== 'block' ||
          typeof block.source !== 'string' ||
          (block.width !== undefined &&
            (!Number.isFinite(block.width) || block.width <= 0)) ||
          (block.height !== undefined &&
            (!Number.isFinite(block.height) || block.height <= 0)))
      ) {
        fail('invalid-content-block', 'An equation content block is invalid.', {
          nodeId: node.id,
          blockId: block.id,
        })
      }
    }
  }
}

function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function isValidRelationshipStyle(style: MindMapRelationshipStyle): boolean {
  return (
    isNonEmptyString(style.color) &&
    isNonNegativeFinite(style.width) &&
    ['solid', 'dashed', 'dotted'].includes(style.pattern) &&
    ['curve', 'elbow', 'straight'].includes(style.shape) &&
    ['none', 'arrow', 'dot'].includes(style.startMarker) &&
    ['none', 'arrow', 'dot'].includes(style.endMarker) &&
    isNonEmptyString(style.labelColor) &&
    Number.isFinite(style.labelFontSize) &&
    style.labelFontSize > 0
  )
}

function isValidBoundaryStyle(style: MindMapBoundaryStyle): boolean {
  return (
    ['rounded-rectangle', 'rectangle', 'cloud'].includes(style.shape) &&
    isNonEmptyString(style.fillColor) &&
    Number.isFinite(style.fillOpacity) &&
    style.fillOpacity >= 0 &&
    style.fillOpacity <= 1 &&
    isNonEmptyString(style.borderColor) &&
    isNonNegativeFinite(style.borderWidth) &&
    ['solid', 'dashed', 'dotted'].includes(style.borderStyle) &&
    isNonEmptyString(style.textColor)
  )
}

function isValidSummaryStyle(style: MindMapSummaryStyle): boolean {
  return (
    ['bracket', 'line'].includes(style.shape) &&
    isNonEmptyString(style.color) &&
    isNonNegativeFinite(style.width) &&
    ['solid', 'dashed', 'dotted'].includes(style.pattern) &&
    isNonEmptyString(style.textColor)
  )
}

function isValidCalloutStyle(style: MindMapCalloutStyle): boolean {
  return (
    ['rounded-rectangle', 'rectangle', 'pill'].includes(style.shape) &&
    isNonEmptyString(style.backgroundColor) &&
    isNonEmptyString(style.borderColor) &&
    isNonNegativeFinite(style.borderWidth) &&
    isNonEmptyString(style.textColor) &&
    Number.isFinite(style.fontSize) &&
    style.fontSize > 0
  )
}

function assertEnhancementRecords(document: MindMapDocument): void {
  const relationshipIds = new Set<string>()
  for (const relationship of document.relationships) {
    if (
      relationship.id.trim().length === 0 ||
      relationshipIds.has(relationship.id) ||
      !document.nodes[relationship.fromNodeId] ||
      !document.nodes[relationship.toNodeId] ||
      relationship.fromNodeId === relationship.toNodeId ||
      !isValidRelationshipStyle(relationship.style) ||
      relationship.controlPoints.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
      )
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
        [...nodeIds].some((nodeId) => !document.nodes[nodeId]) ||
        (kind === 'boundary'
          ? !isValidBoundaryStyle(group.style as MindMapBoundaryStyle)
          : !isValidSummaryStyle(group.style as MindMapSummaryStyle))
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

  const calloutIds = new Set<string>()
  const owners = new Set<MindMapNodeId>()
  for (const callout of document.callouts) {
    if (
      callout.id.trim().length === 0 ||
      calloutIds.has(callout.id) ||
      owners.has(callout.ownerNodeId) ||
      !document.nodes[callout.ownerNodeId] ||
      !Number.isFinite(callout.offset.x) ||
      !Number.isFinite(callout.offset.y) ||
      !isValidCalloutStyle(callout.style)
    ) {
      fail(
        'invalid-callout',
        'A callout must have a unique ID and an existing unique owner.',
        { calloutId: callout.id, ownerNodeId: callout.ownerNodeId },
      )
    }
    calloutIds.add(callout.id)
    owners.add(callout.ownerNodeId)
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

  if (document.floatingTopics[document.rootNodeId]) {
    fail(
      'invalid-floating-topic',
      'The main root cannot also be a floating topic.',
      { rootNodeId: document.rootNodeId },
    )
  }

  for (const [nodeId, placement] of Object.entries(document.floatingTopics)) {
    const node = document.nodes[nodeId]
    if (
      !node ||
      node.parentId !== null ||
      !Number.isFinite(placement.x) ||
      !Number.isFinite(placement.y) ||
      (placement.structure !== undefined &&
        !mindMapStructures.includes(placement.structure))
    ) {
      fail(
        'invalid-floating-topic',
        'A floating topic must reference a detached root and finite placement.',
        { nodeId },
      )
    }
  }

  const registeredRoots = getRegisteredRootNodeIds(document)
  const registeredRootSet = new Set(registeredRoots)
  if (registeredRootSet.size !== registeredRoots.length) {
    fail('invalid-root', 'Mind map roots must be unique.')
  }

  const actualRoots = nodeIds.filter(
    (nodeId) => document.nodes[nodeId]?.parentId === null,
  )
  if (
    actualRoots.length !== registeredRoots.length ||
    actualRoots.some((nodeId) => !registeredRootSet.has(nodeId))
  ) {
    fail(
      'invalid-root',
      'Every detached root must be the main root or a registered floating topic.',
      { rootNodeId: document.rootNodeId },
    )
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
          { parentId: node.id, childId },
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

    if (registeredRootSet.has(nodeId)) {
      if ((childReferenceCounts.get(nodeId) ?? 0) !== 0) {
        fail(
          'invalid-root',
          'A registered root cannot be another node child.',
          {
            rootNodeId: nodeId,
          },
        )
      }
      continue
    }

    if (node.parentId === null) {
      fail('invalid-root', 'An unregistered node cannot have a null parent.', {
        nodeId,
      })
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
        { nodeId, parentId: parent.id },
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
  const nodeStack: MindMapNodeId[] = [...registeredRoots].reverse()

  while (nodeStack.length > 0) {
    const nodeId = nodeStack.pop()
    if (!nodeId) continue

    if (visited.has(nodeId)) {
      fail(
        'duplicate-ownership',
        'A topic is reachable from more than one root or parent.',
        { nodeId },
      )
    }

    visited.add(nodeId)
    const node = getNodeOrFail(document, nodeId)
    nodeStack.push(...[...node.childIds].reverse())
  }

  const disconnectedNodeId = nodeIds.find((nodeId) => !visited.has(nodeId))
  if (disconnectedNodeId) {
    fail('disconnected-node', 'Mind map contains a disconnected node.', {
      nodeId: disconnectedNodeId,
    })
  }

  assertStructureRecords(document)
  assertSemanticRecords(document)
  assertEnhancementRecords(document)

  return document
}
