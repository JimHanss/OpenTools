import type {
  BatchMindMapCommand,
  CommandExecutionContext,
  CommandResult,
  CreateNodeCommand,
  DeleteSubtreeCommand,
  DeletedSubtree,
  MindMapClipboardPayload,
  MindMapCommand,
  MindMapCommandErrorCode,
  MindMapSubtreeSnapshot,
  MoveNodeCommand,
  PasteSubtreeCommand,
  RestoreSubtreeCommand,
  SetNodeCollapseCommand,
  SingleMindMapCommand,
  UpdateNodeLinksCommand,
  UpdateNodeMarkersCommand,
  UpdateNodeNotesCommand,
  UpdateNodeStyleCommand,
  UpdateNodeTextCommand,
  UpdateRelationshipsCommand,
  UpdateBoundariesCommand,
  UpdateSummariesCommand,
  TidyLayoutCommand,
} from './commands'
import { MindMapCommandError, mindMapCommandTypes } from './commands'
import type {
  MindMapDocument,
  MindMapBoundary,
  MindMapLink,
  MindMapNode,
  MindMapNodeId,
  MindMapNodeMarker,
  MindMapNodeStyle,
  MindMapRelationship,
  MindMapSummary,
} from './model'
import {
  getDescendantNodeIds,
  normalizeTopLevelNodeSelection,
} from './traversal'
import { assertMindMapDocument, MindMapValidationError } from './validation'

const untitledMapFallback = 'Untitled mind map'
const untitledTopicFallback = 'Untitled topic'

function fail(
  code: MindMapCommandErrorCode,
  message: string,
  details: Readonly<Record<string, string>> = {},
): never {
  throw new MindMapCommandError(code, message, details)
}

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

function updateDocument(
  document: MindMapDocument,
  nodes: Record<MindMapNodeId, MindMapNode>,
  context: CommandExecutionContext,
): MindMapDocument {
  return {
    ...document,
    nodes,
    updatedAt: context.now,
  }
}

function updateEnhancementRecords(
  document: MindMapDocument,
  records: Pick<MindMapDocument, 'relationships' | 'boundaries' | 'summaries'>,
  context: CommandExecutionContext,
): MindMapDocument {
  return {
    ...document,
    ...records,
    updatedAt: context.now,
  }
}

function cloneRelationship(
  relationship: MindMapRelationship,
): MindMapRelationship {
  return { ...relationship }
}

function cloneBoundary(boundary: MindMapBoundary): MindMapBoundary {
  return { ...boundary, nodeIds: [...boundary.nodeIds] }
}

function cloneSummary(summary: MindMapSummary): MindMapSummary {
  return { ...summary, nodeIds: [...summary.nodeIds] }
}

function assertRelationshipRecords(
  document: MindMapDocument,
  relationships: readonly MindMapRelationship[],
): void {
  const ids = new Set<string>()
  for (const relationship of relationships) {
    if (
      !relationship ||
      relationship.id.trim().length === 0 ||
      ids.has(relationship.id) ||
      !document.nodes[relationship.fromNodeId] ||
      !document.nodes[relationship.toNodeId] ||
      relationship.fromNodeId === relationship.toNodeId ||
      typeof relationship.label !== 'string'
    ) {
      fail(
        'invalid-enhancement',
        'Relationships must have a unique ID and connect two existing topics.',
      )
    }
    ids.add(relationship.id)
  }
}

function assertGroupingRecords(
  document: MindMapDocument,
  groups: readonly MindMapBoundary[] | readonly MindMapSummary[],
  kind: 'boundary' | 'summary',
): void {
  const ids = new Set<string>()
  for (const group of groups) {
    const nodeIds = new Set(group?.nodeIds ?? [])
    if (
      !group ||
      group.id.trim().length === 0 ||
      ids.has(group.id) ||
      nodeIds.size === 0 ||
      nodeIds.size !== group.nodeIds.length ||
      typeof group.label !== 'string' ||
      [...nodeIds].some((nodeId) => !document.nodes[nodeId])
    ) {
      fail(
        'invalid-enhancement',
        `${kind === 'boundary' ? 'Boundaries' : 'Summaries'} must have a unique ID and reference existing topics.`,
      )
    }
    ids.add(group.id)
  }
}

