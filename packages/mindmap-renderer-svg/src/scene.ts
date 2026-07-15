import {
  assertMindMapDocument,
  type MindMapDocument,
  type MindMapMarker,
  type MindMapNode,
} from '@opentools/mindmap-core'
import type {
  LayoutBounds,
  LayoutNode,
  MindMapLayoutResult,
} from '@opentools/mindmap-layout'

import { createCubicConnectorPath } from './connector'

export interface SvgSceneBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SvgSceneTextLine {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly fill: string
  readonly fontSize: number
  readonly fontStyle: 'normal' | 'italic'
  readonly fontWeight: 'normal' | 'medium' | 'semibold' | 'bold'
}

export interface SvgSceneMarker {
  readonly key: string
  readonly kind: MindMapMarker['kind']
  readonly label: string
  readonly value: string
  readonly x: number
  readonly y: number
  readonly size: number
  readonly fill: string
  readonly textColor: string
}

export interface SvgSceneNode {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly cornerRadius: number
  readonly fill: string
  readonly stroke: string
  readonly textLines: readonly SvgSceneTextLine[]
  readonly markers: readonly SvgSceneMarker[]
}

export interface SvgSceneConnector {
  readonly id: string
  readonly path: string
  readonly stroke: string
  readonly strokeWidth: number
}

export interface SvgSceneRelationship {
  readonly id: string
  readonly path: string
  readonly label: string
  readonly labelX: number
  readonly labelY: number
}

export interface SvgSceneBoundary {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly label: string
}

export interface SvgSceneSummary {
  readonly id: string
  readonly path: string
  readonly label: string
  readonly labelX: number
  readonly labelY: number
}

export interface MindMapSvgScene {
  readonly bounds: SvgSceneBounds
  readonly contentBounds: LayoutBounds
  readonly nodes: readonly SvgSceneNode[]
  readonly connectors: readonly SvgSceneConnector[]
  readonly relationships: readonly SvgSceneRelationship[]
  readonly boundaries: readonly SvgSceneBoundary[]
  readonly summaries: readonly SvgSceneSummary[]
}

export interface SvgSceneOptions {
  readonly padding?: number
  readonly connectorStroke?: string
  readonly connectorStrokeWidth?: number
  readonly markerSize?: number
}

const defaultScenePadding = 48
const defaultMarkerSize = 18

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character] ?? character
  })
}

function resolvePositiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function wrapText(text: string, charactersPerLine: number): string[] {
  const lines: string[] = []

  for (const sourceLine of text.replace(/\r/g, '').split('\n')) {
    const characters = Array.from(sourceLine)
    if (characters.length === 0) {
      lines.push('')
      continue
    }

    for (let index = 0; index < characters.length; index += charactersPerLine) {
      lines.push(characters.slice(index, index + charactersPerLine).join(''))
    }
  }

  return lines
}

function createTextLines(
  node: MindMapNode,
  layoutNode: LayoutNode,
): SvgSceneTextLine[] {
  const fontSize = node.style.fontSize ?? 14
  const fontWeight = node.style.fontWeight ?? 'semibold'
  const fontStyle = node.style.fontStyle ?? 'normal'
  const lineHeight = Math.ceil(fontSize * 1.35)
  const charactersPerLine = Math.max(
    1,
    Math.floor((layoutNode.width - 32) / (fontSize * 0.62)),
  )
  const lines = wrapText(node.text, charactersPerLine)
  const textBlockHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight
  const firstBaseline =
    layoutNode.y + (layoutNode.height - textBlockHeight) / 2 + fontSize * 0.8

  return lines.map((text, index) => ({
    text,
    x: layoutNode.x + 16,
    y: firstBaseline + index * lineHeight,
    fill: node.style.textColor,
    fontSize,
    fontStyle,
    fontWeight,
  }))
}

function getMarkerPresentation(marker: MindMapMarker): {
  label: string
  fill: string
  textColor: string
} {
  switch (marker.kind) {
    case 'priority':
      return {
        label: `P${marker.value}`,
        fill: '#f5c451',
        textColor: '#5c3d00',
      }
    case 'status':
      return {
        label: marker.value,
        fill: '#9ce4d0',
        textColor: '#0d5f46',
      }
    case 'icon':
      return {
        label: marker.value,
        fill: '#d9d5ff',
        textColor: '#312e81',
      }
  }
}

function createMarkers(
  node: MindMapNode,
  layoutNode: LayoutNode,
  markerSize: number,
): SvgSceneMarker[] {
  return node.markers.map((marker, index) => {
    const presentation = getMarkerPresentation(marker)
    return {
      key: `${node.id}:${marker.kind}:${marker.value}:${index}`,
      kind: marker.kind,
      value: marker.value,
      label: presentation.label,
      x: layoutNode.x + layoutNode.width - (index + 1) * (markerSize + 6),
      y: layoutNode.y + (layoutNode.height - markerSize) / 2,
      size: markerSize,
      fill: presentation.fill,
      textColor: presentation.textColor,
    }
  })
}

