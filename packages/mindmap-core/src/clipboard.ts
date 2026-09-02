import type {
  MindMapClipboardPayload,
  MindMapSubtreeSnapshot,
} from './commands'
import type {
  MindMapAssetMetadata,
  MindMapBoundary,
  MindMapCallout,
  MindMapDocument,
  MindMapLabel,
  MindMapNode,
  MindMapNodeId,
  MindMapRelationship,
  MindMapSummary,
} from './model'
import {
  getDescendantNodeIds,
  normalizeTopLevelNodeSelection,
} from './traversal'

export type MindMapNodeIdFactory = (
  sourceNodeId: MindMapNodeId,
) => MindMapNodeId
export type MindMapRecordIdFactory = (sourceRecordId: string) => string

function cloneNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    childIds: [...node.childIds],
    markers: node.markers.map((marker) => ({ ...marker })),
    links: node.links.map((link) => ({ ...link })),
    labelIds: [...node.labelIds],
    ...(node.numbering ? { numbering: { ...node.numbering } } : {}),
    contentBlocks: node.contentBlocks.map((block) => ({ ...block })),
    styleOverrides: { ...node.styleOverrides },
    style: { ...node.style },
  }
}

function cloneRelationship(
  relationship: MindMapRelationship,
): MindMapRelationship {
  return {
    ...relationship,
    style: { ...relationship.style },
    controlPoints: relationship.controlPoints.map((point) => ({ ...point })),
  }
}

function cloneBoundary(boundary: MindMapBoundary): MindMapBoundary {
  return {
    ...boundary,
    nodeIds: [...boundary.nodeIds],
    style: { ...boundary.style },
  }
}

function cloneSummary(summary: MindMapSummary): MindMapSummary {
  return {
    ...summary,
    nodeIds: [...summary.nodeIds],
    style: { ...summary.style },
  }
}

function cloneCallout(callout: MindMapCallout): MindMapCallout {
  return {
    ...callout,
    offset: { ...callout.offset },
    style: { ...callout.style },
  }
}

function createSubtreeSnapshot(
  document: MindMapDocument,
  rootNodeId: MindMapNodeId,
  selectedNodeIds: ReadonlySet<MindMapNodeId>,
): MindMapSubtreeSnapshot {
  const nodeIds = [rootNodeId, ...getDescendantNodeIds(document, rootNodeId)]
  const subtreeNodeIds = new Set(nodeIds)
  const nodes: Record<MindMapNodeId, MindMapNode> = {}

  for (const nodeId of nodeIds) {
    const sourceNode = document.nodes[nodeId]
    if (!sourceNode) continue

    const node = cloneNode(sourceNode)
    if (nodeId === rootNodeId) node.parentId = null
    nodes[nodeId] = node
  }

  return {
    rootNodeId,
    nodes,
    relationships: document.relationships
      .filter(
        (relationship) =>
          selectedNodeIds.has(relationship.fromNodeId) &&
          selectedNodeIds.has(relationship.toNodeId) &&
          subtreeNodeIds.has(relationship.fromNodeId),
      )
      .map(cloneRelationship),
    boundaries: document.boundaries
      .filter(
        (boundary) =>
          boundary.nodeIds.every((nodeId) => selectedNodeIds.has(nodeId)) &&
          Boolean(boundary.nodeIds[0]) &&
          subtreeNodeIds.has(boundary.nodeIds[0]!),
      )
      .map(cloneBoundary),
    summaries: document.summaries
      .filter(
        (summary) =>
          summary.nodeIds.every((nodeId) => selectedNodeIds.has(nodeId)) &&
          Boolean(summary.nodeIds[0]) &&
          subtreeNodeIds.has(summary.nodeIds[0]!),
      )
      .map(cloneSummary),
    callouts: document.callouts
      .filter((callout) => subtreeNodeIds.has(callout.ownerNodeId))
      .map(cloneCallout),
    structureOverrides: Object.fromEntries(
      nodeIds.flatMap((nodeId) => {
        const structure = document.structureOverrides[nodeId]
        return structure ? [[nodeId, structure] as const] : []
      }),
    ),
  }
}