function assertSiblingOrder(
  parent: MindMapNode,
  childIds: readonly MindMapNodeId[],
): void {
  if (
    childIds.length !== parent.childIds.length ||
    new Set(childIds).size !== childIds.length ||
    childIds.some((nodeId) => !parent.childIds.includes(nodeId))
  ) {
    fail(
      'invalid-enhancement',
      'Tidy layout can only reorder the existing children of a topic.',
      { parentId: parent.id },
    )
  }
}

function getNode(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNode {
  const node = document.nodes[nodeId]
  if (!node) {
    fail('missing-node', 'Mind map node was not found.', { nodeId })
  }
  return node
}

function normalizeCommittedText(text: string, fallback: string): string {
  return text.trim().length === 0 ? fallback : text
}

function assertInsertionIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    fail('invalid-index', 'Insertion index is outside the allowed range.', {
      index: String(index),
      length: String(length),
    })
  }
}

function uniqueNodeIds(nodeIds: readonly MindMapNodeId[]): MindMapNodeId[] {
  return [...new Set(nodeIds)]
}

function createResult(
  document: MindMapDocument,
  inverse: MindMapCommand,
  affectedNodeIds: readonly MindMapNodeId[],
): CommandResult {
  return {
    document,
    inverse,
    affectedNodeIds: uniqueNodeIds(affectedNodeIds),
  }
}

function createSubtreeSnapshot(
  document: MindMapDocument,
  rootNodeId: MindMapNodeId,
): MindMapSubtreeSnapshot {
  const nodeIds = [rootNodeId, ...getDescendantNodeIds(document, rootNodeId)]
  const nodes: Record<MindMapNodeId, MindMapNode> = {}

  for (const nodeId of nodeIds) {
    const node = getNode(document, nodeId)
    const clone = cloneNode(node)
    if (nodeId === rootNodeId) clone.parentId = null
    nodes[nodeId] = clone
  }

  return { rootNodeId, nodes }
}

function assertDetachedSubtreeSnapshot(subtree: MindMapSubtreeSnapshot): void {
  const rootNode = subtree.nodes[subtree.rootNodeId]
  if (!rootNode || rootNode.parentId !== null) {
    fail('invalid-subtree', 'Clipboard subtree must contain a detached root.', {
      rootNodeId: subtree.rootNodeId,
    })
  }

  try {
    assertMindMapDocument({
      schemaVersion: 2,
      id: 'subtree-validation',
      title: 'Subtree validation',
      rootNodeId: subtree.rootNodeId,
      nodes: Object.fromEntries(
        Object.entries(subtree.nodes).map(([nodeId, node]) => [
          nodeId,
          cloneNode(node),
        ]),
      ),
      relationships: [],
      boundaries: [],
      summaries: [],
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })
  } catch (error) {
    if (error instanceof MindMapValidationError) {
      fail('invalid-subtree', error.message, error.details)
    }
    throw error
  }
}

function assertClipboard(
  clipboard: MindMapClipboardPayload,
  document: MindMapDocument,
): void {
  if (clipboard.version !== 1 || clipboard.roots.length === 0) {
    fail(
      'invalid-subtree',
      'Clipboard payload must contain at least one subtree.',
    )
  }

  const nodeIds = new Set<MindMapNodeId>()
  for (const subtree of clipboard.roots) {
    assertDetachedSubtreeSnapshot(subtree)

    for (const nodeId of Object.keys(subtree.nodes)) {
      if (document.nodes[nodeId] || nodeIds.has(nodeId)) {
        fail('node-id-collision', 'Clipboard node ID already exists.', {
          nodeId,
        })
      }
      nodeIds.add(nodeId)
    }
  }
}

