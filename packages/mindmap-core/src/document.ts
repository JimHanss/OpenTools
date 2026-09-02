import type {
  CreateMindMapDocumentInput,
  CreateMindMapBoundaryInput,
  CreateMindMapCalloutInput,
  CreateMindMapNodeInput,
  CreateMindMapRelationshipInput,
  CreateMindMapSummaryInput,
  MindMapAssetMetadata,
  MindMapBoundary,
  MindMapBoundaryStyle,
  MindMapCallout,
  MindMapCalloutStyle,
  MindMapContentBlock,
  MindMapDocument,
  MindMapLabel,
  MindMapLink,
  MindMapNode,
  MindMapNodeMarker,
  MindMapNodeStyle,
  MindMapRelationship,
  MindMapRelationshipStyle,
  MindMapSummary,
  MindMapSummaryStyle,
  MindMapTheme,
} from './model'

export const defaultMindMapNodeStyle: MindMapNodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#7c6ff2',
  textColor: '#1e1b4b',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 14,
  fontWeight: 'semibold',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'left',
  shape: 'rounded-rectangle',
  borderWidth: 1,
  borderStyle: 'solid',
  branchColor: '#8b83dc',
  branchWidth: 2,
  branchStyle: 'solid',
  branchShape: 'curve',
}

export const defaultMindMapRelationshipStyle: MindMapRelationshipStyle = {
  color: '#8b83dc',
  width: 2,
  pattern: 'solid',
  shape: 'curve',
  startMarker: 'none',
  endMarker: 'arrow',
  labelColor: '#4b476b',
  labelFontSize: 12,
}

export const defaultMindMapBoundaryStyle: MindMapBoundaryStyle = {
  shape: 'rounded-rectangle',
  fillColor: '#ede9fe',
  fillOpacity: 0.35,
  borderColor: '#8b5cf6',
  borderWidth: 1,
  borderStyle: 'dashed',
  textColor: '#4c1d95',
}

export const defaultMindMapSummaryStyle: MindMapSummaryStyle = {
  shape: 'bracket',
  color: '#8b5cf6',
  width: 2,
  pattern: 'solid',
  textColor: '#4c1d95',
}

export const defaultMindMapCalloutStyle: MindMapCalloutStyle = {
  shape: 'rounded-rectangle',
  backgroundColor: '#fff7ed',
  borderColor: '#fb923c',
  borderWidth: 1,
  textColor: '#7c2d12',
  fontSize: 12,
}

export const defaultMindMapTheme: MindMapTheme = {
  id: 'classic',
  backgroundColor: '#ffffff',
  defaultFontFamily: 'Inter, system-ui, sans-serif',
  rootTopicStyle: {
    backgroundColor: '#5b4fd6',
    borderColor: '#4c40c5',
    textColor: '#ffffff',
    fontSize: 18,
  },
  mainTopicStyle: {
    backgroundColor: '#ffffff',
    borderColor: '#7c6ff2',
    textColor: '#1e1b4b',
    fontSize: 15,
  },
  subtopicStyle: {},
}

function cloneMarker(marker: MindMapNodeMarker): MindMapNodeMarker {
  return { ...marker }
}

function cloneLink(link: MindMapLink): MindMapLink {
  return { ...link }
}

