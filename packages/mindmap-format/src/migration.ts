import {
  defaultMindMapBoundaryStyle,
  defaultMindMapCalloutStyle,
  defaultMindMapNodeStyle,
  defaultMindMapRelationshipStyle,
  defaultMindMapSummaryStyle,
  defaultMindMapTheme,
  type MindMapBoundary,
  type MindMapCallout,
  type MindMapContentBlock,
  type MindMapDocument,
  type MindMapNode,
  type MindMapNodeMarker,
  type MindMapNodeStyle,
  type MindMapRelationship,
  type MindMapSummary,
} from '@opentools/mindmap-core'

import type {
  MindMapDocumentV1Input,
  MindMapDocumentV2Input,
  MindMapDocumentV3Input,
} from './schema'

function migrateLegacyMarker(marker: string): MindMapNodeMarker {
  const match = /^(priority|status|icon):(.+)$/u.exec(marker)
  if (match?.[1] && match[2]) {
    return {
      kind: match[1] as MindMapNodeMarker['kind'],
      value: match[2],
    }
  }

  return { kind: 'icon', value: marker }
}

function toV3Style(
  style:
    | MindMapDocumentV1Input['nodes'][string]['style']
    | MindMapDocumentV2Input['nodes'][string]['style']
    | MindMapDocumentV3Input['nodes'][string]['style'],
): MindMapNodeStyle {
  const definedStyle = Object.fromEntries(
    Object.entries(style).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
  return { ...defaultMindMapNodeStyle, ...definedStyle }
}

function toV3StyleOverrides(
  style:
    | MindMapDocumentV1Input['nodes'][string]['style']
    | MindMapDocumentV2Input['nodes'][string]['style']
    | MindMapDocumentV3Input['nodes'][string]['style'],
): Partial<MindMapNodeStyle> {
  return Object.fromEntries(
    Object.entries(style).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
}

function cloneContentBlock(block: MindMapContentBlock): MindMapContentBlock {
  return { ...block }
}

function toV2Node(node: MindMapDocumentV2Input['nodes'][string]): MindMapNode {
  return {
    id: node.id,
    parentId: node.parentId,
    childIds: [...node.childIds],
    text: node.text,
    collapsed: node.collapsed,
    markers: node.markers.map((marker) => ({ ...marker })),
    notes: node.notes,
    links: node.links.map((link) => ({ ...link })),
    labelIds: [],
    labelSortMode: 'manual',
    contentBlocks: [],
    styleOverrides: toV3StyleOverrides(node.style),
    style: toV3Style(node.style),
  }
}

function toV3Node(node: MindMapDocumentV3Input['nodes'][string]): MindMapNode {
  return {
    id: node.id,
    parentId: node.parentId,
    childIds: [...node.childIds],
    text: node.text,
    collapsed: node.collapsed,
    markers: node.markers.map((marker) => ({ ...marker })),
    notes: node.notes,
    links: node.links.map((link) => ({ ...link })),
    labelIds: [...node.labelIds],
    labelSortMode: node.labelSortMode,
    ...(node.numbering ? { numbering: { ...node.numbering } } : {}),
    contentBlocks: node.contentBlocks.map(cloneContentBlock),
    styleOverrides: node.styleOverrides
      ? { ...node.styleOverrides }
      : toV3StyleOverrides(node.style),
    style: toV3Style(node.style),
  }
}

function migrateV2Relationship(
  relationship: MindMapDocumentV2Input['relationships'][number],
): MindMapRelationship {
  return {
    ...relationship,
    style: { ...defaultMindMapRelationshipStyle },
    controlPoints: [],
  }
}

function migrateV2Boundary(
  boundary: MindMapDocumentV2Input['boundaries'][number],
): MindMapBoundary {
  return {
    ...boundary,
    nodeIds: [...boundary.nodeIds],
    style: { ...defaultMindMapBoundaryStyle },
  }
}

function migrateV2Summary(
  summary: MindMapDocumentV2Input['summaries'][number],
): MindMapSummary {
  return {
    ...summary,
    nodeIds: [...summary.nodeIds],
    style: { ...defaultMindMapSummaryStyle },
  }
}

function cloneV3Relationship(
  relationship: MindMapDocumentV3Input['relationships'][number],
): MindMapRelationship {
  return {
    ...relationship,
    style: { ...relationship.style },
    controlPoints: relationship.controlPoints.map((point) => ({ ...point })),
  }
}

function cloneV3Boundary(
  boundary: MindMapDocumentV3Input['boundaries'][number],
): MindMapBoundary {
  return {
    ...boundary,
    nodeIds: [...boundary.nodeIds],
    style: { ...boundary.style },
  }
}

function cloneV3Summary(
  summary: MindMapDocumentV3Input['summaries'][number],
): MindMapSummary {
  return {
    ...summary,
    nodeIds: [...summary.nodeIds],
    style: { ...summary.style },
  }
}

function cloneV3Callout(
  callout: MindMapDocumentV3Input['callouts'][number],
): MindMapCallout {
  return {
    ...callout,
    offset: { ...callout.offset },
    style: { ...defaultMindMapCalloutStyle, ...callout.style },
  }
}

export function migrateV2Document(
  input: MindMapDocumentV2Input,
): MindMapDocument {
  return {
    schemaVersion: 3,
    id: input.id,
    title: input.title,
    rootNodeId: input.rootNodeId,
    nodes: Object.fromEntries(
      Object.entries(input.nodes).map(([nodeId, node]) => [
        nodeId,
        toV2Node(node),
      ]),
    ),
    floatingTopics: {},
    defaultStructure: 'logic-right',
    structureOverrides: {},
    labels: {},
    assets: {},
    theme: {
      ...defaultMindMapTheme,
      rootTopicStyle: { ...defaultMindMapTheme.rootTopicStyle },
      mainTopicStyle: { ...defaultMindMapTheme.mainTopicStyle },
      subtopicStyle: { ...defaultMindMapTheme.subtopicStyle },
    },
    relationships: input.relationships.map(migrateV2Relationship),
    boundaries: input.boundaries.map(migrateV2Boundary),
    summaries: input.summaries.map(migrateV2Summary),
    callouts: [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

/** @deprecated Editable documents are normalized to v3; use migrateV2Document. */
export const normalizeV2Document = migrateV2Document

export function migrateV1Document(
  input: MindMapDocumentV1Input,
): MindMapDocument {
  return {
    schemaVersion: 3,
    id: input.id,
    title: input.title,
    rootNodeId: input.rootNodeId,
    nodes: Object.fromEntries(
      Object.entries(input.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          id: node.id,
          parentId: node.parentId,
          childIds: [...node.childIds],
          text: node.text,
          collapsed: node.collapsed,
          markers: node.markers.map(migrateLegacyMarker),
          notes: node.notes,
          links: node.links.map((link) => ({ ...link })),
          labelIds: [],
          labelSortMode: 'manual' as const,
          contentBlocks: [],
          styleOverrides: toV3StyleOverrides(node.style),
          style: toV3Style(node.style),
        },
      ]),
    ),
    floatingTopics: {},
    defaultStructure: 'logic-right',
    structureOverrides: {},
    labels: {},
    assets: {},
    theme: {
      ...defaultMindMapTheme,
      rootTopicStyle: { ...defaultMindMapTheme.rootTopicStyle },
      mainTopicStyle: { ...defaultMindMapTheme.mainTopicStyle },
      subtopicStyle: { ...defaultMindMapTheme.subtopicStyle },
    },
    relationships: [],
    boundaries: [],
    summaries: [],
    callouts: [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

export function normalizeV3Document(
  input: MindMapDocumentV3Input,
): MindMapDocument {
  return {
    schemaVersion: 3,
    id: input.id,
    title: input.title,
    rootNodeId: input.rootNodeId,
    nodes: Object.fromEntries(
      Object.entries(input.nodes).map(([nodeId, node]) => [
        nodeId,
        toV3Node(node),
      ]),
    ),
    floatingTopics: Object.fromEntries(
      Object.entries(input.floatingTopics).map(([nodeId, placement]) => [
        nodeId,
        { ...placement },
      ]),
    ),
    defaultStructure: input.defaultStructure,
    structureOverrides: { ...input.structureOverrides },
    labels: Object.fromEntries(
      Object.entries(input.labels).map(([labelId, label]) => [
        labelId,
        { ...label },
      ]),
    ),
    assets: Object.fromEntries(
      Object.entries(input.assets).map(([assetId, asset]) => [
        assetId,
        { ...asset },
      ]),
    ),
    theme: {
      ...input.theme,
      rootTopicStyle: { ...input.theme.rootTopicStyle },
      mainTopicStyle: { ...input.theme.mainTopicStyle },
      subtopicStyle: { ...input.theme.subtopicStyle },
    },
    relationships: input.relationships.map(cloneV3Relationship),
    boundaries: input.boundaries.map(cloneV3Boundary),
    summaries: input.summaries.map(cloneV3Summary),
    callouts: input.callouts.map(cloneV3Callout),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}