function cloneSubtreeNodesForParent(
  subtree: MindMapSubtreeSnapshot,
  parentId: MindMapNodeId,
): Record<MindMapNodeId, MindMapNode> {
  const nodes: Record<MindMapNodeId, MindMapNode> = {}

  for (const [nodeId, node] of Object.entries(subtree.nodes)) {
    const clone = cloneNode(node)
    if (nodeId === subtree.rootNodeId) clone.parentId = parentId
    nodes[nodeId] = clone
  }

  return nodes
}

function executeRenameMap(
  document: MindMapDocument,
  command: Extract<
    SingleMindMapCommand,
    { type: typeof mindMapCommandTypes.renameMap }
  >,
  context: CommandExecutionContext,
): CommandResult {
  const title = normalizeCommittedText(
    command.payload.title,
    untitledMapFallback,
  )
  const nextDocument: MindMapDocument = {
    ...document,
    title,
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.renameMap,
      label: 'Restore map title',
      payload: { title: document.title },
    },
    [document.rootNodeId],
  )
}

function executeUpdateNodeText(
  document: MindMapDocument,
  command: UpdateNodeTextCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const text = normalizeCommittedText(
    command.payload.text,
    untitledTopicFallback,
  )
  const nodes = {
    ...document.nodes,
    [node.id]: { ...node, text },
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeText,
      label: 'Restore node text',
      payload: { nodeId: node.id, text: node.text },
    },
    [node.id],
  )
}

function executeSetNodeCollapse(
  document: MindMapDocument,
  command: SetNodeCollapseCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const nodes = {
    ...document.nodes,
    [node.id]: { ...node, collapsed: command.payload.collapsed },
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.setNodeCollapse,
      label: 'Restore node collapse state',
      payload: { nodeId: node.id, collapsed: node.collapsed },
    },
    [node.id],
  )
}

function executeCreateNode(
  document: MindMapDocument,
  command: CreateNodeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const { node: sourceNode, parentId, index } = command.payload
  const parent = getNode(document, parentId)

  if (document.nodes[sourceNode.id]) {
    fail('node-id-collision', 'A node with this ID already exists.', {
      nodeId: sourceNode.id,
    })
  }
  if (sourceNode.parentId !== null || sourceNode.childIds.length > 0) {
    fail('invalid-subtree', 'Create node accepts only a detached leaf node.', {
      nodeId: sourceNode.id,
    })
  }
  assertInsertionIndex(index, parent.childIds.length)

  const node = cloneNode(sourceNode)
  node.parentId = parentId
  node.text = normalizeCommittedText(node.text, untitledTopicFallback)
  const childIds = [...parent.childIds]
  childIds.splice(index, 0, node.id)
  const nodes = {
    ...document.nodes,
    [parent.id]: { ...parent, childIds },
    [node.id]: node,
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.deleteSubtree,
      label: 'Remove created node',
      payload: { nodeIds: [node.id] },
    },
    [parent.id, node.id],
  )
}

