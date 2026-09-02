import {
  assertMindMapDocument,
  deriveMindMapNumbering,
  getComputedMindMapNodeStyles,
  type MindMapDocument,
  type MindMapMarker,
  type MindMapNode,
  type MindMapRelationship,
} from '@opentools/mindmap-core'
import {
  defaultLayoutConfig,
  measureMindMapTopicText,
  wrapMindMapTopicText,
  type LayoutBounds,
  type LayoutNode,
  type MindMapLayoutResult,
  type MindMapTopicTextMetrics,
} from '@opentools/mindmap-layout'

import {
  getMindMapEquationRenderKey,
  type RenderableMindMapEquation,
} from './equation'

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
  readonly fontFamily: string
  readonly textAnchor: 'start' | 'middle' | 'end'
  readonly textDecoration: 'none' | 'line-through'
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
  readonly shape:
    'rounded-rectangle' | 'rectangle' | 'pill' | 'underline' | 'borderless'
  readonly fill: string
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeDasharray?: string | undefined
  readonly textLines: readonly SvgSceneTextLine[]
  readonly markers: readonly SvgSceneMarker[]
}

export interface RenderableMindMapAsset {
  readonly id: string
  readonly state: 'ready' | 'loading' | 'error'
  readonly href?: string | undefined
  readonly error?: string | undefined
}

export interface SvgSceneImage {
  readonly id: string
  readonly nodeId: string
  readonly assetId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly altText: string
  readonly state: 'ready' | 'loading' | 'error'
  readonly href?: string | undefined
}

export interface SvgSceneEquation {
  readonly id: string
  readonly nodeId: string
  readonly blockId: string
  readonly source: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly state: 'ready' | 'loading' | 'error'
  readonly svg?: string | undefined
  readonly error?: string | undefined
}

export interface SvgSceneNumbering {
  readonly nodeId: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly fill: string
  readonly fontSize: number
}

export interface SvgSceneConnector {
  readonly id: string
  readonly path: string
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeDasharray?: string | undefined
}

export interface SvgSceneRelationship {
  readonly id: string
  readonly path: string
  readonly label: string
  readonly labelX: number
  readonly labelY: number
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeDasharray?: string | undefined
  readonly startMarker: 'none' | 'arrow' | 'dot'
  readonly endMarker: 'none' | 'arrow' | 'dot'
  readonly labelFill: string
  readonly labelFontSize: number
  readonly controlPoints: readonly { readonly x: number; readonly y: number }[]
}

export interface SvgSceneBoundary {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly label: string
  readonly cornerRadius: number
  readonly fill: string
  readonly fillOpacity: number
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeDasharray?: string | undefined
  readonly textFill: string
}

export interface SvgSceneSummary {
  readonly id: string
  readonly path: string
  readonly shape: 'bracket' | 'line'
  readonly label: string
  readonly labelX: number
  readonly labelY: number
  readonly stroke: string
  readonly strokeWidth: number
  readonly strokeDasharray?: string | undefined
  readonly textFill: string
}

export interface SvgSceneLabel {
  readonly key: string
  readonly nodeId: string
  readonly labelId: string
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fill: string
  readonly textFill: string
}

export interface SvgSceneCallout {
  readonly id: string
  readonly ownerNodeId: string
  readonly connectorPath: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly cornerRadius: number
  readonly fill: string
  readonly stroke: string
  readonly strokeWidth: number
  readonly textLines: readonly SvgSceneTextLine[]
}

export interface MindMapSvgScene {
  readonly bounds: SvgSceneBounds
  readonly background: string
  readonly contentBounds: LayoutBounds
  readonly nodes: readonly SvgSceneNode[]
  readonly images: readonly SvgSceneImage[]
  readonly equations: readonly SvgSceneEquation[]
  readonly labels: readonly SvgSceneLabel[]
  readonly numberings: readonly SvgSceneNumbering[]
  readonly connectors: readonly SvgSceneConnector[]
  readonly relationships: readonly SvgSceneRelationship[]
  readonly boundaries: readonly SvgSceneBoundary[]
  readonly summaries: readonly SvgSceneSummary[]
  readonly callouts: readonly SvgSceneCallout[]
}