function cloneLabel(label: MindMapLabel): MindMapLabel {
  return { ...label }
}

function cloneAsset(asset: MindMapAssetMetadata): MindMapAssetMetadata {
  return { ...asset }
}

export function createMindMapClipboardPayload(
  document: MindMapDocument,
  selectedNodeIds: Iterable<MindMapNodeId>,
): MindMapClipboardPayload {
  const rootNodeIds = normalizeTopLevelNodeSelection(document, selectedNodeIds)
  const includedNodeIds = new Set(
    rootNodeIds.flatMap((rootNodeId) => [
      rootNodeId,
      ...getDescendantNodeIds(document, rootNodeId),
    ]),
  )
  const labelIds = new Set<string>()
  const assetIds = new Set<string>()
  for (const nodeId of includedNodeIds) {
    const node = document.nodes[nodeId]
    if (!node) continue
    node.labelIds.forEach((labelId) => labelIds.add(labelId))
    for (const block of node.contentBlocks) {
      if (block.type === 'image') assetIds.add(block.assetId)
    }
  }

  return {
    version: 1,
    roots: rootNodeIds.map((rootNodeId) =>
      createSubtreeSnapshot(document, rootNodeId, includedNodeIds),
    ),
    labels: Object.fromEntries(
      [...labelIds].flatMap((labelId) => {
        const label = document.labels[labelId]
        return label ? [[labelId, cloneLabel(label)] as const] : []
      }),
    ),
    assets: Object.fromEntries(
      [...assetIds].flatMap((assetId) => {
        const asset = document.assets[assetId]
        return asset ? [[assetId, cloneAsset(asset)] as const] : []
      }),
    ),
  }
}

