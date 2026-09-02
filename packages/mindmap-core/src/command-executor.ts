import type {
  AttachFloatingTopicCommand,
  BatchMindMapCommand,
  CommandExecutionContext,
  CommandResult,
  ConvertToFloatingTopicCommand,
  CreateBoundaryCommand,
  CreateCalloutCommand,
  CreateFloatingTopicCommand,
  CreateEquationContentBlockCommand,
  CreateImageContentBlockCommand,
  CreateNodeCommand,
  CreateRelationshipCommand,
  CreateSummaryCommand,
  DeleteBoundaryCommand,
  DeleteCalloutCommand,
  DeleteEquationContentBlockCommand,
  DeleteLabelCommand,
  DeleteImageContentBlockCommand,
  DeleteNodeKeepChildrenCommand,
  DeleteSubtreeCommand,
  DeleteRelationshipCommand,
  DeleteSummaryCommand,
  DeletedSubtree,
  InsertParentNodeCommand,
  MindMapClipboardPayload,
  MindMapCommand,
  MindMapCommandErrorCode,
  MindMapSubtreeSnapshot,
  MoveNodeCommand,
  PasteSubtreeCommand,
  RestoreDeletedNodeCommand,
  RestoreLabelCommand,
  RestoreSubtreeCommand,
  SetDefaultStructureCommand,
  SetFloatingTopicPlacementCommand,
  SetNodeCollapseCommand,
  SetNodeLabelsCommand,
  SetNodeNumberingCommand,
  SetNodeStructureCommand,
  SetNodeWidthCommand,
  SingleMindMapCommand,
  UpdateNodeLinksCommand,
  UpdateEquationContentBlockCommand,
  UpdateImageContentBlockCommand,
  UpdateNodeMarkersCommand,
  UpdateNodeNotesCommand,
  UpdateNodeStyleCommand,
  UpdateNodeTextCommand,
  UpdateBoundaryCommand,
  UpdateCalloutCommand,
  UpdateRelationshipCommand,
  UpdateRelationshipsCommand,
  UpdateSummaryCommand,
  UpdateBoundariesCommand,
  UpdateSummariesCommand,
  UpdateThemeCommand,
  TidyLayoutCommand,
  UpsertLabelCommand,
} from './commands'
import { MindMapCommandError, mindMapCommandTypes } from './commands'
import { createMindMapDocument } from './document'
import {
  getMindMapLabelComparisonKey,
  isValidMindMapLabel,
  normalizeMindMapLabelName,
  sortMindMapLabelIds,
} from './labels'
import { mindMapStructures } from './model'
import { isValidMindMapNumberingPolicy } from './numbering'
import type {
  FloatingTopicPlacement,
  MindMapDocument,
  MindMapEquationContentBlock,
  MindMapImageContentBlock,
  MindMapAssetMetadata,
  MindMapBoundary,
  MindMapCallout,
  MindMapLabel,
  MindMapLink,
  MindMapNode,
  MindMapNodeId,
  MindMapNodeMarker,
  MindMapNodeStyle,
  MindMapNodeStyleOverride,
  MindMapRelationship,
  MindMapSummary,
  MindMapTheme,
} from './model'
import {
  getComputedMindMapNodeStyle,
  isValidMindMapNodeStyle,
  isValidMindMapNodeStyleOverride,
  isValidMindMapTheme,
  mindMapNodeStyleKeys,
} from './styles'
import {
  getDescendantNodeIds,
  normalizeTopLevelNodeSelection,
} from './traversal'
import { assertMindMapDocument, MindMapValidationError } from './validation'

const untitledMapFallback = 'Untitled mind map'
const untitledTopicFallback = 'Untitled topic'
const maximumEquationSourceLength = 10_000
const maximumEquationDimension = 4096

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
    markers: node.markers.map((marker) => ({ ...marker })),
    links: node.links.map((link) => ({ ...link })),
    labelIds: [...node.labelIds],
    ...(node.numbering ? { numbering: { ...node.numbering } } : {}),
    contentBlocks: node.contentBlocks.map((block) => ({ ...block })),
    styleOverrides: { ...node.styleOverrides },
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
  records: Partial<
    Pick<
      MindMapDocument,
      'relationships' | 'boundaries' | 'summaries' | 'callouts'
    >
  >,
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

function cloneLabel(label: MindMapLabel): MindMapLabel {
  return { ...label }
}

function cloneAsset(asset: MindMapAssetMetadata): MindMapAssetMetadata {
  return { ...asset }
}

function clonePlacement(
  placement: FloatingTopicPlacement,
): FloatingTopicPlacement {
  return { ...placement }
}

function cloneMindMapTheme(theme: MindMapTheme): MindMapTheme {
  return {
    ...theme,
    rootTopicStyle: { ...theme.rootTopicStyle },
    mainTopicStyle: { ...theme.mainTopicStyle },
    subtopicStyle: { ...theme.subtopicStyle },
  }
}

function assertPlacement(placement: FloatingTopicPlacement): void {
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
    fail('invalid-placement', 'Floating topic placement must be finite.')
  }
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
  const nodeIdSet = new Set(nodeIds)
  const nodes: Record<MindMapNodeId, MindMapNode> = {}

  for (const nodeId of nodeIds) {
    const node = getNode(document, nodeId)
    const clone = cloneNode(node)
    if (nodeId === rootNodeId) clone.parentId = null
    nodes[nodeId] = clone
  }

  return {
    rootNodeId,
    nodes,
    relationships: document.relationships
      .filter(
        (relationship) =>
          nodeIdSet.has(relationship.fromNodeId) ||
          nodeIdSet.has(relationship.toNodeId),
      )
      .map(cloneRelationship),
    boundaries: document.boundaries
      .filter((boundary) =>
        boundary.nodeIds.some((nodeId) => nodeIdSet.has(nodeId)),
      )
      .map(cloneBoundary),
    summaries: document.summaries
      .filter((summary) =>
        summary.nodeIds.some((nodeId) => nodeIdSet.has(nodeId)),
      )
      .map(cloneSummary),
    callouts: document.callouts
      .filter((callout) => nodeIdSet.has(callout.ownerNodeId))
      .map(cloneCallout),
    structureOverrides: Object.fromEntries(
      nodeIds.flatMap((nodeId) => {
        const structure = document.structureOverrides[nodeId]
        return structure ? [[nodeId, structure] as const] : []
      }),
    ),
  }
}

