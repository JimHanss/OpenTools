import { hierarchy, type HierarchyNode } from 'd3-hierarchy'

import {
  assertMindMapDocument,
  type MindMapDocument,
  type MindMapNode,
  type MindMapNodeId,
} from '@opentools/mindmap-core'

import type {
  LayoutBounds,
  LayoutEdge,
  LayoutNode,
  MindMapLayoutConfig,
  MindMapLayoutOptions,
  MindMapLayoutResult,
  MindMapNodeSize,
} from './types'

export const defaultLayoutConfig: MindMapLayoutConfig = {
  nodeWidth: 176,
  nodeHeight: 52,
  horizontalGap: 88,
  verticalGap: 34,
  horizontalPadding: 24,
  verticalPadding: 14,
  textCharacterWidth: 7.6,
  maxNodeWidth: 440,
}

interface LayoutDatum {
  readonly node: MindMapNode
  readonly children: readonly LayoutDatum[]
}

function resolveConfig(options: MindMapLayoutOptions): MindMapLayoutConfig {
  const nodeWidth = isUsableDimension(options.nodeWidth)
    ? options.nodeWidth
    : defaultLayoutConfig.nodeWidth

  return {
    nodeWidth,
    nodeHeight: isUsableDimension(options.nodeHeight)
      ? options.nodeHeight
      : defaultLayoutConfig.nodeHeight,
    horizontalGap: isUsableDimension(options.horizontalGap)
      ? options.horizontalGap
      : defaultLayoutConfig.horizontalGap,
    verticalGap: isUsableDimension(options.verticalGap)
      ? options.verticalGap
      : defaultLayoutConfig.verticalGap,
    horizontalPadding: isUsableDimension(options.horizontalPadding)
      ? options.horizontalPadding
      : defaultLayoutConfig.horizontalPadding,
    verticalPadding: isUsableDimension(options.verticalPadding)
      ? options.verticalPadding
      : defaultLayoutConfig.verticalPadding,
    textCharacterWidth: isUsableDimension(options.textCharacterWidth)
      ? options.textCharacterWidth
      : defaultLayoutConfig.textCharacterWidth,
    maxNodeWidth: Math.max(
      nodeWidth,
      isUsableDimension(options.maxNodeWidth)
        ? options.maxNodeWidth
        : defaultLayoutConfig.maxNodeWidth,
    ),
  }
}

function isUsableDimension(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0
}

function countWrappedTextLines(
  text: string,
  charactersPerLine: number,
): number {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .reduce(
      (lineCount, line) =>
        lineCount +
        Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine)),
      0,
    )
}

function getLongestVisibleLineLength(
  text: string,
  charactersPerLine: number,
): number {
  return Math.min(
    charactersPerLine,
    Math.max(
      1,
      ...text
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => Array.from(line).length),
    ),
  )
}

/**
 * Estimates a safe node size without DOM text measurement. A web adapter can
 * replace either dimension through `nodeSizes` after measuring rendered text.
 */
export function estimateMindMapNodeSize(
  node: MindMapNode,
  config: MindMapLayoutConfig = defaultLayoutConfig,
): MindMapNodeSize {
  const fontSize = node.style.fontSize ?? 14
  const characterWidth = config.textCharacterWidth * (fontSize / 14)
  const maximumTextWidth = Math.max(
    characterWidth,
    config.maxNodeWidth - config.horizontalPadding * 2,
  )
  const charactersPerLine = Math.max(
    1,
    Math.floor(maximumTextWidth / characterWidth),
  )
  const lineHeight = Math.ceil(fontSize * 1.35)
  const lineCount = countWrappedTextLines(node.text, charactersPerLine)
  const longestLineLength = getLongestVisibleLineLength(
    node.text,
    charactersPerLine,
  )

  return {
    width: Math.max(
      config.nodeWidth,
      Math.min(
        config.maxNodeWidth,
        longestLineLength * characterWidth + config.horizontalPadding * 2,
      ),
    ),
    height: Math.max(
      config.nodeHeight,
      lineCount * lineHeight + config.verticalPadding * 2,
    ),
  }
}

function resolveNodeSize(
  node: MindMapNode,
  options: MindMapLayoutOptions,
  config: MindMapLayoutConfig,
): MindMapNodeSize {
  const fallbackSize = estimateMindMapNodeSize(node, config)
  const suppliedSize = options.nodeSizes?.[node.id]

  return {
    width: isUsableDimension(suppliedSize?.width)
      ? suppliedSize.width
      : fallbackSize.width,
    height: isUsableDimension(suppliedSize?.height)
      ? suppliedSize.height
      : fallbackSize.height,
  }
}