export function duplicateMindMapClipboardPayload(
  clipboard: MindMapClipboardPayload,
  createNodeId: MindMapNodeIdFactory,
  createRecordId: MindMapRecordIdFactory = createNodeId,
): MindMapClipboardPayload {
  const usedNodeIds = new Set<MindMapNodeId>()
  const usedRecordIds = new Set<string>()
  const nodeIdMap = new Map<MindMapNodeId, MindMapNodeId>()
  const recordIdMap = new Map<string, string>()
  const contentBlockIdMap = new Map<string, string>()

  for (const subtree of clipboard.roots) {
    for (const sourceNodeId of Object.keys(subtree.nodes)) {
      const duplicateNodeId = createNodeId(sourceNodeId)
      if (usedNodeIds.has(duplicateNodeId)) {
        throw new Error(`Duplicate node ID generated: ${duplicateNodeId}`)
      }
      usedNodeIds.add(duplicateNodeId)
      nodeIdMap.set(sourceNodeId, duplicateNodeId)
    }

    for (const sourceRecordId of [
      ...(subtree.relationships ?? []).map((record) => record.id),
      ...(subtree.boundaries ?? []).map((record) => record.id),
      ...(subtree.summaries ?? []).map((record) => record.id),
      ...(subtree.callouts ?? []).map((record) => record.id),
    ]) {
      if (recordIdMap.has(sourceRecordId)) continue
      const duplicateRecordId = createRecordId(sourceRecordId)
      if (usedRecordIds.has(duplicateRecordId)) {
        throw new Error(`Duplicate record ID generated: ${duplicateRecordId}`)
      }
      usedRecordIds.add(duplicateRecordId)
      recordIdMap.set(sourceRecordId, duplicateRecordId)
    }

    for (const [sourceNodeId, sourceNode] of Object.entries(subtree.nodes)) {
      for (const block of sourceNode.contentBlocks) {
        const key = `${sourceNodeId}\u0000${block.id}`
        const duplicateRecordId = createRecordId(
          `content-block:${sourceNodeId}:${block.id}`,
        )
        if (usedRecordIds.has(duplicateRecordId)) {
          throw new Error(`Duplicate record ID generated: ${duplicateRecordId}`)
        }
        usedRecordIds.add(duplicateRecordId)
        contentBlockIdMap.set(key, duplicateRecordId)
      }
    }
  }

  const remapNodeId = (sourceNodeId: MindMapNodeId): MindMapNodeId => {
    const nodeId = nodeIdMap.get(sourceNodeId)
    if (!nodeId) throw new Error(`Missing duplicate node ID: ${sourceNodeId}`)
    return nodeId
  }
  const remapRecordId = (sourceRecordId: string): string => {
    const recordId = recordIdMap.get(sourceRecordId)
    if (!recordId) {
      throw new Error(`Missing duplicate record ID: ${sourceRecordId}`)
    }
    return recordId
  }

  return {
    version: 1,
    roots: clipboard.roots.map((subtree) => {
      const nodes: Record<MindMapNodeId, MindMapNode> = {}
      for (const [sourceNodeId, sourceNode] of Object.entries(subtree.nodes)) {
        const nodeId = remapNodeId(sourceNodeId)
        nodes[nodeId] = {
          ...cloneNode(sourceNode),
          id: nodeId,
          parentId: sourceNode.parentId
            ? remapNodeId(sourceNode.parentId)
            : null,
          childIds: sourceNode.childIds.map(remapNodeId),
          ...(sourceNode.numbering
            ? {
                numbering: {
                  ...sourceNode.numbering,
                  ...(sourceNode.numbering.restartAtNodeId &&
                  nodeIdMap.has(sourceNode.numbering.restartAtNodeId)
                    ? {
                        restartAtNodeId: remapNodeId(
                          sourceNode.numbering.restartAtNodeId,
                        ),
                      }
                    : { restartAtNodeId: undefined }),
                },
              }
            : {}),
          contentBlocks: sourceNode.contentBlocks.map((block) => ({
            ...block,
            id:
              contentBlockIdMap.get(`${sourceNodeId}\u0000${block.id}`) ??
              block.id,
          })),
        }
      }

      return {
        rootNodeId: remapNodeId(subtree.rootNodeId),
        nodes,
        relationships: (subtree.relationships ?? []).map((relationship) => ({
          ...cloneRelationship(relationship),
          id: remapRecordId(relationship.id),
          fromNodeId: remapNodeId(relationship.fromNodeId),
          toNodeId: remapNodeId(relationship.toNodeId),
        })),
        boundaries: (subtree.boundaries ?? []).map((boundary) => ({
          ...cloneBoundary(boundary),
          id: remapRecordId(boundary.id),
          nodeIds: boundary.nodeIds.map(remapNodeId),
        })),
        summaries: (subtree.summaries ?? []).map((summary) => ({
          ...cloneSummary(summary),
          id: remapRecordId(summary.id),
          nodeIds: summary.nodeIds.map(remapNodeId),
        })),
        callouts: (subtree.callouts ?? []).map((callout) => ({
          ...cloneCallout(callout),
          id: remapRecordId(callout.id),
          ownerNodeId: remapNodeId(callout.ownerNodeId),
        })),
        structureOverrides: Object.fromEntries(
          Object.entries(subtree.structureOverrides ?? {}).map(
            ([sourceNodeId, structure]) => [
              remapNodeId(sourceNodeId),
              structure,
            ],
          ),
        ),
      }
    }),
    labels: Object.fromEntries(
      Object.entries(clipboard.labels ?? {}).map(([labelId, label]) => [
        labelId,
        cloneLabel(label),
      ]),
    ),
    assets: Object.fromEntries(
      Object.entries(clipboard.assets ?? {}).map(([assetId, asset]) => [
        assetId,
        cloneAsset(asset),
      ]),
    ),
  }
}