function assertDetachedSubtreeSnapshot(
  subtree: MindMapSubtreeSnapshot,
  document: Pick<MindMapDocument, 'labels' | 'assets'>,
): void {
  const rootNode = subtree.nodes[subtree.rootNodeId]
  if (!rootNode || rootNode.parentId !== null) {
    fail('invalid-subtree', 'Clipboard subtree must contain a detached root.', {
      rootNodeId: subtree.rootNodeId,
    })
  }

  try {
    const validationDocument = createMindMapDocument({
      id: 'subtree-validation',
      title: 'Subtree validation',
      rootNodeId: subtree.rootNodeId,
      now: '1970-01-01T00:00:00.000Z',
    })
    validationDocument.nodes = Object.fromEntries(
      Object.entries(subtree.nodes).map(([nodeId, node]) => [
        nodeId,
        cloneNode(node),
      ]),
    )
    validationDocument.labels = { ...document.labels }
    validationDocument.assets = { ...document.assets }
    validationDocument.relationships = (subtree.relationships ?? [])
      .filter(
        (relationship) =>
          Boolean(validationDocument.nodes[relationship.fromNodeId]) &&
          Boolean(validationDocument.nodes[relationship.toNodeId]),
      )
      .map(cloneRelationship)
    validationDocument.boundaries = (subtree.boundaries ?? [])
      .filter((boundary) =>
        boundary.nodeIds.every((nodeId) => validationDocument.nodes[nodeId]),
      )
      .map(cloneBoundary)
    validationDocument.summaries = (subtree.summaries ?? [])
      .filter((summary) =>
        summary.nodeIds.every((nodeId) => validationDocument.nodes[nodeId]),
      )
      .map(cloneSummary)
    validationDocument.callouts = (subtree.callouts ?? []).map(cloneCallout)
    validationDocument.structureOverrides = {
      ...subtree.structureOverrides,
    }
    assertMindMapDocument(validationDocument)
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
    assertDetachedSubtreeSnapshot(subtree, {
      labels: { ...document.labels, ...clipboard.labels },
      assets: { ...document.assets, ...clipboard.assets },
    })

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

function createDetachedNodeSnapshot(
  document: MindMapDocument,
  node: MindMapNode,
): RestoreDeletedNodeCommand['payload']['snapshot'] {
  return {
    node: cloneNode(node),
    relationships: document.relationships
      .filter(
        (relationship) =>
          relationship.fromNodeId === node.id ||
          relationship.toNodeId === node.id,
      )
      .map(cloneRelationship),
    boundaries: document.boundaries
      .filter((boundary) => boundary.nodeIds.includes(node.id))
      .map(cloneBoundary),
    summaries: document.summaries
      .filter((summary) => summary.nodeIds.includes(node.id))
      .map(cloneSummary),
    callouts: document.callouts
      .filter((callout) => callout.ownerNodeId === node.id)
      .map(cloneCallout),
    structureOverride: document.structureOverrides[node.id],
  }
}

function assertRecordIdsAvailable(
  currentIds: Iterable<string>,
  restoredIds: Iterable<string>,
  kind: string,
): void {
  const current = new Set(currentIds)
  const restored = new Set<string>()
  for (const id of restoredIds) {
    if (current.has(id) || restored.has(id)) {
      fail('invalid-enhancement', `Restored ${kind} ID already exists.`, {
        id,
      })
    }
    restored.add(id)
  }
}

function uniqueRecordsById<RecordType extends { readonly id: string }>(
  records: readonly RecordType[],
): RecordType[] {
  const unique = new Map<string, RecordType>()
  for (const record of records) {
    if (!unique.has(record.id)) unique.set(record.id, record)
  }
  return [...unique.values()]
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

function executeSetDefaultStructure(
  document: MindMapDocument,
  command: SetDefaultStructureCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (!mindMapStructures.includes(command.payload.structure)) {
    fail('invalid-structure', 'The requested map structure is not supported.', {
      structure: String(command.payload.structure),
    })
  }
  return createResult(
    {
      ...document,
      defaultStructure: command.payload.structure,
      updatedAt: context.now,
    },
    {
      type: mindMapCommandTypes.setDefaultStructure,
      label: 'Restore default map structure',
      payload: { structure: document.defaultStructure },
    },
    [document.rootNodeId],
  )
}

function executeUpdateTheme(
  document: MindMapDocument,
  command: UpdateThemeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const theme = cloneMindMapTheme(command.payload.theme)
  if (!isValidMindMapTheme(theme)) {
    fail('invalid-style', 'The requested mind map theme is invalid.')
  }
  return createResult(
    { ...document, theme, updatedAt: context.now },
    {
      type: mindMapCommandTypes.updateTheme,
      label: 'Restore mind map theme',
      payload: { theme: cloneMindMapTheme(document.theme) },
    },
    Object.keys(document.nodes),
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

function executeSetNodeStructure(
  document: MindMapDocument,
  command: SetNodeStructureCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  if (
    command.payload.structure !== null &&
    !mindMapStructures.includes(command.payload.structure)
  ) {
    fail(
      'invalid-structure',
      'The requested topic structure is not supported.',
      {
        nodeId: node.id,
        structure: String(command.payload.structure),
      },
    )
  }
  const previous = document.structureOverrides[node.id] ?? null
  const structureOverrides = { ...document.structureOverrides }
  if (command.payload.structure === null) delete structureOverrides[node.id]
  else structureOverrides[node.id] = command.payload.structure
  return createResult(
    { ...document, structureOverrides, updatedAt: context.now },
    {
      type: mindMapCommandTypes.setNodeStructure,
      label: 'Restore topic structure',
      payload: { nodeId: node.id, structure: previous },
    },
    [node.id],
  )
}

function executeUpsertLabel(
  document: MindMapDocument,
  command: UpsertLabelCommand,
  context: CommandExecutionContext,
): CommandResult {
  const value = {
    ...command.payload.value,
    name: normalizeMindMapLabelName(command.payload.value.name),
  }
  if (!isValidMindMapLabel(value)) {
    fail('invalid-label', 'The label name, color or order is invalid.', {
      labelId: value.id,
    })
  }
  const comparisonKey = getMindMapLabelComparisonKey(value.name)
  const duplicate = Object.values(document.labels).find(
    (label) =>
      label.id !== value.id &&
      getMindMapLabelComparisonKey(label.name) === comparisonKey,
  )
  if (duplicate) {
    fail('invalid-label', 'Label names must be unique regardless of case.', {
      labelId: value.id,
      duplicateLabelId: duplicate.id,
    })
  }
  const previous = document.labels[value.id]
  return createResult(
    {
      ...document,
      labels: { ...document.labels, [value.id]: cloneLabel(value) },
      updatedAt: context.now,
    },
    previous
      ? {
          type: mindMapCommandTypes.upsertLabel,
          label: 'Restore label',
          payload: { value: cloneLabel(previous) },
        }
      : {
          type: mindMapCommandTypes.deleteLabel,
          label: 'Delete created label',
          payload: { labelId: value.id },
        },
    [],
  )
}

function executeDeleteLabel(
  document: MindMapDocument,
  command: DeleteLabelCommand,
  context: CommandExecutionContext,
): CommandResult {
  const label = document.labels[command.payload.labelId]
  if (!label) {
    fail('invalid-label', 'The requested label does not exist.', {
      labelId: command.payload.labelId,
    })
  }
  const nodeLabelIds: Record<MindMapNodeId, readonly string[]> = {}
  const nodes = Object.fromEntries(
    Object.entries(document.nodes).map(([nodeId, node]) => {
      if (!node.labelIds.includes(label.id)) return [nodeId, node]
      nodeLabelIds[nodeId] = [...node.labelIds]
      return [
        nodeId,
        {
          ...node,
          labelIds: node.labelIds.filter((labelId) => labelId !== label.id),
        },
      ]
    }),
  )
  const labels = { ...document.labels }
  delete labels[label.id]
  return createResult(
    { ...document, labels, nodes, updatedAt: context.now },
    {
      type: mindMapCommandTypes.restoreLabel,
      label: 'Restore deleted label',
      payload: {
        snapshot: { label: cloneLabel(label), nodeLabelIds },
      },
    },
    Object.keys(nodeLabelIds),
  )
}

function executeRestoreLabel(
  document: MindMapDocument,
  command: RestoreLabelCommand,
  context: CommandExecutionContext,
): CommandResult {
  const { label, nodeLabelIds } = command.payload.snapshot
  if (document.labels[label.id]) {
    fail('invalid-label', 'The restored label ID already exists.', {
      labelId: label.id,
    })
  }
  const comparisonKey = getMindMapLabelComparisonKey(label.name)
  if (
    Object.values(document.labels).some(
      (candidate) =>
        getMindMapLabelComparisonKey(candidate.name) === comparisonKey,
    )
  ) {
    fail('invalid-label', 'The restored label name already exists.', {
      labelId: label.id,
    })
  }
  const labels = { ...document.labels, [label.id]: cloneLabel(label) }
  const nodes = { ...document.nodes }
  for (const [nodeId, restoredLabelIds] of Object.entries(nodeLabelIds)) {
    const node = getNode(document, nodeId)
    if (
      new Set(restoredLabelIds).size !== restoredLabelIds.length ||
      restoredLabelIds.some((labelId) => !labels[labelId])
    ) {
      fail('invalid-label', 'Restored topic labels are invalid.', { nodeId })
    }
    nodes[nodeId] = { ...node, labelIds: [...restoredLabelIds] }
  }
  return createResult(
    { ...document, labels, nodes, updatedAt: context.now },
    {
      type: mindMapCommandTypes.deleteLabel,
      label: 'Delete restored label',
      payload: { labelId: label.id },
    },
    Object.keys(nodeLabelIds),
  )
}

function executeSetNodeLabels(
  document: MindMapDocument,
  command: SetNodeLabelsCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  if (
    new Set(command.payload.labelIds).size !==
      command.payload.labelIds.length ||
    command.payload.labelIds.some((labelId) => !document.labels[labelId])
  ) {
    fail('invalid-label', 'Topic labels must be unique catalog entries.', {
      nodeId: node.id,
    })
  }
  const sortMode = command.payload.sortMode ?? node.labelSortMode
  const labelIds =
    sortMode === 'alphabetical'
      ? sortMindMapLabelIds(document, command.payload.labelIds)
      : [...command.payload.labelIds]
  const nodes = {
    ...document.nodes,
    [node.id]: { ...node, labelIds, labelSortMode: sortMode },
  }
  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.setNodeLabels,
      label: 'Restore topic labels',
      payload: {
        nodeId: node.id,
        labelIds: [...node.labelIds],
        sortMode: node.labelSortMode,
      },
    },
    [node.id],
  )
}

function executeSetNodeNumbering(
  document: MindMapDocument,
  command: SetNodeNumberingCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const numbering = command.payload.numbering
  if (
    numbering &&
    !isValidMindMapNumberingPolicy(document, node.id, numbering)
  ) {
    fail('invalid-numbering', 'The numbering policy is invalid.', {
      nodeId: node.id,
    })
  }
  const updatedNode = cloneNode(node)
  if (numbering) updatedNode.numbering = { ...numbering }
  else delete updatedNode.numbering
  const nodes = { ...document.nodes, [node.id]: updatedNode }
  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.setNodeNumbering,
      label: 'Restore topic numbering',
      payload: {
        nodeId: node.id,
        numbering: node.numbering ? { ...node.numbering } : null,
      },
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

function executeInsertParentNode(
  document: MindMapDocument,
  command: InsertParentNodeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const target = getNode(document, command.payload.targetNodeId)
  if (target.id === document.rootNodeId || !target.parentId) {
    fail('root-protected', 'A parent cannot be inserted above a root topic.', {
      nodeId: target.id,
    })
  }

  const parent = getNode(document, target.parentId)
  const targetIndex = parent.childIds.indexOf(target.id)
  if (targetIndex < 0) {
    fail('invalid-command', 'The target topic is missing from its parent.', {
      nodeId: target.id,
      parentId: parent.id,
    })
  }

  const sourceNode = command.payload.node
  if (document.nodes[sourceNode.id]) {
    fail('node-id-collision', 'A node with this ID already exists.', {
      nodeId: sourceNode.id,
    })
  }
  if (sourceNode.parentId !== null || sourceNode.childIds.length > 0) {
    fail('invalid-subtree', 'Inserted parent must be a detached leaf topic.', {
      nodeId: sourceNode.id,
    })
  }

  const insertedParent = cloneNode(sourceNode)
  insertedParent.parentId = parent.id
  insertedParent.childIds = [target.id]
  insertedParent.text = normalizeCommittedText(
    insertedParent.text,
    untitledTopicFallback,
  )
  const parentChildIds = [...parent.childIds]
  parentChildIds.splice(targetIndex, 1, insertedParent.id)
  const nodes = {
    ...document.nodes,
    [parent.id]: { ...parent, childIds: parentChildIds },
    [target.id]: { ...target, parentId: insertedParent.id },
    [insertedParent.id]: insertedParent,
  }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.deleteNodeKeepChildren,
      label: 'Remove inserted parent topic',
      payload: { nodeId: insertedParent.id },
    },
    [parent.id, insertedParent.id, target.id],
  )
}

function executeDeleteNodeKeepChildren(
  document: MindMapDocument,
  command: DeleteNodeKeepChildrenCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  if (node.id === document.rootNodeId || !node.parentId) {
    fail(
      'root-protected',
      'A root topic cannot be deleted while keeping its children.',
      { nodeId: node.id },
    )
  }

  const parent = getNode(document, node.parentId)
  const index = parent.childIds.indexOf(node.id)
  if (index < 0) {
    fail('invalid-command', 'The deleted topic is missing from its parent.', {
      nodeId: node.id,
      parentId: parent.id,
    })
  }

  const snapshot = createDetachedNodeSnapshot(document, node)
  const parentChildIds = [...parent.childIds]
  parentChildIds.splice(index, 1, ...node.childIds)
  const nodes = { ...document.nodes }
  delete nodes[node.id]
  nodes[parent.id] = { ...parent, childIds: parentChildIds }
  for (const childId of node.childIds) {
    const child = getNode(document, childId)
    nodes[child.id] = { ...child, parentId: parent.id }
  }

  const structureOverrides = { ...document.structureOverrides }
  delete structureOverrides[node.id]
  const nextDocument: MindMapDocument = {
    ...document,
    nodes,
    structureOverrides,
    relationships: document.relationships
      .filter(
        (relationship) =>
          relationship.fromNodeId !== node.id &&
          relationship.toNodeId !== node.id,
      )
      .map(cloneRelationship),
    boundaries: document.boundaries
      .filter((boundary) => !boundary.nodeIds.includes(node.id))
      .map(cloneBoundary),
    summaries: document.summaries
      .filter((summary) => !summary.nodeIds.includes(node.id))
      .map(cloneSummary),
    callouts: document.callouts
      .filter((callout) => callout.ownerNodeId !== node.id)
      .map(cloneCallout),
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.restoreDeletedNode,
      label: 'Restore deleted topic',
      payload: { snapshot, parentId: parent.id, index },
    },
    [parent.id, node.id, ...node.childIds],
  )
}

function executeRestoreDeletedNode(
  document: MindMapDocument,
  command: RestoreDeletedNodeCommand,
  context: CommandExecutionContext,
): CommandResult {
  const { snapshot, parentId, index } = command.payload
  const node = snapshot.node
  if (document.nodes[node.id]) {
    fail('node-id-collision', 'Restored topic ID already exists.', {
      nodeId: node.id,
    })
  }
  const parent = getNode(document, parentId)
  assertInsertionIndex(index, parent.childIds.length)

  for (const childId of node.childIds) {
    const child = getNode(document, childId)
    if (child.parentId !== parent.id || !parent.childIds.includes(child.id)) {
      fail(
        'invalid-command',
        'A promoted child moved before its deleted parent could be restored.',
        { nodeId: node.id, childId },
      )
    }
  }

  assertRecordIdsAvailable(
    document.relationships.map((record) => record.id),
    snapshot.relationships.map((record) => record.id),
    'relationship',
  )
  assertRecordIdsAvailable(
    document.boundaries.map((record) => record.id),
    snapshot.boundaries.map((record) => record.id),
    'boundary',
  )
  assertRecordIdsAvailable(
    document.summaries.map((record) => record.id),
    snapshot.summaries.map((record) => record.id),
    'summary',
  )
  assertRecordIdsAvailable(
    document.callouts.map((record) => record.id),
    snapshot.callouts.map((record) => record.id),
    'callout',
  )

  const parentChildIds = parent.childIds.filter(
    (childId) => !node.childIds.includes(childId),
  )
  parentChildIds.splice(index, 0, node.id)
  const restoredNode = cloneNode(node)
  restoredNode.parentId = parent.id
  const nodes = {
    ...document.nodes,
    [parent.id]: { ...parent, childIds: parentChildIds },
    [restoredNode.id]: restoredNode,
  }
  for (const childId of restoredNode.childIds) {
    const child = getNode(document, childId)
    nodes[child.id] = { ...child, parentId: restoredNode.id }
  }

  const structureOverrides = { ...document.structureOverrides }
  if (snapshot.structureOverride) {
    structureOverrides[restoredNode.id] = snapshot.structureOverride
  }
  const nextDocument: MindMapDocument = {
    ...document,
    nodes,
    structureOverrides,
    relationships: [
      ...document.relationships.map(cloneRelationship),
      ...snapshot.relationships.map(cloneRelationship),
    ],
    boundaries: [
      ...document.boundaries.map(cloneBoundary),
      ...snapshot.boundaries.map(cloneBoundary),
    ],
    summaries: [
      ...document.summaries.map(cloneSummary),
      ...snapshot.summaries.map(cloneSummary),
    ],
    callouts: [
      ...document.callouts.map(cloneCallout),
      ...snapshot.callouts.map(cloneCallout),
    ],
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.deleteNodeKeepChildren,
      label: 'Delete restored topic',
      payload: { nodeId: restoredNode.id },
    },
    [parent.id, restoredNode.id, ...restoredNode.childIds],
  )
}