function executeMoveNode(
  document: MindMapDocument,
  command: MoveNodeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  if (node.id === document.rootNodeId) {
    fail('root-protected', 'The root node cannot be moved.', {
      nodeId: node.id,
    })
  }

  const sourceParentId = node.parentId
  if (!sourceParentId) {
    fail('root-protected', 'The root node cannot be moved.', {
      nodeId: node.id,
    })
  }

  const sourceParent = getNode(document, sourceParentId)
  const targetParent = getNode(document, command.payload.parentId)
  const sourceIndex = sourceParent.childIds.indexOf(node.id)
  if (sourceIndex < 0) {
    fail('invalid-command', 'The moving node is missing from its parent.', {
      nodeId: node.id,
      parentId: sourceParent.id,
    })
  }

  if (
    targetParent.id === node.id ||
    getDescendantNodeIds(document, node.id).includes(targetParent.id)
  ) {
    fail(
      'target-is-descendant',
      'A node cannot be moved below itself or a descendant.',
      {
        nodeId: node.id,
        parentId: targetParent.id,
      },
    )
  }

  const sourceChildIdsWithoutNode = sourceParent.childIds.filter(
    (childId) => childId !== node.id,
  )
  const targetChildIds =
    sourceParent.id === targetParent.id
      ? sourceChildIdsWithoutNode
      : [...targetParent.childIds]
  assertInsertionIndex(command.payload.index, targetChildIds.length)

  if (
    sourceParent.id === targetParent.id &&
    command.payload.index === sourceIndex
  ) {
    fail('no-op-move', 'The node is already at the requested position.', {
      nodeId: node.id,
    })
  }

  targetChildIds.splice(command.payload.index, 0, node.id)
  const nodes: Record<MindMapNodeId, MindMapNode> = {
    ...document.nodes,
    [node.id]: { ...node, parentId: targetParent.id },
  }

  if (sourceParent.id === targetParent.id) {
    nodes[sourceParent.id] = { ...sourceParent, childIds: targetChildIds }
  } else {
    nodes[sourceParent.id] = {
      ...sourceParent,
      childIds: sourceChildIdsWithoutNode,
    }
    nodes[targetParent.id] = { ...targetParent, childIds: targetChildIds }
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.moveNode,
      label: 'Restore node position',
      payload: {
        nodeId: node.id,
        parentId: sourceParent.id,
        index: sourceIndex,
      },
    },
    [node.id, sourceParent.id, targetParent.id],
  )
}

function executeDeleteSubtrees(
  document: MindMapDocument,
  command: DeleteSubtreeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const rootNodeIds = normalizeTopLevelNodeSelection(
    document,
    command.payload.nodeIds,
  )
  if (rootNodeIds.length === 0) {
    fail('invalid-command', 'Delete command requires at least one node.')
  }
  if (rootNodeIds.includes(document.rootNodeId)) {
    fail('root-protected', 'The root node cannot be deleted.', {
      nodeId: document.rootNodeId,
    })
  }

  const entries: DeletedSubtree[] = rootNodeIds.map((rootNodeId) => {
    const node = getNode(document, rootNodeId)
    const parentId = node.parentId
    if (!parentId) {
      fail('root-protected', 'The root node cannot be deleted.', {
        nodeId: node.id,
      })
    }

    const parent = getNode(document, parentId)
    const index = parent.childIds.indexOf(node.id)
    if (index < 0) {
      fail('invalid-command', 'The deleted node is missing from its parent.', {
        nodeId: node.id,
        parentId,
      })
    }

    return {
      parentId,
      index,
      subtree: createSubtreeSnapshot(document, node.id),
    }
  })

  const deletedNodeIds = new Set<MindMapNodeId>()
  for (const entry of entries) {
    deletedNodeIds.add(entry.subtree.rootNodeId)
    for (const nodeId of Object.keys(entry.subtree.nodes)) {
      deletedNodeIds.add(nodeId)
    }
  }

  const deletedRootNodeIds = new Set(
    entries.map((entry) => entry.subtree.rootNodeId),
  )
  const nodes: Record<MindMapNodeId, MindMapNode> = { ...document.nodes }
  for (const nodeId of deletedNodeIds) delete nodes[nodeId]

  for (const parentId of new Set(entries.map((entry) => entry.parentId))) {
    const parent = getNode(document, parentId)
    nodes[parentId] = {
      ...parent,
      childIds: parent.childIds.filter(
        (childId) => !deletedRootNodeIds.has(childId),
      ),
    }
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.restoreSubtree,
      label: 'Restore deleted nodes',
      payload: { entries },
    },
    [...deletedNodeIds, ...entries.map((entry) => entry.parentId)],
  )
}