function cloneContentBlock(block: MindMapContentBlock): MindMapContentBlock {
  return { ...block }
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

function cloneTheme(theme: MindMapTheme): MindMapTheme {
  return {
    ...theme,
    rootTopicStyle: { ...theme.rootTopicStyle },
    mainTopicStyle: { ...theme.mainTopicStyle },
    subtopicStyle: { ...theme.subtopicStyle },
  }
}

function mergeNodeStyle(
  style: CreateMindMapNodeInput['style'],
): MindMapNodeStyle {
  const definedStyle = Object.fromEntries(
    Object.entries(style ?? {}).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
  return { ...defaultMindMapNodeStyle, ...definedStyle }
}

function normalizeNodeStyleOverrides(
  style: CreateMindMapNodeInput['style'],
): Partial<MindMapNodeStyle> {
  return Object.fromEntries(
    Object.entries(style ?? {}).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
}

export function createMindMapDocument(
  input: CreateMindMapDocumentInput,
): MindMapDocument {
  const rootNode = createMindMapNode({
    id: input.rootNodeId,
    parentId: null,
    text: input.title,
  })

  return {
    schemaVersion: 3,
    id: input.id,
    title: input.title,
    rootNodeId: rootNode.id,
    nodes: { [rootNode.id]: rootNode },
    floatingTopics: {},
    defaultStructure: 'logic-right',
    structureOverrides: {},
    labels: {},
    assets: {},
    theme: cloneTheme(defaultMindMapTheme),
    relationships: [],
    boundaries: [],
    summaries: [],
    callouts: [],
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function createMindMapNode(input: CreateMindMapNodeInput): MindMapNode {
  const styleOverrides = normalizeNodeStyleOverrides(input.style)
  return {
    id: input.id,
    parentId: input.parentId,
    childIds: [...(input.childIds ?? [])],
    text: input.text,
    collapsed: input.collapsed ?? false,
    markers: (input.markers ?? []).map(cloneMarker),
    notes: input.notes ?? '',
    links: (input.links ?? []).map(cloneLink),
    labelIds: [...(input.labelIds ?? [])],
    labelSortMode: input.labelSortMode ?? 'manual',
    ...(input.numbering ? { numbering: { ...input.numbering } } : {}),
    contentBlocks: (input.contentBlocks ?? []).map(cloneContentBlock),
    styleOverrides,
    style: mergeNodeStyle(styleOverrides),
  }
}

export function createMindMapRelationship(
  input: CreateMindMapRelationshipInput,
): MindMapRelationship {
  return {
    id: input.id,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    label: input.label ?? '',
    style: { ...defaultMindMapRelationshipStyle, ...input.style },
    controlPoints: (input.controlPoints ?? []).map((point) => ({ ...point })),
  }
}

export function createMindMapBoundary(
  input: CreateMindMapBoundaryInput,
): MindMapBoundary {
  return {
    id: input.id,
    nodeIds: [...input.nodeIds],
    label: input.label ?? '',
    style: { ...defaultMindMapBoundaryStyle, ...input.style },
  }
}

export function createMindMapSummary(
  input: CreateMindMapSummaryInput,
): MindMapSummary {
  return {
    id: input.id,
    nodeIds: [...input.nodeIds],
    label: input.label ?? '',
    style: { ...defaultMindMapSummaryStyle, ...input.style },
  }
}

export function createMindMapCallout(
  input: CreateMindMapCalloutInput,
): MindMapCallout {
  return {
    id: input.id,
    ownerNodeId: input.ownerNodeId,
    text: input.text ?? '',
    placement: input.placement ?? 'right',
    offset: { x: input.offset?.x ?? 0, y: input.offset?.y ?? 0 },
    style: { ...defaultMindMapCalloutStyle, ...input.style },
  }
}

export function cloneMindMapDocument(
  document: MindMapDocument,
): MindMapDocument {
  return {
    ...document,
    nodes: Object.fromEntries(
      Object.entries(document.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          ...node,
          childIds: [...node.childIds],
          markers: node.markers.map(cloneMarker),
          links: node.links.map(cloneLink),
          labelIds: [...node.labelIds],
          ...(node.numbering ? { numbering: { ...node.numbering } } : {}),
          contentBlocks: node.contentBlocks.map(cloneContentBlock),
          styleOverrides: { ...node.styleOverrides },
          style: { ...node.style },
        },
      ]),
    ),
    floatingTopics: Object.fromEntries(
      Object.entries(document.floatingTopics).map(([nodeId, placement]) => [
        nodeId,
        { ...placement },
      ]),
    ),
    structureOverrides: { ...document.structureOverrides },
    labels: Object.fromEntries(
      Object.entries(document.labels).map(([labelId, label]) => [
        labelId,
        cloneLabel(label),
      ]),
    ),
    assets: Object.fromEntries(
      Object.entries(document.assets).map(([assetId, asset]) => [
        assetId,
        cloneAsset(asset),
      ]),
    ),
    theme: cloneTheme(document.theme),
    relationships: document.relationships.map(cloneRelationship),
    boundaries: document.boundaries.map(cloneBoundary),
    summaries: document.summaries.map(cloneSummary),
    callouts: document.callouts.map(cloneCallout),
  }
}