function executeSetNodeWidth(
  document: MindMapDocument,
  command: SetNodeWidthCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const width = command.payload.width
  if (
    width !== null &&
    (!Number.isFinite(width) || width < 80 || width > 350)
  ) {
    fail('invalid-width', 'Topic width must be between 80 and 350 pixels.', {
      nodeId: node.id,
      width: String(width),
    })
  }

  return executeUpdateNodeStyle(
    document,
    {
      type: mindMapCommandTypes.updateNodeStyle,
      label: command.label,
      payload: {
        nodeId: node.id,
        style: width === null ? {} : { fixedWidth: width },
        ...(width === null ? { resetKeys: ['fixedWidth'] } : {}),
      },
    },
    context,
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

function executeCreateFloatingTopic(
  document: MindMapDocument,
  command: CreateFloatingTopicCommand,
  context: CommandExecutionContext,
): CommandResult {
  const sourceNode = command.payload.node
  assertPlacement(command.payload.placement)
  if (document.nodes[sourceNode.id]) {
    fail('node-id-collision', 'A node with this ID already exists.', {
      nodeId: sourceNode.id,
    })
  }
  if (sourceNode.parentId !== null || sourceNode.childIds.length > 0) {
    fail(
      'invalid-subtree',
      'A new floating topic must be a detached leaf topic.',
      { nodeId: sourceNode.id },
    )
  }

  const node = cloneNode(sourceNode)
  node.text = normalizeCommittedText(node.text, untitledTopicFallback)
  const nextDocument: MindMapDocument = {
    ...document,
    nodes: { ...document.nodes, [node.id]: node },
    floatingTopics: {
      ...document.floatingTopics,
      [node.id]: clonePlacement(command.payload.placement),
    },
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.deleteSubtree,
      label: 'Delete created floating topic',
      payload: { nodeIds: [node.id] },
    },
    [node.id],
  )
}

function executeSetFloatingTopicPlacement(
  document: MindMapDocument,
  command: SetFloatingTopicPlacementCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const previousPlacement = document.floatingTopics[node.id]
  if (!previousPlacement) {
    fail('not-floating-topic', 'The selected topic is not a floating topic.', {
      nodeId: node.id,
    })
  }
  assertPlacement(command.payload.placement)

  return createResult(
    {
      ...document,
      floatingTopics: {
        ...document.floatingTopics,
        [node.id]: clonePlacement(command.payload.placement),
      },
      updatedAt: context.now,
    },
    {
      type: mindMapCommandTypes.setFloatingTopicPlacement,
      label: 'Restore floating topic placement',
      payload: {
        nodeId: node.id,
        placement: clonePlacement(previousPlacement),
      },
    },
    [node.id],
  )
}

function executeConvertToFloatingTopic(
  document: MindMapDocument,
  command: ConvertToFloatingTopicCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  if (node.id === document.rootNodeId) {
    fail('root-protected', 'The main root cannot become a floating topic.', {
      nodeId: node.id,
    })
  }
  if (document.floatingTopics[node.id] || !node.parentId) {
    fail(
      'already-floating-topic',
      'The selected topic is already a floating topic.',
      { nodeId: node.id },
    )
  }
  assertPlacement(command.payload.placement)

  const parent = getNode(document, node.parentId)
  const index = parent.childIds.indexOf(node.id)
  if (index < 0) {
    fail('invalid-command', 'The topic is missing from its parent.', {
      nodeId: node.id,
      parentId: parent.id,
    })
  }
  const nodes = {
    ...document.nodes,
    [parent.id]: {
      ...parent,
      childIds: parent.childIds.filter((childId) => childId !== node.id),
    },
    [node.id]: { ...node, parentId: null },
  }

  return createResult(
    {
      ...document,
      nodes,
      floatingTopics: {
        ...document.floatingTopics,
        [node.id]: clonePlacement(command.payload.placement),
      },
      updatedAt: context.now,
    },
    {
      type: mindMapCommandTypes.attachFloatingTopic,
      label: 'Attach floating topic to tree',
      payload: { nodeId: node.id, parentId: parent.id, index },
    },
    [parent.id, node.id],
  )
}

function executeAttachFloatingTopic(
  document: MindMapDocument,
  command: AttachFloatingTopicCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const placement = document.floatingTopics[node.id]
  if (!placement || node.parentId !== null) {
    fail('not-floating-topic', 'The selected topic is not a floating topic.', {
      nodeId: node.id,
    })
  }
  const parent = getNode(document, command.payload.parentId)
  if (
    parent.id === node.id ||
    getDescendantNodeIds(document, node.id).includes(parent.id)
  ) {
    fail(
      'target-is-descendant',
      'A floating topic cannot be attached below itself or a descendant.',
      { nodeId: node.id, parentId: parent.id },
    )
  }
  assertInsertionIndex(command.payload.index, parent.childIds.length)

  const parentChildIds = [...parent.childIds]
  parentChildIds.splice(command.payload.index, 0, node.id)
  const floatingTopics = { ...document.floatingTopics }
  delete floatingTopics[node.id]
  const nodes = {
    ...document.nodes,
    [parent.id]: { ...parent, childIds: parentChildIds },
    [node.id]: { ...node, parentId: parent.id },
  }

  return createResult(
    {
      ...document,
      nodes,
      floatingTopics,
      updatedAt: context.now,
    },
    {
      type: mindMapCommandTypes.convertToFloatingTopic,
      label: 'Restore floating topic',
      payload: { nodeId: node.id, placement: clonePlacement(placement) },
    },
    [parent.id, node.id],
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
      const placement = document.floatingTopics[node.id]
      if (!placement) {
        fail('root-protected', 'The main root node cannot be deleted.', {
          nodeId: node.id,
        })
      }
      return {
        parentId: null,
        index: Object.keys(document.floatingTopics).indexOf(node.id),
        floatingPlacement: clonePlacement(placement),
        subtree: createSubtreeSnapshot(document, node.id),
      }
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

  for (const parentId of new Set(
    entries.flatMap((entry) => (entry.parentId ? [entry.parentId] : [])),
  )) {
    const parent = getNode(document, parentId)
    nodes[parentId] = {
      ...parent,
      childIds: parent.childIds.filter(
        (childId) => !deletedRootNodeIds.has(childId),
      ),
    }
  }

  const floatingTopics = { ...document.floatingTopics }
  for (const nodeId of deletedNodeIds) delete floatingTopics[nodeId]
  const structureOverrides = { ...document.structureOverrides }
  for (const nodeId of deletedNodeIds) delete structureOverrides[nodeId]

  const labels = { ...document.labels }
  const assets = { ...document.assets }
  const removedLabels: Record<string, MindMapLabel> = {}
  const removedAssets: Record<string, MindMapAssetMetadata> = {}
  const survivingNodes = Object.values(nodes)
  for (const labelId of command.payload.removeLabelIds ?? []) {
    if (survivingNodes.some((node) => node.labelIds.includes(labelId))) continue
    const label = labels[labelId]
    if (!label) continue
    removedLabels[labelId] = cloneLabel(label)
    delete labels[labelId]
  }
  for (const assetId of command.payload.removeAssetIds ?? []) {
    if (
      survivingNodes.some((node) =>
        node.contentBlocks.some(
          (block) => block.type === 'image' && block.assetId === assetId,
        ),
      )
    ) {
      continue
    }
    const asset = assets[assetId]
    if (!asset) continue
    removedAssets[assetId] = cloneAsset(asset)
    delete assets[assetId]
  }

  const nextDocument: MindMapDocument = {
    ...document,
    nodes,
    floatingTopics,
    structureOverrides,
    labels,
    assets,
    relationships: document.relationships
      .filter(
        (relationship) =>
          !deletedNodeIds.has(relationship.fromNodeId) &&
          !deletedNodeIds.has(relationship.toNodeId),
      )
      .map(cloneRelationship),
    boundaries: document.boundaries
      .filter((boundary) =>
        boundary.nodeIds.every((nodeId) => !deletedNodeIds.has(nodeId)),
      )
      .map(cloneBoundary),
    summaries: document.summaries
      .filter((summary) =>
        summary.nodeIds.every((nodeId) => !deletedNodeIds.has(nodeId)),
      )
      .map(cloneSummary),
    callouts: document.callouts
      .filter((callout) => !deletedNodeIds.has(callout.ownerNodeId))
      .map(cloneCallout),
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.restoreSubtree,
      label: 'Restore deleted nodes',
      payload: {
        entries,
        labels: removedLabels,
        assets: removedAssets,
      },
    },
    [
      ...deletedNodeIds,
      ...entries.flatMap((entry) => (entry.parentId ? [entry.parentId] : [])),
    ],
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

  const labels = {
    ...document.labels,
    ...Object.fromEntries(
      Object.entries(command.payload.labels ?? {}).map(([id, label]) => [
        id,
        cloneLabel(label),
      ]),
    ),
  }
  const assets = {
    ...document.assets,
    ...Object.fromEntries(
      Object.entries(command.payload.assets ?? {}).map(([id, asset]) => [
        id,
        cloneAsset(asset),
      ]),
    ),
  }

  for (const [labelId, label] of Object.entries(command.payload.labels ?? {})) {
    const existing = document.labels[labelId]
    if (existing && JSON.stringify(existing) !== JSON.stringify(label)) {
      fail('invalid-subtree', 'Restored label conflicts with this map.', {
        labelId,
      })
    }
  }
  for (const [assetId, asset] of Object.entries(command.payload.assets ?? {})) {
    const existing = document.assets[assetId]
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
      fail('invalid-subtree', 'Restored asset conflicts with this map.', {
        assetId,
      })
    }
  }

  const seenNodeIds = new Set<MindMapNodeId>()
  for (const entry of command.payload.entries) {
    if (entry.parentId) getNode(document, entry.parentId)
    else if (!entry.floatingPlacement) {
      fail(
        'invalid-subtree',
        'A detached restored root requires floating placement.',
      )
    }
    assertDetachedSubtreeSnapshot(entry.subtree, { labels, assets })

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
    if (!entry.parentId) continue
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
      Object.assign(nodes, cloneSubtreeNodesForParent(entry.subtree, parentId))
    }

    nodes[parentId] = { ...parent, childIds }
  }

  let floatingTopics = { ...document.floatingTopics }
  for (const entry of [...command.payload.entries]
    .filter((candidate) => !candidate.parentId)
    .sort((left, right) => left.index - right.index)) {
    const placement = entry.floatingPlacement
    if (!placement) continue
    assertPlacement(placement)
    Object.assign(
      nodes,
      cloneSubtreeNodesForParent(entry.subtree, entry.subtree.rootNodeId),
    )
    nodes[entry.subtree.rootNodeId] = {
      ...nodes[entry.subtree.rootNodeId]!,
      parentId: null,
    }
    const entries = Object.entries(floatingTopics)
    entries.splice(Math.max(0, entry.index), 0, [
      entry.subtree.rootNodeId,
      clonePlacement(placement),
    ])
    floatingTopics = Object.fromEntries(entries)
  }

  const relationships = uniqueRecordsById(
    command.payload.entries.flatMap(
      (entry) => entry.subtree.relationships ?? [],
    ),
  )
  const boundaries = uniqueRecordsById(
    command.payload.entries.flatMap((entry) => entry.subtree.boundaries ?? []),
  )
  const summaries = uniqueRecordsById(
    command.payload.entries.flatMap((entry) => entry.subtree.summaries ?? []),
  )
  const callouts = uniqueRecordsById(
    command.payload.entries.flatMap((entry) => entry.subtree.callouts ?? []),
  )
  assertRecordIdsAvailable(
    document.relationships.map((record) => record.id),
    relationships.map((record) => record.id),
    'relationship',
  )
  assertRecordIdsAvailable(
    document.boundaries.map((record) => record.id),
    boundaries.map((record) => record.id),
    'boundary',
  )
  assertRecordIdsAvailable(
    document.summaries.map((record) => record.id),
    summaries.map((record) => record.id),
    'summary',
  )
  assertRecordIdsAvailable(
    document.callouts.map((record) => record.id),
    callouts.map((record) => record.id),
    'callout',
  )

  const structureOverrides = { ...document.structureOverrides }
  for (const entry of command.payload.entries) {
    Object.assign(structureOverrides, entry.subtree.structureOverrides ?? {})
  }

  const nextDocument: MindMapDocument = {
    ...document,
    nodes,
    floatingTopics,
    structureOverrides,
    labels,
    assets,
    relationships: [
      ...document.relationships.map(cloneRelationship),
      ...relationships.map(cloneRelationship),
    ],
    boundaries: [
      ...document.boundaries.map(cloneBoundary),
      ...boundaries.map(cloneBoundary),
    ],
    summaries: [
      ...document.summaries.map(cloneSummary),
      ...summaries.map(cloneSummary),
    ],
    callouts: [
      ...document.callouts.map(cloneCallout),
      ...callouts.map(cloneCallout),
    ],
    updatedAt: context.now,
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.deleteSubtree,
      label: 'Delete restored nodes',
      payload: {
        nodeIds: command.payload.entries.map(
          (entry) => entry.subtree.rootNodeId,
        ),
        removeLabelIds: Object.keys(command.payload.labels ?? {}),
        removeAssetIds: Object.keys(command.payload.assets ?? {}),
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

  for (const [labelId, label] of Object.entries(
    command.payload.clipboard.labels ?? {},
  )) {
    const existing = document.labels[labelId]
    if (existing && JSON.stringify(existing) !== JSON.stringify(label)) {
      fail('invalid-subtree', 'Clipboard label conflicts with this map.', {
        labelId,
      })
    }
  }
  for (const [assetId, asset] of Object.entries(
    command.payload.clipboard.assets ?? {},
  )) {
    const existing = document.assets[assetId]
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
      fail('invalid-subtree', 'Clipboard asset conflicts with this map.', {
        assetId,
      })
    }
  }

  const addedLabels = Object.fromEntries(
    Object.entries(command.payload.clipboard.labels ?? {}).filter(
      ([labelId]) => !document.labels[labelId],
    ),
  )
  const addedAssets = Object.fromEntries(
    Object.entries(command.payload.clipboard.assets ?? {}).filter(
      ([assetId]) => !document.assets[assetId],
    ),
  )

  return executeRestoreSubtrees(
    document,
    {
      type: mindMapCommandTypes.restoreSubtree,
      label: 'Restore pasted nodes',
      payload: { entries, labels: addedLabels, assets: addedAssets },
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
  const previousOverrides = { ...node.styleOverrides }
  let styleOverrides: MindMapNodeStyleOverride
  if (command.payload.replaceOverrides) {
    styleOverrides = Object.fromEntries(
      Object.entries(command.payload.replaceOverrides).filter(
        (entry) => entry[1] !== undefined,
      ),
    ) as MindMapNodeStyleOverride
  } else {
    styleOverrides = { ...previousOverrides }
    for (const key of command.payload.resetKeys ?? []) {
      if (!mindMapNodeStyleKeys.includes(key)) {
        fail('invalid-style', 'The requested style key is invalid.', {
          key: String(key),
        })
      }
      delete styleOverrides[key]
    }
    for (const [key, value] of Object.entries(command.payload.style)) {
      if (value !== undefined) {
        Object.assign(styleOverrides, { [key]: value })
      }
    }
  }
  if (!isValidMindMapNodeStyleOverride(styleOverrides)) {
    fail('invalid-style', 'The requested topic style is invalid.', {
      nodeId: node.id,
    })
  }
  const nodes = {
    ...document.nodes,
    [node.id]: { ...node, styleOverrides },
  }
  const provisionalDocument = { ...document, nodes }
  const style: MindMapNodeStyle = command.payload.replaceStyle
    ? { ...command.payload.replaceStyle }
    : getComputedMindMapNodeStyle(provisionalDocument, node.id)
  if (!isValidMindMapNodeStyle(style)) {
    fail('invalid-style', 'The computed topic style is invalid.', {
      nodeId: node.id,
    })
  }
  nodes[node.id] = { ...nodes[node.id]!, style }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Restore node style',
      payload: {
        nodeId: node.id,
        style: {},
        replaceOverrides: previousOverrides,
        replaceStyle: { ...node.style },
      },
    },
    [node.id, ...getDescendantNodeIds(document, node.id)],
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

function assertImageContentBlock(
  block: MindMapImageContentBlock,
  asset: MindMapAssetMetadata,
): void {
  if (
    block.id.trim().length === 0 ||
    block.type !== 'image' ||
    block.assetId !== asset.id ||
    asset.kind !== 'image' ||
    !Number.isFinite(block.width) ||
    block.width <= 0 ||
    block.width > 4096 ||
    (block.height !== undefined &&
      (!Number.isFinite(block.height) ||
        block.height <= 0 ||
        block.height > 4096)) ||
    typeof block.altText !== 'string' ||
    typeof block.preserveAspectRatio !== 'boolean'
  ) {
    fail('invalid-content-block', 'The image content block is invalid.', {
      blockId: block.id,
    })
  }
}

function getImageContentBlock(
  node: MindMapNode,
  blockId: string,
): { readonly block: MindMapImageContentBlock; readonly index: number } {
  const index = node.contentBlocks.findIndex((block) => block.id === blockId)
  const block = node.contentBlocks[index]
  if (!block || block.type !== 'image') {
    fail('missing-content-block', 'The image content block was not found.', {
      nodeId: node.id,
      blockId,
    })
  }
  return { block, index }
}

function executeCreateImageContentBlock(
  document: MindMapDocument,
  command: CreateImageContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const block = { ...command.payload.block }
  const asset = cloneAsset(command.payload.asset)
  assertImageContentBlock(block, asset)
  if (node.contentBlocks.some((candidate) => candidate.id === block.id)) {
    fail('invalid-content-block', 'A content block ID already exists.', {
      nodeId: node.id,
      blockId: block.id,
    })
  }
  const existingAsset = document.assets[asset.id]
  if (
    existingAsset &&
    JSON.stringify(existingAsset) !== JSON.stringify(asset)
  ) {
    fail('invalid-asset', 'The image asset metadata conflicts with this map.', {
      assetId: asset.id,
    })
  }
  const contentBlocks = node.contentBlocks.map((candidate) => ({
    ...candidate,
  }))
  const index = command.payload.index ?? contentBlocks.length
  assertInsertionIndex(index, contentBlocks.length)
  contentBlocks.splice(index, 0, block)
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }
  const nextDocument = {
    ...updateDocument(document, nodes, context),
    assets: { ...document.assets, [asset.id]: asset },
  }

  return createResult(
    nextDocument,
    {
      type: mindMapCommandTypes.deleteImageContentBlock,
      label: 'Delete image',
      payload: { nodeId: node.id, blockId: block.id },
    },
    [node.id],
  )
}

function executeUpdateImageContentBlock(
  document: MindMapDocument,
  command: UpdateImageContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const { block, index } = getImageContentBlock(node, command.payload.blockId)
  const nextBlock: MindMapImageContentBlock = {
    ...block,
    ...command.payload.changes,
  }
  const asset = document.assets[block.assetId]
  if (!asset) {
    fail('invalid-asset', 'The image asset metadata was not found.', {
      assetId: block.assetId,
    })
  }
  assertImageContentBlock(nextBlock, asset)
  const contentBlocks = node.contentBlocks.map((candidate) => ({
    ...candidate,
  }))
  contentBlocks[index] = nextBlock
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateImageContentBlock,
      label: 'Restore image settings',
      payload: {
        nodeId: node.id,
        blockId: block.id,
        changes: {
          width: block.width,
          height: block.height,
          altText: block.altText,
          preserveAspectRatio: block.preserveAspectRatio,
        },
      },
    },
    [node.id],
  )
}