function executeRestoreSubtrees(
  document: MindMapDocument,
  command: RestoreSubtreeCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (command.payload.entries.length === 0) {
    fail('invalid-subtree', 'Restore command requires at least one subtree.')
  }

  const seenNodeIds = new Set<MindMapNodeId>()
  for (const entry of command.payload.entries) {
    getNode(document, entry.parentId)
    assertDetachedSubtreeSnapshot(entry.subtree)

    for (const nodeId of Object.keys(entry.subtree.nodes)) {
      if (document.nodes[nodeId] || seenNodeIds.has(nodeId)) {
        fail('node-id-collision', 'Restored node ID already exists.', {
          nodeId,
        })
      }
      seenNodeIds.add(nodeId)
    }
  }

  const entriesByParent = new Map<MindMapNodeId, DeletedSubtree[]>()
  for (const entry of command.payload.entries) {
    const entries = entriesByParent.get(entry.parentId) ?? []
    entries.push(entry)
    entriesByParent.set(entry.parentId, entries)
  }

  const nodes: Record<MindMapNodeId, MindMapNode> = { ...document.nodes }
  for (const [parentId, entries] of entriesByParent) {
    const parent = getNode(document, parentId)
    const childIds = [...parent.childIds]

    for (const entry of [...entries].sort(
      (left, right) => left.index - right.index,
    )) {
      assertInsertionIndex(entry.index, childIds.length)
      childIds.splice(entry.index, 0, entry.subtree.rootNodeId)
      Object.assign(
        nodes,
        cloneSubtreeNodesForParent(entry.subtree, entry.parentId),
      )
    }

    nodes[parentId] = { ...parent, childIds }
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.deleteSubtree,
      label: 'Delete restored nodes',
      payload: {
        nodeIds: command.payload.entries.map(
          (entry) => entry.subtree.rootNodeId,
        ),
      },
    },
    [...seenNodeIds, ...entriesByParent.keys()],
  )
}

function executePasteSubtrees(
  document: MindMapDocument,
  command: PasteSubtreeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const parent = getNode(document, command.payload.parentId)
  assertClipboard(command.payload.clipboard, document)
  assertInsertionIndex(command.payload.index, parent.childIds.length)

  const entries: DeletedSubtree[] = command.payload.clipboard.roots.map(
    (subtree, offset) => ({
      parentId: parent.id,
      index: command.payload.index + offset,
      subtree,
    }),
  )

  return executeRestoreSubtrees(
    document,
    {
      type: mindMapCommandTypes.restoreSubtree,
      label: 'Restore pasted nodes',
      payload: { entries },
    },
    context,
  )
}

function executeUpdateNodeStyle(
  document: MindMapDocument,
  command: UpdateNodeStyleCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const style: MindMapNodeStyle = { ...node.style, ...command.payload.style }
  const nodes = { ...document.nodes, [node.id]: { ...node, style } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Restore node style',
      payload: { nodeId: node.id, style: { ...node.style } },
    },
    [node.id],
  )
}

function assertMarkers(
  markers: readonly MindMapNodeMarker[],
  allowLegacyMarkers: boolean,
): void {
  const markerKinds = new Map<string, number>()

  for (const marker of markers) {
    if (typeof marker === 'string') {
      if (!allowLegacyMarkers) {
        fail(
          'invalid-marker',
          'New marker updates must use structured markers.',
        )
      }
      continue
    }

    if (
      !marker ||
      typeof marker.kind !== 'string' ||
      typeof marker.value !== 'string' ||
      !['priority', 'status', 'icon'].includes(marker.kind) ||
      marker.value.trim().length === 0
    ) {
      fail('invalid-marker', 'Markers must have a known kind and a value.')
    }

    markerKinds.set(marker.kind, (markerKinds.get(marker.kind) ?? 0) + 1)
  }

  for (const kind of ['priority', 'status'] as const) {
    if ((markerKinds.get(kind) ?? 0) > 1) {
      fail('invalid-marker', `A node can have only one ${kind} marker.`, {
        kind,
      })
    }
  }
}

