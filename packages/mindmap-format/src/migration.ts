import {
  defaultMindMapNodeStyle,
  type MindMapDocument,
  type MindMapNode,
  type MindMapNodeMarker,
  type MindMapNodeStyle,
} from '@opentools/mindmap-core'

import type { MindMapDocumentV1Input, MindMapDocumentV2Input } from './schema'

function migrateLegacyMarker(marker: string): MindMapNodeMarker {
  const match = /^(priority|status|icon):(.+)$/u.exec(marker)
  if (match?.[1] && match[2]) {
    return {
      kind: match[1] as MindMapNodeMarker['kind'],
      value: match[2],
    }
  }

  // v1 has no generic marker type. Retaining an unrecognized value as an icon
  // keeps editable data instead of silently deleting user information.
  return { kind: 'icon', value: marker }
}

function toStyle(
  style: MindMapDocumentV2Input['nodes'][string]['style'],
): MindMapNodeStyle {
  const result: MindMapNodeStyle = {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    textColor: style.textColor,
  }

  if (style.fontSize !== undefined) result.fontSize = style.fontSize
  if (style.fontWeight !== undefined) result.fontWeight = style.fontWeight
  if (style.fontStyle !== undefined) result.fontStyle = style.fontStyle
  if (style.shape !== undefined) result.shape = style.shape

  return result
}

function toNode(node: MindMapDocumentV2Input['nodes'][string]): MindMapNode {
  return {
    id: node.id,
    parentId: node.parentId,
    childIds: [...node.childIds],
    text: node.text,
    collapsed: node.collapsed,
    markers: node.markers.map((marker) => ({ ...marker })),
    notes: node.notes,
    links: node.links.map((link) => ({ ...link })),
    style: toStyle(node.style),
  }
}

export function normalizeV2Document(
  input: MindMapDocumentV2Input,
): MindMapDocument {
  return {
    schemaVersion: 2,
    id: input.id,
    title: input.title,
    rootNodeId: input.rootNodeId,
    nodes: Object.fromEntries(
      Object.entries(input.nodes).map(([nodeId, node]) => [
        nodeId,
        toNode(node),
      ]),
    ),
    relationships: input.relationships.map((relationship) => ({
      ...relationship,
    })),
    boundaries: input.boundaries.map((boundary) => ({
      ...boundary,
      nodeIds: [...boundary.nodeIds],
    })),
    summaries: input.summaries.map((summary) => ({
      ...summary,
      nodeIds: [...summary.nodeIds],
    })),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

export function migrateV1Document(
  input: MindMapDocumentV1Input,
): MindMapDocument {
  return {
    schemaVersion: 2,
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
          style: { ...defaultMindMapNodeStyle, ...node.style },
        },
      ]),
    ),
    relationships: [],
    boundaries: [],
    summaries: [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}