function buildVisibleTree(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): LayoutDatum {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Mind map node not found: ${nodeId}`)

  return {
    node,
    children: node.collapsed
      ? []
      : node.childIds.map((childId) => buildVisibleTree(document, childId)),
  }
}

function calculateSubtreeHeight(
  node: HierarchyNode<LayoutDatum>,
  nodeSizes: ReadonlyMap<MindMapNodeId, MindMapNodeSize>,
  verticalGap: number,
  subtreeHeights: Map<MindMapNodeId, number>,
): number {
  const ownHeight = nodeSizes.get(node.data.node.id)?.height
  if (!ownHeight) throw new Error('Missing node measurement during layout')

  const children = node.children ?? []
  if (children.length === 0) {
    subtreeHeights.set(node.data.node.id, ownHeight)
    return ownHeight
  }

  const childrenHeight = children.reduce(
    (total, child, index) =>
      total +
      calculateSubtreeHeight(child, nodeSizes, verticalGap, subtreeHeights) +
      (index === 0 ? 0 : verticalGap),
    0,
  )
  const subtreeHeight = Math.max(ownHeight, childrenHeight)
  subtreeHeights.set(node.data.node.id, subtreeHeight)
  return subtreeHeight
}

function assignNodePositions(
  node: HierarchyNode<LayoutDatum>,
  subtreeTop: number,
  xByDepth: ReadonlyMap<number, number>,
  nodeSizes: ReadonlyMap<MindMapNodeId, MindMapNodeSize>,
  subtreeHeights: ReadonlyMap<MindMapNodeId, number>,
  verticalGap: number,
  positions: Map<MindMapNodeId, LayoutNode>,
): void {
  const nodeId = node.data.node.id
  const size = nodeSizes.get(nodeId)
  const subtreeHeight = subtreeHeights.get(nodeId)
  const x = xByDepth.get(node.depth)
  if (!size || subtreeHeight === undefined || x === undefined) {
    throw new Error('Layout state is incomplete')
  }

  positions.set(nodeId, {
    id: nodeId,
    x,
    y: subtreeTop + (subtreeHeight - size.height) / 2,
    ...size,
  })

  const children = node.children ?? []
  if (children.length === 0) return

  const childrenHeight = children.reduce((total, child, index) => {
    const childHeight = subtreeHeights.get(child.data.node.id)
    if (childHeight === undefined) throw new Error('Missing child subtree')
    return total + childHeight + (index === 0 ? 0 : verticalGap)
  }, 0)
  let childTop = subtreeTop + (subtreeHeight - childrenHeight) / 2

  for (const child of children) {
    assignNodePositions(
      child,
      childTop,
      xByDepth,
      nodeSizes,
      subtreeHeights,
      verticalGap,
      positions,
    )
    const childHeight = subtreeHeights.get(child.data.node.id)
    if (childHeight === undefined) throw new Error('Missing child subtree')
    childTop += childHeight + verticalGap
  }
}

function createBounds(nodes: readonly LayoutNode[]): LayoutBounds {
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * Produces a deterministic, left-to-right layout for the visible document
 * tree. The domain model remains the source of truth; this module owns only
 * node positions and connector endpoints.
 */
export function layoutMindMap(
  document: MindMapDocument,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  assertMindMapDocument(document)

  const config = resolveConfig(options)
  const root = hierarchy(
    buildVisibleTree(document, document.rootNodeId),
    (datum) => datum.children,
  )
  const descendants = root.descendants()
  const nodeSizes = new Map<MindMapNodeId, MindMapNodeSize>(
    descendants.map((node) => [
      node.data.node.id,
      resolveNodeSize(node.data.node, options, config),
    ]),
  )

  const widestNodeByDepth = new Map<number, number>()
  for (const node of descendants) {
    const width = nodeSizes.get(node.data.node.id)?.width
    if (!width) throw new Error('Missing node measurement during layout')
    widestNodeByDepth.set(
      node.depth,
      Math.max(widestNodeByDepth.get(node.depth) ?? 0, width),
    )
  }

  const xByDepth = new Map<number, number>()
  let x = 0
  for (let depth = 0; depth <= root.height; depth += 1) {
    xByDepth.set(depth, x)
    x +=
      (widestNodeByDepth.get(depth) ?? config.nodeWidth) + config.horizontalGap
  }

  const subtreeHeights = new Map<MindMapNodeId, number>()
  calculateSubtreeHeight(root, nodeSizes, config.verticalGap, subtreeHeights)
  const positions = new Map<MindMapNodeId, LayoutNode>()
  assignNodePositions(
    root,
    0,
    xByDepth,
    nodeSizes,
    subtreeHeights,
    config.verticalGap,
    positions,
  )

  const nodes = descendants.map((node) => {
    const position = positions.get(node.data.node.id)
    if (!position) throw new Error('Missing node position during layout')
    return position
  })
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const edges = descendants.flatMap<LayoutEdge>((node) => {
    if (!node.parent) return []

    const source = nodesById.get(node.parent.data.node.id)
    const target = nodesById.get(node.data.node.id)
    if (!source || !target)
      throw new Error('Layout edge references a missing node')

    return [
      {
        id: `${source.id}->${target.id}`,
        sourceId: source.id,
        targetId: target.id,
        sourceX: source.x + source.width,
        sourceY: source.y + source.height / 2,
        targetX: target.x,
        targetY: target.y + target.height / 2,
      },
    ]
  })
  const bounds = createBounds(nodes)

  return { nodes, edges, bounds, width: bounds.width, height: bounds.height }
}