function executeUpdateNodeMarkers(
  document: MindMapDocument,
  command: UpdateNodeMarkersCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  assertMarkers(
    command.payload.markers,
    command.payload.allowLegacyMarkers ?? false,
  )
  const markers = command.payload.markers.map((marker) =>
    typeof marker === 'string' ? marker : { ...marker },
  )
  const nodes = { ...document.nodes, [node.id]: { ...node, markers } }
  const previousMarkers = node.markers.map((marker) =>
    typeof marker === 'string' ? marker : { ...marker },
  )

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeMarkers,
      label: 'Restore node markers',
      payload: {
        nodeId: node.id,
        markers: previousMarkers,
        allowLegacyMarkers: true,
      },
    },
    [node.id],
  )
}

function executeUpdateNodeNotes(
  document: MindMapDocument,
  command: UpdateNodeNotesCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const nodes = {
    ...document.nodes,
    [node.id]: { ...node, notes: command.payload.notes },
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeNotes,
      label: 'Restore node notes',
      payload: { nodeId: node.id, notes: node.notes },
    },
    [node.id],
  )
}

function assertLinks(links: readonly MindMapLink[]): void {
  for (const link of links) {
    if (
      !link ||
      typeof link.label !== 'string' ||
      typeof link.url !== 'string' ||
      link.url.trim().length === 0
    ) {
      fail('invalid-link', 'Links must include a non-empty URL.')
    }
  }
}

function executeUpdateNodeLinks(
  document: MindMapDocument,
  command: UpdateNodeLinksCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  assertLinks(command.payload.links)
  const links = command.payload.links.map((link) => ({ ...link }))
  const nodes = { ...document.nodes, [node.id]: { ...node, links } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeLinks,
      label: 'Restore node links',
      payload: {
        nodeId: node.id,
        links: node.links.map((link) => ({ ...link })),
      },
    },
    [node.id],
  )
}

function executeUpdateRelationships(
  document: MindMapDocument,
  command: UpdateRelationshipsCommand,
  context: CommandExecutionContext,
): CommandResult {
  assertRelationshipRecords(document, command.payload.relationships)
  const relationships = command.payload.relationships.map(cloneRelationship)

  return createResult(
    updateEnhancementRecords(
      document,
      {
        relationships,
        boundaries: document.boundaries,
        summaries: document.summaries,
      },
      context,
    ),
    {
      type: mindMapCommandTypes.updateRelationships,
      label: 'Restore relationship lines',
      payload: { relationships: document.relationships.map(cloneRelationship) },
    },
    relationships.flatMap((relationship) => [
      relationship.fromNodeId,
      relationship.toNodeId,
    ]),
  )
}

function executeUpdateBoundaries(
  document: MindMapDocument,
  command: UpdateBoundariesCommand,
  context: CommandExecutionContext,
): CommandResult {
  assertGroupingRecords(document, command.payload.boundaries, 'boundary')
  const boundaries = command.payload.boundaries.map(cloneBoundary)

  return createResult(
    updateEnhancementRecords(
      document,
      {
        relationships: document.relationships,
        boundaries,
        summaries: document.summaries,
      },
      context,
    ),
    {
      type: mindMapCommandTypes.updateBoundaries,
      label: 'Restore boundaries',
      payload: { boundaries: document.boundaries.map(cloneBoundary) },
    },
    boundaries.flatMap((boundary) => boundary.nodeIds),
  )
}

function executeUpdateSummaries(
  document: MindMapDocument,
  command: UpdateSummariesCommand,
  context: CommandExecutionContext,
): CommandResult {
  assertGroupingRecords(document, command.payload.summaries, 'summary')
  const summaries = command.payload.summaries.map(cloneSummary)

  return createResult(
    updateEnhancementRecords(
      document,
      {
        relationships: document.relationships,
        boundaries: document.boundaries,
        summaries,
      },
      context,
    ),
    {
      type: mindMapCommandTypes.updateSummaries,
      label: 'Restore summaries',
      payload: { summaries: document.summaries.map(cloneSummary) },
    },
    summaries.flatMap((summary) => summary.nodeIds),
  )
}