function executeDeleteImageContentBlock(
  document: MindMapDocument,
  command: DeleteImageContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const { block, index } = getImageContentBlock(node, command.payload.blockId)
  const asset = document.assets[block.assetId]
  if (!asset) {
    fail('invalid-asset', 'The image asset metadata was not found.', {
      assetId: block.assetId,
    })
  }
  const contentBlocks = node.contentBlocks
    .filter((candidate) => candidate.id !== block.id)
    .map((candidate) => ({ ...candidate }))
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.createImageContentBlock,
      label: 'Restore image',
      payload: {
        nodeId: node.id,
        block: { ...block },
        asset: cloneAsset(asset),
        index,
      },
    },
    [node.id],
  )
}

function assertEquationContentBlock(block: MindMapEquationContentBlock): void {
  if (
    block.id.trim().length === 0 ||
    block.type !== 'equation' ||
    block.displayMode !== 'block' ||
    block.source.trim().length === 0 ||
    block.source.length > maximumEquationSourceLength ||
    (block.width !== undefined &&
      (!Number.isFinite(block.width) ||
        block.width <= 0 ||
        block.width > maximumEquationDimension)) ||
    (block.height !== undefined &&
      (!Number.isFinite(block.height) ||
        block.height <= 0 ||
        block.height > maximumEquationDimension))
  ) {
    fail('invalid-content-block', 'The equation content block is invalid.', {
      blockId: block.id,
    })
  }
}