function getCornerRadius(node: MindMapNode, layoutNode: LayoutNode): number {
  switch (node.style.shape) {
    case 'rectangle':
      return 0
    case 'pill':
      return Math.min(layoutNode.width, layoutNode.height) / 2
    case 'rounded-rectangle':
    default:
      return 14
  }
}

function createExportBounds(
  bounds: LayoutBounds,
  padding: number,
): SvgSceneBounds {
  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}

function createRelationshipPath(
  from: LayoutNode,
  to: LayoutNode,
): { path: string; labelX: number; labelY: number } {
  const fromX = from.x + from.width / 2
  const fromY = from.y + from.height / 2
  const toX = to.x + to.width / 2
  const toY = to.y + to.height / 2
  const controlY =
    Math.min(fromY, toY) - Math.max(36, Math.abs(toY - fromY) * 0.28)
  return {
    path: `M ${fromX} ${fromY} C ${fromX} ${controlY} ${toX} ${controlY} ${toX} ${toY}`,
    labelX: (fromX + toX) / 2,
    labelY: controlY - 6,
  }
}

function getGroupBounds(
  nodeIds: readonly string[],
  layoutNodes: ReadonlyMap<string, LayoutNode>,
): SvgSceneBounds | undefined {
  const nodes = nodeIds.map((nodeId) => layoutNodes.get(nodeId))
  if (nodes.some((node) => !node)) return undefined
  const visibleNodes = nodes as LayoutNode[]
  const minX = Math.min(...visibleNodes.map((node) => node.x))
  const minY = Math.min(...visibleNodes.map((node) => node.y))
  const maxX = Math.max(...visibleNodes.map((node) => node.x + node.width))
  const maxY = Math.max(...visibleNodes.map((node) => node.y + node.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function extendContentBounds(
  bounds: LayoutBounds,
  boundaries: readonly SvgSceneBoundary[],
  summaries: readonly SvgSceneSummary[],
): LayoutBounds {
  const shapes = [
    ...boundaries.map((boundary) => ({
      minX: boundary.x,
      minY: boundary.y,
      maxX: boundary.x + boundary.width,
      maxY: boundary.y + boundary.height,
    })),
    ...summaries.map((summary) => {
      const values = summary.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      const xs = values.filter((_, index) => index % 2 === 0)
      const ys = values.filter((_, index) => index % 2 === 1)
      return {
        minX: Math.min(...xs, summary.labelX),
        minY: Math.min(...ys, summary.labelY - 16),
        maxX: Math.max(...xs, summary.labelX + summary.label.length * 7),
        maxY: Math.max(...ys, summary.labelY),
      }
    }),
  ]
  if (shapes.length === 0) return bounds

  const minX = Math.min(bounds.minX, ...shapes.map((shape) => shape.minX))
  const minY = Math.min(bounds.minY, ...shapes.map((shape) => shape.minY))
  const maxX = Math.max(bounds.maxX, ...shapes.map((shape) => shape.maxX))
  const maxY = Math.max(bounds.maxY, ...shapes.map((shape) => shape.maxY))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * Creates renderer-neutral SVG primitives from a validated document and a
 * visible layout. It intentionally does not depend on DOM, React or Canvas.
 */
export function createMindMapSvgScene(
  document: MindMapDocument,
  layout: MindMapLayoutResult,
  options: SvgSceneOptions = {},
): MindMapSvgScene {
  assertMindMapDocument(document)

  const padding = resolvePositiveNumber(options.padding, defaultScenePadding)
  const markerSize = resolvePositiveNumber(
    options.markerSize,
    defaultMarkerSize,
  )
  const connectorStrokeWidth = resolvePositiveNumber(
    options.connectorStrokeWidth,
    2,
  )
  const connectorStroke = options.connectorStroke ?? '#a5a0d8'
  const nodes = layout.nodes.map((layoutNode) => {
    const node = document.nodes[layoutNode.id]
    if (!node) {
      throw new Error(
        `Layout references an unknown document node: ${layoutNode.id}`,
      )
    }

    return {
      id: node.id,
      x: layoutNode.x,
      y: layoutNode.y,
      width: layoutNode.width,
      height: layoutNode.height,
      cornerRadius: getCornerRadius(node, layoutNode),
      fill: node.style.backgroundColor,
      stroke: node.style.borderColor,
      textLines: createTextLines(node, layoutNode),
      markers: createMarkers(node, layoutNode, markerSize),
    }
  })
  const connectors = layout.edges.map((edge) => ({
    id: edge.id,
    path: createCubicConnectorPath(edge),
    stroke: connectorStroke,
    strokeWidth: connectorStrokeWidth,
  }))
  const layoutNodesById = new Map(
    layout.nodes.map((layoutNode) => [layoutNode.id, layoutNode]),
  )
  const relationships = document.relationships.flatMap((relationship) => {
    const from = layoutNodesById.get(relationship.fromNodeId)
    const to = layoutNodesById.get(relationship.toNodeId)
    if (!from || !to) return []
    return [
      {
        id: relationship.id,
        label: relationship.label,
        ...createRelationshipPath(from, to),
      },
    ]
  })
  const boundaries = document.boundaries.flatMap((boundary) => {
    const groupBounds = getGroupBounds(boundary.nodeIds, layoutNodesById)
    if (!groupBounds) return []
    return [
      {
        id: boundary.id,
        x: groupBounds.x - 14,
        y: groupBounds.y - 26,
        width: groupBounds.width + 28,
        height: groupBounds.height + 40,
        label: boundary.label,
      },
    ]
  })
  const summaries = document.summaries.flatMap((summary) => {
    const groupBounds = getGroupBounds(summary.nodeIds, layoutNodesById)
    if (!groupBounds) return []
    const x = groupBounds.x + groupBounds.width + 22
    const y = groupBounds.y
    const bottomY = groupBounds.y + groupBounds.height
    return [
      {
        id: summary.id,
        path: `M ${x} ${y} H ${x + 10} V ${bottomY} H ${x}`,
        label: summary.label,
        labelX: x + 16,
        labelY: (y + bottomY) / 2,
      },
    ]
  })
  const contentBounds = extendContentBounds(
    layout.bounds,
    boundaries,
    summaries,
  )

  return {
    bounds: createExportBounds(contentBounds, padding),
    contentBounds,
    nodes,
    connectors,
    relationships,
    boundaries,
    summaries,
  }
}

/** Serializes the pure scene for a future browser download adapter. */
export function serializeMindMapSvgScene(scene: MindMapSvgScene): string {
  const boundaryMarkup = scene.boundaries
    .map(
      (boundary) =>
        `<g data-boundary-id="${escapeXml(boundary.id)}"><rect x="${boundary.x}" y="${boundary.y}" width="${boundary.width}" height="${boundary.height}" rx="16" fill="#e9e7ff" fill-opacity="0.45" stroke="#8c82e7" stroke-dasharray="6 4" /><text x="${boundary.x + 12}" y="${boundary.y + 17}" fill="#4b458a" font-size="12" font-weight="semibold">${escapeXml(boundary.label)}</text></g>`,
    )
    .join('')
  const connectorMarkup = scene.connectors
    .map(
      (connector) =>
        `<path data-edge-id="${escapeXml(connector.id)}" d="${escapeXml(connector.path)}" fill="none" stroke="${escapeXml(connector.stroke)}" stroke-width="${connector.strokeWidth}" />`,
    )
    .join('')
  const relationshipMarkup = scene.relationships
    .map(
      (relationship) =>
        `<g data-relationship-id="${escapeXml(relationship.id)}"><path d="${escapeXml(relationship.path)}" fill="none" stroke="#e07850" stroke-width="2" stroke-dasharray="5 4" /><text x="${relationship.labelX}" y="${relationship.labelY}" text-anchor="middle" fill="#99422b" font-size="12">${escapeXml(relationship.label)}</text></g>`,
    )
    .join('')
  const summaryMarkup = scene.summaries
    .map(
      (summary) =>
        `<g data-summary-id="${escapeXml(summary.id)}"><path d="${escapeXml(summary.path)}" fill="none" stroke="#36a47f" stroke-width="2" /><text x="${summary.labelX}" y="${summary.labelY}" fill="#176245" font-size="12" font-weight="semibold">${escapeXml(summary.label)}</text></g>`,
    )
    .join('')
  const nodeMarkup = scene.nodes
    .map((node) => {
      const textMarkup = node.textLines
        .map(
          (line) =>
            `<text x="${line.x}" y="${line.y}" fill="${escapeXml(line.fill)}" font-size="${line.fontSize}" font-style="${line.fontStyle}" font-weight="${line.fontWeight}">${escapeXml(line.text)}</text>`,
        )
        .join('')
      const markerMarkup = node.markers
        .map(
          (marker) =>
            `<g data-marker="${escapeXml(marker.key)}"><rect x="${marker.x}" y="${marker.y}" width="${marker.size}" height="${marker.size}" rx="${marker.size / 2}" fill="${escapeXml(marker.fill)}" /><text x="${marker.x + marker.size / 2}" y="${marker.y + marker.size * 0.7}" text-anchor="middle" fill="${escapeXml(marker.textColor)}" font-size="${Math.max(8, marker.size * 0.48)}">${escapeXml(marker.label)}</text></g>`,
        )
        .join('')

      return `<g data-node-id="${escapeXml(node.id)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.cornerRadius}" fill="${escapeXml(node.fill)}" stroke="${escapeXml(node.stroke)}" />${textMarkup}${markerMarkup}</g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.bounds.x} ${scene.bounds.y} ${scene.bounds.width} ${scene.bounds.height}">${boundaryMarkup}${connectorMarkup}${relationshipMarkup}${summaryMarkup}${nodeMarkup}</svg>`
}