export interface SvgSceneOptions {
  readonly padding?: number
  readonly backgroundColor?: string
  readonly connectorStroke?: string
  readonly connectorStrokeWidth?: number
  readonly markerSize?: number
  readonly assets?: Readonly<Record<string, RenderableMindMapAsset>>
  readonly equations?: Readonly<Record<string, RenderableMindMapEquation>>
  readonly textMetricsByNodeId?: Readonly<
    Record<string, MindMapTopicTextMetrics>
  >
}

const defaultScenePadding = 48
const defaultMarkerSize = 18
const topicPadding = 20

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

function getInlineSvgIntrinsicSize(svg: string): {
  readonly width: number
  readonly height: number
} {
  const width = Number(/\bwidth=["']([0-9.]+)/i.exec(svg)?.[1])
  const height = Number(/\bheight=["']([0-9.]+)/i.exec(svg)?.[1])
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    throw new Error('Inline equation SVG has invalid intrinsic dimensions.')
  }
  return { width, height }
}

function createTextLines(
  node: MindMapNode,
  layoutNode: LayoutNode,
  horizontalOffset = 0,
  suppliedMetrics?: MindMapTopicTextMetrics,
): SvgSceneTextLine[] {
  const fontSize = node.style.fontSize ?? 14
  const fontWeight = node.style.fontWeight ?? 'semibold'
  const fontStyle = node.style.fontStyle ?? 'normal'
  const fontFamily = node.style.fontFamily
  const metrics =
    suppliedMetrics ??
    measureMindMapTopicText(node, layoutNode.width, defaultLayoutConfig)
  const lineHeight = metrics.lineHeight
  const lines = [...metrics.lines]
  const textBlockHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight
  const firstBaseline =
    node.contentBlocks.length > 0
      ? layoutNode.y + topicPadding + fontSize * 0.8
      : layoutNode.y +
        (layoutNode.height - textBlockHeight) / 2 +
        fontSize * 0.8

  const textAnchor =
    node.style.textAlign === 'center'
      ? 'middle'
      : node.style.textAlign === 'right'
        ? 'end'
        : 'start'
  const textX =
    textAnchor === 'middle'
      ? layoutNode.x + layoutNode.width / 2
      : textAnchor === 'end'
        ? layoutNode.x + layoutNode.width - topicPadding
        : layoutNode.x + topicPadding + horizontalOffset
  return lines.map((text, index) => ({
    text,
    x: textX,
    y: firstBaseline + index * lineHeight,
    fill: node.style.textColor,
    fontSize,
    fontStyle,
    fontWeight,
    fontFamily,
    textAnchor,
    textDecoration: node.style.textDecoration,
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
      return 10
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

function getStrokeDasharray(
  pattern: 'solid' | 'dashed' | 'dotted',
): string | undefined {
  return pattern === 'dashed' ? '8 5' : pattern === 'dotted' ? '2 4' : undefined
}

function createRelationshipPath(
  from: LayoutNode,
  to: LayoutNode,
  relationship: MindMapRelationship,
): {
  path: string
  labelX: number
  labelY: number
  controlPoints: readonly { x: number; y: number }[]
} {
  const fromX = from.x + from.width / 2
  const fromY = from.y + from.height / 2
  const toX = to.x + to.width / 2
  const toY = to.y + to.height / 2
  const midpoint = { x: (fromX + toX) / 2, y: (fromY + toY) / 2 }
  const controlPoints = relationship.controlPoints.map((point) => ({
    x: midpoint.x + point.x,
    y: midpoint.y + point.y,
  }))
  if (controlPoints.length > 0) {
    const path = [
      `M ${fromX} ${fromY}`,
      ...controlPoints.map((point) => `L ${point.x} ${point.y}`),
      `L ${toX} ${toY}`,
    ].join(' ')
    const labelPoint = controlPoints[Math.floor(controlPoints.length / 2)]!
    return {
      path,
      labelX: labelPoint.x,
      labelY: labelPoint.y - 8,
      controlPoints,
    }
  }
  if (relationship.style.shape === 'straight') {
    return {
      path: `M ${fromX} ${fromY} L ${toX} ${toY}`,
      labelX: midpoint.x,
      labelY: midpoint.y - 8,
      controlPoints,
    }
  }
  if (relationship.style.shape === 'elbow') {
    return {
      path: `M ${fromX} ${fromY} H ${midpoint.x} V ${toY} H ${toX}`,
      labelX: midpoint.x,
      labelY: midpoint.y - 8,
      controlPoints,
    }
  }
  const controlY =
    Math.min(fromY, toY) - Math.max(36, Math.abs(toY - fromY) * 0.28)
  return {
    path: `M ${fromX} ${fromY} C ${fromX} ${controlY} ${toX} ${controlY} ${toX} ${toY}`,
    labelX: (fromX + toX) / 2,
    labelY: controlY - 6,
    controlPoints,
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

function createSceneLabels(
  document: MindMapDocument,
  layoutNodes: readonly LayoutNode[],
): SvgSceneLabel[] {
  return layoutNodes.flatMap((layoutNode) => {
    const node = document.nodes[layoutNode.id]
    if (!node) return []
    let x = layoutNode.x
    return node.labelIds.flatMap((labelId, index) => {
      const label = document.labels[labelId]
      if (!label) return []
      const width = Math.max(38, Array.from(label.name).length * 7 + 18)
      const primitive: SvgSceneLabel = {
        key: `${node.id}:${label.id}:${index}`,
        nodeId: node.id,
        labelId: label.id,
        text: label.name,
        x,
        y: layoutNode.y + layoutNode.height + 7,
        width,
        height: 22,
        fill: label.color,
        textFill: '#ffffff',
      }
      x += width + 6
      return [primitive]
    })
  })
}

function createSceneCallouts(
  document: MindMapDocument,
  layoutNodesById: ReadonlyMap<string, LayoutNode>,
): SvgSceneCallout[] {
  return document.callouts.flatMap((callout) => {
    const owner = layoutNodesById.get(callout.ownerNodeId)
    if (!owner) return []
    const fontSize = callout.style.fontSize
    const rawLines = wrapMindMapTopicText(callout.text, 28)
    const lines = rawLines.length > 0 ? rawLines : ['']
    const longestLine = Math.max(
      ...lines.map((line) => Array.from(line).length),
    )
    const width = Math.max(
      92,
      Math.min(240, longestLine * fontSize * 0.62 + 28),
    )
    const lineHeight = Math.ceil(fontSize * 1.35)
    const height = Math.max(42, lines.length * lineHeight + 24)
    const gap = 34
    let x = owner.x + owner.width + gap
    let y = owner.y + owner.height / 2 - height / 2
    if (callout.placement === 'left') {
      x = owner.x - width - gap
    } else if (callout.placement === 'top') {
      x = owner.x + owner.width / 2 - width / 2
      y = owner.y - height - gap
    } else if (callout.placement === 'bottom') {
      x = owner.x + owner.width / 2 - width / 2
      y = owner.y + owner.height + gap
    }
    x += callout.offset.x
    y += callout.offset.y
    const ownerCenter = {
      x: owner.x + owner.width / 2,
      y: owner.y + owner.height / 2,
    }
    const calloutCenter = { x: x + width / 2, y: y + height / 2 }
    const firstBaseline = y + 17 + fontSize * 0.8
    return [
      {
        id: callout.id,
        ownerNodeId: callout.ownerNodeId,
        connectorPath: `M ${ownerCenter.x} ${ownerCenter.y} L ${calloutCenter.x} ${calloutCenter.y}`,
        x,
        y,
        width,
        height,
        cornerRadius:
          callout.style.shape === 'rectangle'
            ? 0
            : callout.style.shape === 'pill'
              ? height / 2
              : 12,
        fill: callout.style.backgroundColor,
        stroke: callout.style.borderColor,
        strokeWidth: callout.style.borderWidth,
        textLines: lines.map((text, index) => ({
          text,
          x: x + 14,
          y: firstBaseline + index * lineHeight,
          fill: callout.style.textColor,
          fontSize,
          fontStyle: 'normal',
          fontWeight: 'normal',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAnchor: 'start',
          textDecoration: 'none',
        })),
      },
    ]
  })
}

function getPathShapeBounds(path: string): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const tokens = path.match(/[MLCHV]|-?\d+(?:\.\d+)?/g) ?? []
  const xs: number[] = []
  const ys: number[] = []
  let command = 'M'
  let cursorX = 0
  let cursorY = 0
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index]!
    if (/^[MLCHV]$/.test(token)) {
      command = token
      index += 1
      continue
    }
    if (command === 'H') {
      cursorX = Number(token)
      index += 1
      xs.push(cursorX)
      ys.push(cursorY)
      continue
    }
    if (command === 'V') {
      cursorY = Number(token)
      index += 1
      xs.push(cursorX)
      ys.push(cursorY)
      continue
    }
    const pairCount = command === 'C' ? 3 : 1
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const x = Number(tokens[index + pairIndex * 2] ?? cursorX)
      const y = Number(tokens[index + pairIndex * 2 + 1] ?? cursorY)
      xs.push(x)
      ys.push(y)
      cursorX = x
      cursorY = y
    }
    index += pairCount * 2
  }
  if (xs.length === 0 || ys.length === 0)
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

function extendContentBounds(
  bounds: LayoutBounds,
  labels: readonly SvgSceneLabel[],
  relationships: readonly SvgSceneRelationship[],
  boundaries: readonly SvgSceneBoundary[],
  summaries: readonly SvgSceneSummary[],
  callouts: readonly SvgSceneCallout[],
): LayoutBounds {
  const shapes = [
    ...labels.map((label) => ({
      minX: label.x,
      minY: label.y,
      maxX: label.x + label.width,
      maxY: label.y + label.height,
    })),
    ...relationships.map((relationship) => {
      const pathBounds = getPathShapeBounds(relationship.path)
      return {
        minX: Math.min(pathBounds.minX, relationship.labelX),
        minY: Math.min(
          pathBounds.minY,
          relationship.labelY - relationship.labelFontSize,
        ),
        maxX: Math.max(
          pathBounds.maxX,
          relationship.labelX + relationship.label.length * 7,
        ),
        maxY: Math.max(pathBounds.maxY, relationship.labelY),
      }
    }),
    ...boundaries.map((boundary) => ({
      minX: boundary.x,
      minY: boundary.y,
      maxX: boundary.x + boundary.width,
      maxY: boundary.y + boundary.height,
    })),
    ...summaries.map((summary) => {
      const pathBounds = getPathShapeBounds(summary.path)
      return {
        minX: Math.min(pathBounds.minX, summary.labelX),
        minY: Math.min(pathBounds.minY, summary.labelY - 16),
        maxX: Math.max(
          pathBounds.maxX,
          summary.labelX + summary.label.length * 7,
        ),
        maxY: Math.max(pathBounds.maxY, summary.labelY),
      }
    }),
    ...callouts.map((callout) => {
      const connectorBounds = getPathShapeBounds(callout.connectorPath)
      return {
        minX: Math.min(callout.x, connectorBounds.minX),
        minY: Math.min(callout.y, connectorBounds.minY),
        maxX: Math.max(callout.x + callout.width, connectorBounds.maxX),
        maxY: Math.max(callout.y + callout.height, connectorBounds.maxY),
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
  const computedStyles = getComputedMindMapNodeStyles(document)
  const derivedNumbering = deriveMindMapNumbering(document)
  const numberings = layout.nodes.flatMap<SvgSceneNumbering>((layoutNode) => {
    const sourceNode = document.nodes[layoutNode.id]
    const node = sourceNode
      ? { ...sourceNode, style: computedStyles[layoutNode.id]! }
      : undefined
    const numbering = derivedNumbering[layoutNode.id]
    if (!node || !numbering) return []
    const fontSize = node.style.fontSize
    return [
      {
        nodeId: node.id,
        text: numbering.label,
        x: layoutNode.x + topicPadding,
        y:
          node.contentBlocks.length > 0
            ? layoutNode.y + topicPadding + fontSize * 0.8
            : layoutNode.y + layoutNode.height / 2 + fontSize * 0.35,
        fill: node.style.textColor,
        fontSize,
      },
    ]
  })
  const numberingByNodeId = new Map(
    numberings.map((numbering) => [numbering.nodeId, numbering]),
  )
  const images: SvgSceneImage[] = []
  const equations: SvgSceneEquation[] = []
  const nodes = layout.nodes.map((layoutNode) => {
    const sourceNode = document.nodes[layoutNode.id]
    if (!sourceNode) {
      throw new Error(
        `Layout references an unknown document node: ${layoutNode.id}`,
      )
    }
    const node = { ...sourceNode, style: computedStyles[layoutNode.id]! }

    const textLines = createTextLines(
      node,
      layoutNode,
      numberingByNodeId.has(node.id)
        ? (numberingByNodeId.get(node.id)!.text.length + 1) *
            node.style.fontSize *
            0.62
        : 0,
      options.textMetricsByNodeId?.[node.id],
    )
    let contentY =
      (textLines.at(-1)?.y ?? layoutNode.y + topicPadding) +
      node.style.fontSize * 0.45 +
      8
    for (const block of node.contentBlocks) {
      if (block.type === 'image') {
        const metadata = document.assets[block.assetId]
        if (!metadata) continue
        const naturalHeight =
          block.height ??
          block.width * (metadata.intrinsicHeight / metadata.intrinsicWidth)
        const availableWidth = Math.max(1, layoutNode.width - topicPadding * 2)
        const scale = Math.min(1, availableWidth / block.width)
        const width = block.width * scale
        const height = naturalHeight * scale
        const renderable = options.assets?.[block.assetId]
        const state =
          renderable?.state === 'ready' && !renderable.href
            ? 'error'
            : (renderable?.state ?? 'error')
        images.push({
          id: block.id,
          nodeId: node.id,
          assetId: block.assetId,
          x: layoutNode.x + (layoutNode.width - width) / 2,
          y: contentY,
          width,
          height,
          altText: block.altText,
          state,
          ...(renderable?.href ? { href: renderable.href } : {}),
        })
        contentY += height + 8
        continue
      }

      const renderable =
        options.equations?.[getMindMapEquationRenderKey(node.id, block.id)]
      const naturalWidth = renderable?.width ?? block.width ?? 160
      const naturalHeight = renderable?.height ?? block.height ?? 48
      const availableWidth = Math.max(1, layoutNode.width - topicPadding * 2)
      const scale = Math.min(1, availableWidth / naturalWidth)
      const width = naturalWidth * scale
      const height = naturalHeight * scale
      const state =
        renderable?.state === 'ready' && !renderable.svg
          ? 'error'
          : (renderable?.state ?? 'loading')
      equations.push({
        id: getMindMapEquationRenderKey(node.id, block.id),
        nodeId: node.id,
        blockId: block.id,
        source: block.source,
        x: layoutNode.x + (layoutNode.width - width) / 2,
        y: contentY,
        width,
        height,
        state,
        ...(renderable?.svg ? { svg: renderable.svg } : {}),
        ...(renderable?.error ? { error: renderable.error } : {}),
      })
      contentY += height + 8
    }

    return {
      id: node.id,
      x: layoutNode.x,
      y: layoutNode.y,
      width: layoutNode.width,
      height: layoutNode.height,
      cornerRadius: getCornerRadius(node, layoutNode),
      shape: node.style.shape,
      fill: node.style.backgroundColor,
      stroke: node.style.borderColor,
      strokeWidth: node.style.borderWidth,
      strokeDasharray: getStrokeDasharray(node.style.borderStyle),
      textLines,
      markers: createMarkers(node, layoutNode, markerSize),
    }
  })
  const connectors = layout.edges.map((edge) => {
    const style = computedStyles[edge.targetId]
    return {
      id: edge.id,
      path: createCubicConnectorPath({
        ...edge,
        connectorShape: style?.branchShape ?? edge.connectorShape,
      }),
      stroke: style?.branchColor ?? connectorStroke,
      strokeWidth: style?.branchWidth ?? connectorStrokeWidth,
      strokeDasharray: style
        ? getStrokeDasharray(style.branchStyle)
        : undefined,
    }
  })
  const layoutNodesById = new Map(
    layout.nodes.map((layoutNode) => [layoutNode.id, layoutNode]),
  )
  const labels = createSceneLabels(document, layout.nodes)
  const relationships = document.relationships.flatMap((relationship) => {
    const from = layoutNodesById.get(relationship.fromNodeId)
    const to = layoutNodesById.get(relationship.toNodeId)
    if (!from || !to) return []
    return [
      {
        id: relationship.id,
        label: relationship.label,
        ...createRelationshipPath(from, to, relationship),
        stroke: relationship.style.color,
        strokeWidth: relationship.style.width,
        strokeDasharray: getStrokeDasharray(relationship.style.pattern),
        startMarker: relationship.style.startMarker,
        endMarker: relationship.style.endMarker,
        labelFill: relationship.style.labelColor,
        labelFontSize: relationship.style.labelFontSize,
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
        cornerRadius:
          boundary.style.shape === 'rectangle'
            ? 0
            : boundary.style.shape === 'cloud'
              ? 28
              : 16,
        fill: boundary.style.fillColor,
        fillOpacity: boundary.style.fillOpacity,
        stroke: boundary.style.borderColor,
        strokeWidth: boundary.style.borderWidth,
        strokeDasharray: getStrokeDasharray(boundary.style.borderStyle),
        textFill: boundary.style.textColor,
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
        path:
          summary.style.shape === 'line'
            ? `M ${x + 10} ${y} V ${bottomY}`
            : `M ${x} ${y} H ${x + 10} V ${bottomY} H ${x}`,
        shape: summary.style.shape,
        label: summary.label,
        labelX: x + 16,
        labelY: (y + bottomY) / 2,
        stroke: summary.style.color,
        strokeWidth: summary.style.width,
        strokeDasharray: getStrokeDasharray(summary.style.pattern),
        textFill: summary.style.textColor,
      },
    ]
  })
  const callouts = createSceneCallouts(document, layoutNodesById)
  const contentBounds = extendContentBounds(
    layout.bounds,
    labels,
    relationships,
    boundaries,
    summaries,
    callouts,
  )

  return {
    bounds: createExportBounds(contentBounds, padding),
    background: options.backgroundColor ?? document.theme.backgroundColor,
    contentBounds,
    nodes,
    images,
    equations,
    labels,
    numberings,
    connectors,
    relationships,
    boundaries,
    summaries,
    callouts,
  }
}

/** Serializes the pure scene for a future browser download adapter. */
export function serializeMindMapSvgScene(scene: MindMapSvgScene): string {
  const markerDefinitions =
    '<defs><marker id="relationship-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" /></marker><marker id="relationship-dot" markerWidth="8" markerHeight="8" refX="4" refY="4"><circle cx="4" cy="4" r="3" fill="context-stroke" /></marker></defs>'
  const boundaryMarkup = scene.boundaries
    .map(
      (boundary) =>
        `<g data-boundary-id="${escapeXml(boundary.id)}"><rect x="${boundary.x}" y="${boundary.y}" width="${boundary.width}" height="${boundary.height}" rx="${boundary.cornerRadius}" fill="${escapeXml(boundary.fill)}" fill-opacity="${boundary.fillOpacity}" stroke="${escapeXml(boundary.stroke)}" stroke-width="${boundary.strokeWidth}"${boundary.strokeDasharray ? ` stroke-dasharray="${boundary.strokeDasharray}"` : ''} /><text x="${boundary.x + 12}" y="${boundary.y + 17}" fill="${escapeXml(boundary.textFill)}" font-size="12" font-weight="semibold">${escapeXml(boundary.label)}</text></g>`,
    )
    .join('')
  const connectorMarkup = scene.connectors
    .map(
      (connector) =>
        `<path data-edge-id="${escapeXml(connector.id)}" d="${escapeXml(connector.path)}" fill="none" stroke="${escapeXml(connector.stroke)}" stroke-width="${connector.strokeWidth}"${connector.strokeDasharray ? ` stroke-dasharray="${connector.strokeDasharray}"` : ''} />`,
    )
    .join('')
  const relationshipMarkup = scene.relationships
    .map((relationship) => {
      const startMarker =
        relationship.startMarker === 'none'
          ? ''
          : ` marker-start="url(#relationship-${relationship.startMarker})"`
      const endMarker =
        relationship.endMarker === 'none'
          ? ''
          : ` marker-end="url(#relationship-${relationship.endMarker})"`
      const controls = relationship.controlPoints
        .map(
          (point, index) =>
            `<circle data-control-point="${index}" cx="${point.x}" cy="${point.y}" r="4" fill="${escapeXml(relationship.stroke)}" />`,
        )
        .join('')
      return `<g data-relationship-id="${escapeXml(relationship.id)}"><path d="${escapeXml(relationship.path)}" fill="none" stroke="${escapeXml(relationship.stroke)}" stroke-width="${relationship.strokeWidth}"${relationship.strokeDasharray ? ` stroke-dasharray="${relationship.strokeDasharray}"` : ''}${startMarker}${endMarker} /><text x="${relationship.labelX}" y="${relationship.labelY}" text-anchor="middle" fill="${escapeXml(relationship.labelFill)}" font-size="${relationship.labelFontSize}">${escapeXml(relationship.label)}</text>${controls}</g>`
    })
    .join('')
  const summaryMarkup = scene.summaries
    .map(
      (summary) =>
        `<g data-summary-id="${escapeXml(summary.id)}"><path d="${escapeXml(summary.path)}" fill="none" stroke="${escapeXml(summary.stroke)}" stroke-width="${summary.strokeWidth}"${summary.strokeDasharray ? ` stroke-dasharray="${summary.strokeDasharray}"` : ''} /><text x="${summary.labelX}" y="${summary.labelY}" fill="${escapeXml(summary.textFill)}" font-size="12" font-weight="semibold">${escapeXml(summary.label)}</text></g>`,
    )
    .join('')
  const labelMarkup = scene.labels
    .map(
      (label) =>
        `<g data-label-id="${escapeXml(label.labelId)}" data-label-node-id="${escapeXml(label.nodeId)}"><rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="${label.height / 2}" fill="${escapeXml(label.fill)}" /><text x="${label.x + label.width / 2}" y="${label.y + label.height * 0.68}" text-anchor="middle" fill="${escapeXml(label.textFill)}" font-size="11">${escapeXml(label.text)}</text></g>`,
    )
    .join('')
  const calloutMarkup = scene.callouts
    .map((callout) => {
      const textMarkup = callout.textLines
        .map(
          (line) =>
            `<text x="${line.x}" y="${line.y}" fill="${escapeXml(line.fill)}" font-size="${line.fontSize}" font-style="${line.fontStyle}" font-weight="${line.fontWeight}">${escapeXml(line.text)}</text>`,
        )
        .join('')
      return `<g data-callout-id="${escapeXml(callout.id)}" data-owner-node-id="${escapeXml(callout.ownerNodeId)}"><path d="${escapeXml(callout.connectorPath)}" fill="none" stroke="${escapeXml(callout.stroke)}" stroke-width="${Math.max(1, callout.strokeWidth)}" /><rect x="${callout.x}" y="${callout.y}" width="${callout.width}" height="${callout.height}" rx="${callout.cornerRadius}" fill="${escapeXml(callout.fill)}" stroke="${escapeXml(callout.stroke)}" stroke-width="${callout.strokeWidth}" />${textMarkup}</g>`
    })
    .join('')
  const numberingByNodeId = new Map(
    scene.numberings.map((numbering) => [numbering.nodeId, numbering]),
  )
  const imagesByNodeId = new Map<string, SvgSceneImage[]>()
  for (const image of scene.images) {
    const images = imagesByNodeId.get(image.nodeId) ?? []
    images.push(image)
    imagesByNodeId.set(image.nodeId, images)
  }
  const equationsByNodeId = new Map<string, SvgSceneEquation[]>()
  for (const equation of scene.equations) {
    const equations = equationsByNodeId.get(equation.nodeId) ?? []
    equations.push(equation)
    equationsByNodeId.set(equation.nodeId, equations)
  }
  const nodeMarkup = scene.nodes
    .map((node) => {
      const textMarkup = node.textLines
        .map(
          (line) =>
            `<text x="${line.x}" y="${line.y}" fill="${escapeXml(line.fill)}" font-family="${escapeXml(line.fontFamily)}" font-size="${line.fontSize}" font-style="${line.fontStyle}" font-weight="${line.fontWeight}" text-anchor="${line.textAnchor}" text-decoration="${line.textDecoration}">${escapeXml(line.text)}</text>`,
        )
        .join('')
      const markerMarkup = node.markers
        .map(
          (marker) =>
            `<g data-marker="${escapeXml(marker.key)}"><rect x="${marker.x}" y="${marker.y}" width="${marker.size}" height="${marker.size}" rx="${marker.size / 2}" fill="${escapeXml(marker.fill)}" /><text x="${marker.x + marker.size / 2}" y="${marker.y + marker.size * 0.7}" text-anchor="middle" fill="${escapeXml(marker.textColor)}" font-size="${Math.max(8, marker.size * 0.48)}">${escapeXml(marker.label)}</text></g>`,
        )
        .join('')
      const numbering = numberingByNodeId.get(node.id)
      const numberingMarkup = numbering
        ? `<text data-numbering-for="${escapeXml(numbering.nodeId)}" x="${numbering.x}" y="${numbering.y}" fill="${escapeXml(numbering.fill)}" font-size="${numbering.fontSize}" font-weight="semibold">${escapeXml(numbering.text)}</text>`
        : ''

      const imageMarkup = (imagesByNodeId.get(node.id) ?? [])
        .map((image) => {
          if (image.state === 'ready') {
            if (!image.href?.startsWith('data:')) {
              throw new Error(
                'SVG export requires every ready image to use an inline data URI.',
              )
            }
            return `<image data-image-id="${escapeXml(image.id)}" data-asset-id="${escapeXml(image.assetId)}" x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" href="${escapeXml(image.href)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(image.altText)}" />`
          }
          const label =
            image.altText ||
            (image.state === 'loading' ? 'Image loading' : 'Image unavailable')
          return `<g data-image-id="${escapeXml(image.id)}" data-asset-id="${escapeXml(image.assetId)}" data-image-state="${image.state}"><rect x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" rx="8" fill="#f4f3fb" stroke="#aaa4cf" stroke-dasharray="4 3" /><text x="${image.x + image.width / 2}" y="${image.y + image.height / 2}" text-anchor="middle" fill="#5c5878" font-size="12">${escapeXml(label)}</text></g>`
        })
        .join('')

      const equationMarkup = (equationsByNodeId.get(node.id) ?? [])
        .map((equation) => {
          if (equation.state === 'ready') {
            if (
              !equation.svg?.trim().match(/^<svg(?:\s|>)/i) ||
              /<(?:script|foreignObject|iframe|object|embed|image|a)(?:\s|>)/i.test(
                equation.svg,
              ) ||
              /\bon[a-z]+\s*=/i.test(equation.svg) ||
              /\b(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(equation.svg)
            ) {
              throw new Error(
                'SVG export requires sanitized inline equation markup.',
              )
            }
            const intrinsic = getInlineSvgIntrinsicSize(equation.svg)
            return `<g data-equation-id="${escapeXml(equation.blockId)}" transform="translate(${equation.x} ${equation.y}) scale(${equation.width / intrinsic.width} ${equation.height / intrinsic.height})">${equation.svg}</g>`
          }
          const label =
            equation.state === 'loading'
              ? 'Equation loading'
              : 'Equation unavailable'
          return `<g data-equation-id="${escapeXml(equation.blockId)}" data-equation-state="${equation.state}"><rect x="${equation.x}" y="${equation.y}" width="${equation.width}" height="${equation.height}" rx="8" fill="#f4f3fb" stroke="#aaa4cf" stroke-dasharray="4 3" /><text x="${equation.x + equation.width / 2}" y="${equation.y + equation.height / 2}" text-anchor="middle" fill="#5c5878" font-size="12">${label}</text></g>`
        })
        .join('')

      const backgroundMarkup = `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.cornerRadius}" fill="${escapeXml(node.fill)}" stroke="${node.shape === 'borderless' || node.shape === 'underline' ? 'none' : escapeXml(node.stroke)}" stroke-width="${node.strokeWidth}"${node.strokeDasharray ? ` stroke-dasharray="${node.strokeDasharray}"` : ''} />`
      const underlineMarkup =
        node.shape === 'underline'
          ? `<line x1="${node.x}" y1="${node.y + node.height}" x2="${node.x + node.width}" y2="${node.y + node.height}" stroke="${escapeXml(node.stroke)}" stroke-width="${node.strokeWidth}"${node.strokeDasharray ? ` stroke-dasharray="${node.strokeDasharray}"` : ''} />`
          : ''
      return `<g data-node-id="${escapeXml(node.id)}">${backgroundMarkup}${underlineMarkup}${numberingMarkup}${textMarkup}${imageMarkup}${equationMarkup}${markerMarkup}</g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.bounds.x} ${scene.bounds.y} ${scene.bounds.width} ${scene.bounds.height}">${markerDefinitions}<rect data-map-background="true" x="${scene.bounds.x}" y="${scene.bounds.y}" width="${scene.bounds.width}" height="${scene.bounds.height}" fill="${escapeXml(scene.background)}" />${boundaryMarkup}${connectorMarkup}${relationshipMarkup}${summaryMarkup}${nodeMarkup}${labelMarkup}${calloutMarkup}</svg>`
}