function getEquationContentBlock(
  node: MindMapNode,
  blockId: string,
): { readonly block: MindMapEquationContentBlock; readonly index: number } {
  const index = node.contentBlocks.findIndex((block) => block.id === blockId)
  const block = node.contentBlocks[index]
  if (!block || block.type !== 'equation') {
    fail('missing-content-block', 'The equation content block was not found.', {
      nodeId: node.id,
      blockId,
    })
  }
  return { block, index }
}

function executeCreateEquationContentBlock(
  document: MindMapDocument,
  command: CreateEquationContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const block = { ...command.payload.block }
  assertEquationContentBlock(block)
  if (node.contentBlocks.some((candidate) => candidate.id === block.id)) {
    fail('invalid-content-block', 'A content block ID already exists.', {
      nodeId: node.id,
      blockId: block.id,
    })
  }
  const contentBlocks = node.contentBlocks.map((candidate) => ({
    ...candidate,
  }))
  const index = command.payload.index ?? contentBlocks.length
  assertInsertionIndex(index, contentBlocks.length)
  contentBlocks.splice(index, 0, block)
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.deleteEquationContentBlock,
      label: 'Delete equation',
      payload: { nodeId: node.id, blockId: block.id },
    },
    [node.id],
  )
}

function executeUpdateEquationContentBlock(
  document: MindMapDocument,
  command: UpdateEquationContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const { block, index } = getEquationContentBlock(
    node,
    command.payload.blockId,
  )
  const nextBlock: MindMapEquationContentBlock = {
    ...block,
    ...command.payload.changes,
  }
  assertEquationContentBlock(nextBlock)
  const contentBlocks = node.contentBlocks.map((candidate) => ({
    ...candidate,
  }))
  contentBlocks[index] = nextBlock
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.updateEquationContentBlock,
      label: 'Restore equation',
      payload: {
        nodeId: node.id,
        blockId: block.id,
        changes: {
          source: block.source,
          displayMode: block.displayMode,
          width: block.width,
          height: block.height,
        },
      },
    },
    [node.id],
  )
}

