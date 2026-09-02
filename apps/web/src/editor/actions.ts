import {
  createMindMapNode,
  getMindMapStyleScopeNodeIds,
  mindMapCommandTypes,
  normalizeTopLevelNodeSelection,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapNodeId,
  type MindMapMarkerKind,
  type MindMapNodeStyle,
  type MindMapNodeStyleOverride,
  type MindMapStyleScope,
  type SingleMindMapCommand,
} from '@opentools/mindmap-core'

export function createChildNodeCommand(
  document: MindMapDocument,
  parentId: MindMapNodeId,
  nodeId: MindMapNodeId,
  text = 'New topic',
): MindMapCommand {
  const parent = document.nodes[parentId]
  if (!parent)
    throw new Error(`Cannot create a child for missing node: ${parentId}`)

  return {
    type: mindMapCommandTypes.createNode,
    label: 'Create child topic',
    payload: {
      parentId,
      index: parent.childIds.length,
      node: createMindMapNode({
        id: nodeId,
        parentId: null,
        text,
      }),
    },
  }
}

export function createSiblingNodeCommand(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
  newNodeId: MindMapNodeId,
  text = 'New topic',
): MindMapCommand {
  const node = document.nodes[nodeId]
  if (!node)
    throw new Error(`Cannot create a sibling for missing node: ${nodeId}`)

  if (!node.parentId) {
    return createChildNodeCommand(document, node.id, newNodeId, text)
  }

  const parent = document.nodes[node.parentId]
  if (!parent) throw new Error(`Cannot find parent for node: ${nodeId}`)
  const index = parent.childIds.indexOf(node.id)
  if (index < 0) throw new Error(`Parent does not contain node: ${nodeId}`)

  return {
    type: mindMapCommandTypes.createNode,
    label: 'Create sibling topic',
    payload: {
      parentId: parent.id,
      index: index + 1,
      node: createMindMapNode({
        id: newNodeId,
        parentId: null,
        text,
      }),
    },
  }
}

export function createDeleteNodesCommand(
  nodeIds: readonly MindMapNodeId[],
): MindMapCommand {
  return {
    type: mindMapCommandTypes.deleteSubtree,
    label: 'Delete selected topics',
    payload: { nodeIds },
  }
}

/**
 * Builds one history entry for a style update across a normalized selection.
 * Descendants of another selected topic are intentionally omitted so a future
 * subtree action cannot apply duplicate work.
 */
export function createBatchStyleCommand(
  document: MindMapDocument,
  nodeIds: readonly MindMapNodeId[],
  style: MindMapNodeStyleOverride,
): MindMapCommand {
  const definedStyle = Object.fromEntries(
    Object.entries(style).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
  const commands: SingleMindMapCommand[] = [...new Set(nodeIds)]
    .filter((nodeId) => document.nodes[nodeId])
    .map((nodeId) => ({
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Update topic style',
      payload: { nodeId, style: definedStyle },
    }))

  if (commands.length === 0) {
    throw new Error('Choose at least one topic before changing its style.')
  }

  return {
    type: mindMapCommandTypes.batch,
    label: 'Update selected topic styles',
    payload: { commands },
  }
}

export function createScopedStyleCommand(
  document: MindMapDocument,
  anchorNodeIds: readonly MindMapNodeId[],
  scope: MindMapStyleScope,
  style: MindMapNodeStyleOverride,
): MindMapCommand {
  return createBatchStyleCommand(
    document,
    getMindMapStyleScopeNodeIds(document, anchorNodeIds, scope),
    style,
  )
}

export function createResetStyleCommand(
  document: MindMapDocument,
  nodeIds: readonly MindMapNodeId[],
): MindMapCommand {
  const commands: SingleMindMapCommand[] = [...new Set(nodeIds)]
    .filter((nodeId) => document.nodes[nodeId])
    .map((nodeId) => ({
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Reset topic style',
      payload: {
        nodeId,
        style: {},
        resetKeys: [
          'backgroundColor',
          'borderColor',
          'textColor',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'fontStyle',
          'textDecoration',
          'textAlign',
          'shape',
          'borderWidth',
          'borderStyle',
          'branchColor',
          'branchWidth',
          'branchStyle',
          'branchShape',
          'fixedWidth',
        ],
      },
    }))
  if (commands.length === 0) {
    throw new Error('Choose at least one topic before resetting its style.')
  }
  return {
    type: mindMapCommandTypes.batch,
    label: 'Reset topic styles',
    payload: { commands },
  }
}

/**
 * Builds a single undoable move for selected top-level topics. The caller
 * supplies an insertion index in the target parent's current child order.
 */
export function createBatchMoveCommand(
  document: MindMapDocument,
  nodeIds: readonly MindMapNodeId[],
  parentId: MindMapNodeId,
  index: number,
): MindMapCommand {
  const rootNodeIds = normalizeTopLevelNodeSelection(document, nodeIds)
  const parent = document.nodes[parentId]
  if (!parent)
    throw new Error(`Cannot move topics to missing parent: ${parentId}`)
  if (rootNodeIds.length === 0) {
    throw new Error('Choose at least one topic before moving it.')
  }

  const commands: SingleMindMapCommand[] = rootNodeIds.map((nodeId, offset) => {
    const node = document.nodes[nodeId]
    const sourceParent = node?.parentId
      ? document.nodes[node.parentId]
      : undefined
    const sourceIndex = sourceParent?.childIds.indexOf(nodeId) ?? -1
    const adjustedIndex =
      rootNodeIds.length === 1 &&
      sourceParent?.id === parentId &&
      sourceIndex >= 0 &&
      sourceIndex < index
        ? index - 1
        : index + offset

    return {
      type: mindMapCommandTypes.moveNode,
      label: 'Move selected topic',
      payload: { nodeId, parentId, index: adjustedIndex },
    }
  })

  return {
    type: mindMapCommandTypes.batch,
    label: 'Move selected topics',
    payload: { commands },
  }
}

/** Applies one structured marker setting to each selected top-level topic. */
export function createBatchMarkerCommand(
  document: MindMapDocument,
  nodeIds: readonly MindMapNodeId[],
  kind: MindMapMarkerKind,
  value: string | null,
): MindMapCommand {
  const commands: SingleMindMapCommand[] = normalizeTopLevelNodeSelection(
    document,
    nodeIds,
  ).map((nodeId) => {
    const node = document.nodes[nodeId]
    if (!node)
      throw new Error(`Cannot update markers for missing node: ${nodeId}`)

    const markers = node.markers.filter((marker) => marker.kind !== kind)
    if (value) markers.push({ kind, value })

    return {
      type: mindMapCommandTypes.updateNodeMarkers,
      label: 'Update topic marker',
      payload: { nodeId, markers },
    }
  })

  if (commands.length === 0) {
    throw new Error('Choose at least one topic before changing its markers.')
  }

  return {
    type: mindMapCommandTypes.batch,
    label: 'Update selected topic markers',
    payload: { commands },
  }
}