function executeTidyLayout(
  document: MindMapDocument,
  command: TidyLayoutCommand,
  context: CommandExecutionContext,
): CommandResult {
  const nodes = { ...document.nodes }
  const previousChildIdsByParent: Record<
    MindMapNodeId,
    readonly MindMapNodeId[]
  > = {}
  const affectedNodeIds: MindMapNodeId[] = []

  for (const [parentId, childIds] of Object.entries(
    command.payload.childIdsByParent,
  )) {
    const parent = getNode(document, parentId)
    assertSiblingOrder(parent, childIds)
    if (childIds.some((nodeId, index) => nodeId !== parent.childIds[index])) {
      previousChildIdsByParent[parent.id] = [...parent.childIds]
      nodes[parent.id] = { ...parent, childIds: [...childIds] }
      affectedNodeIds.push(parent.id, ...childIds)
    }
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.tidyLayout,
      label: 'Restore topic order',
      payload: { childIdsByParent: previousChildIdsByParent },
    },
    affectedNodeIds,
  )
}

function executeBatch(
  document: MindMapDocument,
  command: BatchMindMapCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (command.payload.commands.length === 0) {
    fail('empty-batch', 'A batch command requires at least one command.')
  }

  let currentDocument = document
  const inverses: SingleMindMapCommand[] = []
  const affectedNodeIds: MindMapNodeId[] = []

  for (const childCommand of command.payload.commands) {
    const result = executeSingleCommand(currentDocument, childCommand, context)
    currentDocument = result.document
    if (result.inverse.type === mindMapCommandTypes.batch) {
      fail('invalid-command', 'Batch commands cannot be nested.')
    }
    inverses.unshift(result.inverse)
    affectedNodeIds.push(...result.affectedNodeIds)
  }

  return createResult(
    currentDocument,
    {
      type: mindMapCommandTypes.batch,
      label: 'Revert batch edit',
      payload: { commands: inverses },
    },
    affectedNodeIds,
  )
}

function executeSingleCommand(
  document: MindMapDocument,
  command: SingleMindMapCommand,
  context: CommandExecutionContext,
): CommandResult {
  switch (command.type) {
    case mindMapCommandTypes.renameMap:
      return executeRenameMap(document, command, context)
    case mindMapCommandTypes.createNode:
      return executeCreateNode(document, command, context)
    case mindMapCommandTypes.updateNodeText:
      return executeUpdateNodeText(document, command, context)
    case mindMapCommandTypes.updateNodeStyle:
      return executeUpdateNodeStyle(document, command, context)
    case mindMapCommandTypes.updateNodeMarkers:
      return executeUpdateNodeMarkers(document, command, context)
    case mindMapCommandTypes.updateNodeNotes:
      return executeUpdateNodeNotes(document, command, context)
    case mindMapCommandTypes.updateNodeLinks:
      return executeUpdateNodeLinks(document, command, context)
    case mindMapCommandTypes.setNodeCollapse:
      return executeSetNodeCollapse(document, command, context)
    case mindMapCommandTypes.updateRelationships:
      return executeUpdateRelationships(document, command, context)
    case mindMapCommandTypes.updateBoundaries:
      return executeUpdateBoundaries(document, command, context)
    case mindMapCommandTypes.updateSummaries:
      return executeUpdateSummaries(document, command, context)
    case mindMapCommandTypes.tidyLayout:
      return executeTidyLayout(document, command, context)
    case mindMapCommandTypes.moveNode:
      return executeMoveNode(document, command, context)
    case mindMapCommandTypes.deleteSubtree:
      return executeDeleteSubtrees(document, command, context)
    case mindMapCommandTypes.restoreSubtree:
      return executeRestoreSubtrees(document, command, context)
    case mindMapCommandTypes.pasteSubtree:
      return executePasteSubtrees(document, command, context)
  }
}

export function executeMindMapCommand(
  document: MindMapDocument,
  command: MindMapCommand,
  context: CommandExecutionContext,
): CommandResult {
  assertMindMapDocument(document)
  const result =
    command.type === mindMapCommandTypes.batch
      ? executeBatch(document, command, context)
      : executeSingleCommand(document, command, context)

  assertMindMapDocument(result.document)
  return result
}