function executeDeleteEquationContentBlock(
  document: MindMapDocument,
  command: DeleteEquationContentBlockCommand,
  context: CommandExecutionContext,
): CommandResult {
  const node = getNode(document, command.payload.nodeId)
  const { block, index } = getEquationContentBlock(
    node,
    command.payload.blockId,
  )
  const contentBlocks = node.contentBlocks
    .filter((candidate) => candidate.id !== block.id)
    .map((candidate) => ({ ...candidate }))
  const nodes = { ...document.nodes, [node.id]: { ...node, contentBlocks } }

  return createResult(
    updateDocument(document, nodes, context),
    {
      type: mindMapCommandTypes.createEquationContentBlock,
      label: 'Restore equation',
      payload: { nodeId: node.id, block: { ...block }, index },
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

function executeCreateRelationship(
  document: MindMapDocument,
  command: CreateRelationshipCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (
    document.relationships.some(
      (relationship) => relationship.id === command.payload.relationship.id,
    )
  ) {
    fail('invalid-enhancement', 'The relationship ID already exists.')
  }
  const relationship = cloneRelationship(command.payload.relationship)
  const relationships = [
    ...document.relationships.map(cloneRelationship),
    relationship,
  ]
  assertRelationshipRecords(document, relationships)
  return createResult(
    updateEnhancementRecords(document, { relationships }, context),
    {
      type: mindMapCommandTypes.deleteRelationship,
      label: 'Delete relationship',
      payload: { relationshipId: relationship.id },
    },
    [relationship.fromNodeId, relationship.toNodeId],
  )
}

function executeUpdateRelationship(
  document: MindMapDocument,
  command: UpdateRelationshipCommand,
  context: CommandExecutionContext,
): CommandResult {
  const relationship = document.relationships.find(
    (candidate) => candidate.id === command.payload.relationshipId,
  )
  if (!relationship) fail('invalid-enhancement', 'Relationship not found.')
  const { changes } = command.payload
  const hasValidControlPoints = changes.controlPoints?.every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  )
  const nextRelationship: MindMapRelationship = {
    ...relationship,
    ...(changes.label !== undefined ? { label: changes.label } : {}),
    ...(changes.style
      ? { style: { ...relationship.style, ...changes.style } }
      : {}),
    ...(changes.controlPoints
      ? {
          controlPoints: hasValidControlPoints
            ? changes.controlPoints.map((point) => ({ ...point }))
            : [],
        }
      : {}),
  }
  const relationships = document.relationships.map((candidate) =>
    candidate.id === relationship.id
      ? nextRelationship
      : cloneRelationship(candidate),
  )
  assertRelationshipRecords(document, relationships)
  return createResult(
    updateEnhancementRecords(document, { relationships }, context),
    {
      type: mindMapCommandTypes.updateRelationship,
      label: 'Restore relationship',
      payload: {
        relationshipId: relationship.id,
        changes: {
          ...(changes.label !== undefined ? { label: relationship.label } : {}),
          ...(changes.style ? { style: { ...relationship.style } } : {}),
          ...(changes.controlPoints
            ? {
                controlPoints: relationship.controlPoints.map((point) => ({
                  ...point,
                })),
              }
            : {}),
        },
      },
    },
    [relationship.fromNodeId, relationship.toNodeId],
  )
}

function executeDeleteRelationship(
  document: MindMapDocument,
  command: DeleteRelationshipCommand,
  context: CommandExecutionContext,
): CommandResult {
  const relationship = document.relationships.find(
    (candidate) => candidate.id === command.payload.relationshipId,
  )
  if (!relationship) fail('invalid-enhancement', 'Relationship not found.')
  return createResult(
    updateEnhancementRecords(
      document,
      {
        relationships: document.relationships
          .filter((candidate) => candidate.id !== relationship.id)
          .map(cloneRelationship),
      },
      context,
    ),
    {
      type: mindMapCommandTypes.createRelationship,
      label: 'Restore relationship',
      payload: { relationship: cloneRelationship(relationship) },
    },
    [relationship.fromNodeId, relationship.toNodeId],
  )
}

function executeCreateBoundary(
  document: MindMapDocument,
  command: CreateBoundaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (
    document.boundaries.some(
      (boundary) => boundary.id === command.payload.boundary.id,
    )
  ) {
    fail('invalid-enhancement', 'The boundary ID already exists.')
  }
  const boundary = cloneBoundary(command.payload.boundary)
  const boundaries = [...document.boundaries.map(cloneBoundary), boundary]
  assertGroupingRecords(document, boundaries, 'boundary')
  return createResult(
    updateEnhancementRecords(document, { boundaries }, context),
    {
      type: mindMapCommandTypes.deleteBoundary,
      label: 'Delete boundary',
      payload: { boundaryId: boundary.id },
    },
    boundary.nodeIds,
  )
}

function executeUpdateBoundary(
  document: MindMapDocument,
  command: UpdateBoundaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  const boundary = document.boundaries.find(
    (candidate) => candidate.id === command.payload.boundaryId,
  )
  if (!boundary) fail('invalid-enhancement', 'Boundary not found.')
  const { changes } = command.payload
  const nextBoundary: MindMapBoundary = {
    ...boundary,
    ...(changes.label !== undefined ? { label: changes.label } : {}),
    ...(changes.style
      ? { style: { ...boundary.style, ...changes.style } }
      : {}),
  }
  const boundaries = document.boundaries.map((candidate) =>
    candidate.id === boundary.id ? nextBoundary : cloneBoundary(candidate),
  )
  assertGroupingRecords(document, boundaries, 'boundary')
  return createResult(
    updateEnhancementRecords(document, { boundaries }, context),
    {
      type: mindMapCommandTypes.updateBoundary,
      label: 'Restore boundary',
      payload: {
        boundaryId: boundary.id,
        changes: {
          ...(changes.label !== undefined ? { label: boundary.label } : {}),
          ...(changes.style ? { style: { ...boundary.style } } : {}),
        },
      },
    },
    boundary.nodeIds,
  )
}

function executeDeleteBoundary(
  document: MindMapDocument,
  command: DeleteBoundaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  const boundary = document.boundaries.find(
    (candidate) => candidate.id === command.payload.boundaryId,
  )
  if (!boundary) fail('invalid-enhancement', 'Boundary not found.')
  return createResult(
    updateEnhancementRecords(
      document,
      {
        boundaries: document.boundaries
          .filter((candidate) => candidate.id !== boundary.id)
          .map(cloneBoundary),
      },
      context,
    ),
    {
      type: mindMapCommandTypes.createBoundary,
      label: 'Restore boundary',
      payload: { boundary: cloneBoundary(boundary) },
    },
    boundary.nodeIds,
  )
}

function executeCreateSummary(
  document: MindMapDocument,
  command: CreateSummaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  if (
    document.summaries.some(
      (summary) => summary.id === command.payload.summary.id,
    )
  ) {
    fail('invalid-enhancement', 'The summary ID already exists.')
  }
  const summary = cloneSummary(command.payload.summary)
  const summaries = [...document.summaries.map(cloneSummary), summary]
  assertGroupingRecords(document, summaries, 'summary')
  return createResult(
    updateEnhancementRecords(document, { summaries }, context),
    {
      type: mindMapCommandTypes.deleteSummary,
      label: 'Delete summary',
      payload: { summaryId: summary.id },
    },
    summary.nodeIds,
  )
}

function executeUpdateSummary(
  document: MindMapDocument,
  command: UpdateSummaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  const summary = document.summaries.find(
    (candidate) => candidate.id === command.payload.summaryId,
  )
  if (!summary) fail('invalid-enhancement', 'Summary not found.')
  const { changes } = command.payload
  const nextSummary: MindMapSummary = {
    ...summary,
    ...(changes.label !== undefined ? { label: changes.label } : {}),
    ...(changes.style ? { style: { ...summary.style, ...changes.style } } : {}),
  }
  const summaries = document.summaries.map((candidate) =>
    candidate.id === summary.id ? nextSummary : cloneSummary(candidate),
  )
  assertGroupingRecords(document, summaries, 'summary')
  return createResult(
    updateEnhancementRecords(document, { summaries }, context),
    {
      type: mindMapCommandTypes.updateSummary,
      label: 'Restore summary',
      payload: {
        summaryId: summary.id,
        changes: {
          ...(changes.label !== undefined ? { label: summary.label } : {}),
          ...(changes.style ? { style: { ...summary.style } } : {}),
        },
      },
    },
    summary.nodeIds,
  )
}

function executeDeleteSummary(
  document: MindMapDocument,
  command: DeleteSummaryCommand,
  context: CommandExecutionContext,
): CommandResult {
  const summary = document.summaries.find(
    (candidate) => candidate.id === command.payload.summaryId,
  )
  if (!summary) fail('invalid-enhancement', 'Summary not found.')
  return createResult(
    updateEnhancementRecords(
      document,
      {
        summaries: document.summaries
          .filter((candidate) => candidate.id !== summary.id)
          .map(cloneSummary),
      },
      context,
    ),
    {
      type: mindMapCommandTypes.createSummary,
      label: 'Restore summary',
      payload: { summary: cloneSummary(summary) },
    },
    summary.nodeIds,
  )
}

function executeCreateCallout(
  document: MindMapDocument,
  command: CreateCalloutCommand,
  context: CommandExecutionContext,
): CommandResult {
  const callout = cloneCallout(command.payload.callout)
  if (
    !document.nodes[callout.ownerNodeId] ||
    document.callouts.some(
      (candidate) =>
        candidate.id === callout.id ||
        candidate.ownerNodeId === callout.ownerNodeId,
    )
  ) {
    fail(
      'invalid-enhancement',
      'A topic can own at most one uniquely identified callout.',
    )
  }
  return createResult(
    updateEnhancementRecords(
      document,
      { callouts: [...document.callouts.map(cloneCallout), callout] },
      context,
    ),
    {
      type: mindMapCommandTypes.deleteCallout,
      label: 'Delete callout',
      payload: { calloutId: callout.id },
    },
    [callout.ownerNodeId],
  )
}

function executeUpdateCallout(
  document: MindMapDocument,
  command: UpdateCalloutCommand,
  context: CommandExecutionContext,
): CommandResult {
  const callout = document.callouts.find(
    (candidate) => candidate.id === command.payload.calloutId,
  )
  if (!callout) fail('invalid-enhancement', 'Callout not found.')
  const { changes } = command.payload
  const offset = changes.offset
  const nextCallout: MindMapCallout = {
    ...callout,
    ...(changes.text !== undefined ? { text: changes.text } : {}),
    ...(changes.placement !== undefined
      ? { placement: changes.placement }
      : {}),
    ...(offset
      ? {
          offset:
            Number.isFinite(offset.x) && Number.isFinite(offset.y)
              ? { ...offset }
              : { x: 0, y: 0 },
        }
      : {}),
    ...(changes.style ? { style: { ...callout.style, ...changes.style } } : {}),
  }
  return createResult(
    updateEnhancementRecords(
      document,
      {
        callouts: document.callouts.map((candidate) =>
          candidate.id === callout.id ? nextCallout : cloneCallout(candidate),
        ),
      },
      context,
    ),
    {
      type: mindMapCommandTypes.updateCallout,
      label: 'Restore callout',
      payload: {
        calloutId: callout.id,
        changes: {
          ...(changes.text !== undefined ? { text: callout.text } : {}),
          ...(changes.placement !== undefined
            ? { placement: callout.placement }
            : {}),
          ...(changes.offset ? { offset: { ...callout.offset } } : {}),
          ...(changes.style ? { style: { ...callout.style } } : {}),
        },
      },
    },
    [callout.ownerNodeId],
  )
}

function executeDeleteCallout(
  document: MindMapDocument,
  command: DeleteCalloutCommand,
  context: CommandExecutionContext,
): CommandResult {
  const callout = document.callouts.find(
    (candidate) => candidate.id === command.payload.calloutId,
  )
  if (!callout) fail('invalid-enhancement', 'Callout not found.')
  return createResult(
    updateEnhancementRecords(
      document,
      {
        callouts: document.callouts
          .filter((candidate) => candidate.id !== callout.id)
          .map(cloneCallout),
      },
      context,
    ),
    {
      type: mindMapCommandTypes.createCallout,
      label: 'Restore callout',
      payload: { callout: cloneCallout(callout) },
    },
    [callout.ownerNodeId],
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
    case mindMapCommandTypes.setDefaultStructure:
      return executeSetDefaultStructure(document, command, context)
    case mindMapCommandTypes.updateTheme:
      return executeUpdateTheme(document, command, context)
    case mindMapCommandTypes.createNode:
      return executeCreateNode(document, command, context)
    case mindMapCommandTypes.insertParent:
      return executeInsertParentNode(document, command, context)
    case mindMapCommandTypes.deleteNodeKeepChildren:
      return executeDeleteNodeKeepChildren(document, command, context)
    case mindMapCommandTypes.restoreDeletedNode:
      return executeRestoreDeletedNode(document, command, context)
    case mindMapCommandTypes.updateNodeText:
      return executeUpdateNodeText(document, command, context)
    case mindMapCommandTypes.setNodeWidth:
      return executeSetNodeWidth(document, command, context)
    case mindMapCommandTypes.updateNodeStyle:
      return executeUpdateNodeStyle(document, command, context)
    case mindMapCommandTypes.updateNodeMarkers:
      return executeUpdateNodeMarkers(document, command, context)
    case mindMapCommandTypes.updateNodeNotes:
      return executeUpdateNodeNotes(document, command, context)
    case mindMapCommandTypes.updateNodeLinks:
      return executeUpdateNodeLinks(document, command, context)
    case mindMapCommandTypes.createImageContentBlock:
      return executeCreateImageContentBlock(document, command, context)
    case mindMapCommandTypes.updateImageContentBlock:
      return executeUpdateImageContentBlock(document, command, context)
    case mindMapCommandTypes.deleteImageContentBlock:
      return executeDeleteImageContentBlock(document, command, context)
    case mindMapCommandTypes.createEquationContentBlock:
      return executeCreateEquationContentBlock(document, command, context)
    case mindMapCommandTypes.updateEquationContentBlock:
      return executeUpdateEquationContentBlock(document, command, context)
    case mindMapCommandTypes.deleteEquationContentBlock:
      return executeDeleteEquationContentBlock(document, command, context)
    case mindMapCommandTypes.setNodeCollapse:
      return executeSetNodeCollapse(document, command, context)
    case mindMapCommandTypes.setNodeStructure:
      return executeSetNodeStructure(document, command, context)
    case mindMapCommandTypes.upsertLabel:
      return executeUpsertLabel(document, command, context)
    case mindMapCommandTypes.deleteLabel:
      return executeDeleteLabel(document, command, context)
    case mindMapCommandTypes.restoreLabel:
      return executeRestoreLabel(document, command, context)
    case mindMapCommandTypes.setNodeLabels:
      return executeSetNodeLabels(document, command, context)
    case mindMapCommandTypes.setNodeNumbering:
      return executeSetNodeNumbering(document, command, context)
    case mindMapCommandTypes.updateRelationships:
      return executeUpdateRelationships(document, command, context)
    case mindMapCommandTypes.updateBoundaries:
      return executeUpdateBoundaries(document, command, context)
    case mindMapCommandTypes.updateSummaries:
      return executeUpdateSummaries(document, command, context)
    case mindMapCommandTypes.createRelationship:
      return executeCreateRelationship(document, command, context)
    case mindMapCommandTypes.updateRelationship:
      return executeUpdateRelationship(document, command, context)
    case mindMapCommandTypes.deleteRelationship:
      return executeDeleteRelationship(document, command, context)
    case mindMapCommandTypes.createBoundary:
      return executeCreateBoundary(document, command, context)
    case mindMapCommandTypes.updateBoundary:
      return executeUpdateBoundary(document, command, context)
    case mindMapCommandTypes.deleteBoundary:
      return executeDeleteBoundary(document, command, context)
    case mindMapCommandTypes.createSummary:
      return executeCreateSummary(document, command, context)
    case mindMapCommandTypes.updateSummary:
      return executeUpdateSummary(document, command, context)
    case mindMapCommandTypes.deleteSummary:
      return executeDeleteSummary(document, command, context)
    case mindMapCommandTypes.createCallout:
      return executeCreateCallout(document, command, context)
    case mindMapCommandTypes.updateCallout:
      return executeUpdateCallout(document, command, context)
    case mindMapCommandTypes.deleteCallout:
      return executeDeleteCallout(document, command, context)
    case mindMapCommandTypes.tidyLayout:
      return executeTidyLayout(document, command, context)
    case mindMapCommandTypes.moveNode:
      return executeMoveNode(document, command, context)
    case mindMapCommandTypes.createFloatingTopic:
      return executeCreateFloatingTopic(document, command, context)
    case mindMapCommandTypes.setFloatingTopicPlacement:
      return executeSetFloatingTopicPlacement(document, command, context)
    case mindMapCommandTypes.convertToFloatingTopic:
      return executeConvertToFloatingTopic(document, command, context)
    case mindMapCommandTypes.attachFloatingTopic:
      return executeAttachFloatingTopic(document, command, context)
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
