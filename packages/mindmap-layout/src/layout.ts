import {
  assertMindMapDocument,
  getComputedMindMapNodeStyle,
  getOwningRootNodeId,
  type MindMapDocument,
  type MindMapNode,
  type MindMapNodeId,
  type MindMapStructure,
} from '@opentools/mindmap-core'

import { defaultLayoutStrategyRegistry } from './strategies'
import type {
  LayoutBounds,
  LayoutNode,
  LayoutStrategyRegistry,
  LayoutSubtreeResult,
  MindMapLayoutConfig,
  MindMapLayoutOptions,
  MindMapLayoutResult,
  MindMapNodeSize,
  MindMapTopicTextMeasure,
  MindMapTopicTextMetrics,
  MindMapTopicTextMeasureStyle,
} from './types'

export const defaultLayoutConfig: MindMapLayoutConfig = {
  nodeWidth: 176,
  nodeHeight: 52,
  horizontalGap: 88,
  verticalGap: 34,
  horizontalPadding: 20,
  verticalPadding: 20,
  textCharacterWidth: 7.6,
  maxNodeWidth: 350,
}

function isUsableDimension(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0
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

export function wrapMindMapTopicText(
  text: string,
  charactersPerLine: number,
): string[] {
  const lines: string[] = []
  for (const explicitLine of text.replace(/\r/g, '').split('\n')) {
    const characters = Array.from(explicitLine)
    if (characters.length === 0) {
      lines.push('')
      continue
    }
    let currentLine = ''
    let currentUnits = 0
    for (const character of characters) {
      const characterUnits = getMindMapTextCharacterUnits(character)
      if (
        currentLine.length > 0 &&
        currentUnits + characterUnits > charactersPerLine
      ) {
        lines.push(currentLine)
        currentLine = ''
        currentUnits = 0
      }
      currentLine += character
      currentUnits += characterUnits
    }
    lines.push(currentLine)
  }
  return lines
}

function getMindMapTextCharacterUnits(character: string): number {
  if (/^\p{Mark}$/u.test(character)) return 0

  const codePoint = character.codePointAt(0) ?? 0
  const isWide =
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)

  return isWide ? 2 : 1
}

function getMindMapTextLineUnits(text: string): number {
  return Array.from(text).reduce(
    (total, character) => total + getMindMapTextCharacterUnits(character),
    0,
  )
}

function getMindMapTextSegments(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].map(({ segment }) => segment)
}

function wrapMeasuredMindMapTopicText(
  text: string,
  maximumLineWidth: number,
  measureText: MindMapTopicTextMeasure,
  style: MindMapTopicTextMeasureStyle,
): string[] {
  const lines: string[] = []
  for (const explicitLine of text.replace(/\r/g, '').split('\n')) {
    const segments = getMindMapTextSegments(explicitLine)
    if (segments.length === 0) {
      lines.push('')
      continue
    }
    let currentLine = ''
    for (const segment of segments) {
      const candidate = currentLine + segment
      if (
        currentLine.length > 0 &&
        measureText(candidate, style) > maximumLineWidth
      ) {
        lines.push(currentLine)
        currentLine = segment
      } else {
        currentLine = candidate
      }
    }
    lines.push(currentLine)
  }
  return lines
}

export function measureMindMapTopicText(
  node: MindMapNode,
  width: number,
  config: MindMapLayoutConfig = defaultLayoutConfig,
  measureText?: MindMapTopicTextMeasure,
): MindMapTopicTextMetrics {
  const fontSize = node.style.fontSize
  const characterWidth = config.textCharacterWidth * (fontSize / 14)
  const charactersPerLine = Math.max(
    1,
    Math.floor(
      Math.max(characterWidth, width - config.horizontalPadding * 2) /
        characterWidth,
    ),
  )
  const style: MindMapTopicTextMeasureStyle = {
    fontFamily: node.style.fontFamily,
    fontSize,
    fontStyle: node.style.fontStyle,
    fontWeight: node.style.fontWeight,
  }
  const explicitLines = node.text.replace(/\r/g, '').split('\n')
  const maximumLineWidth = Math.max(
    characterWidth,
    width - config.horizontalPadding * 2,
  )
  const longestExplicitLine = Math.max(
    1,
    ...explicitLines.map(getMindMapTextLineUnits),
  )
  const naturalTextContentWidth = measureText
    ? Math.max(
        characterWidth,
        ...explicitLines.map((line) => measureText(line, style)),
      )
    : longestExplicitLine * characterWidth
  return {
    characterWidth,
    charactersPerLine,
    lineHeight: Math.ceil(fontSize * 1.35),
    lines: measureText
      ? wrapMeasuredMindMapTopicText(
          node.text,
          maximumLineWidth,
          measureText,
          style,
        )
      : wrapMindMapTopicText(node.text, charactersPerLine),
    naturalTextWidth: Math.ceil(
      naturalTextContentWidth + config.horizontalPadding * 2,
    ),
  }
}

/** Estimates a safe node size without DOM text measurement. */
export function estimateMindMapNodeSize(
  node: MindMapNode,
  config: MindMapLayoutConfig = defaultLayoutConfig,
  measureText?: MindMapTopicTextMeasure,
): MindMapNodeSize {
  const maximumNodeWidth = Math.max(80, config.maxNodeWidth)
  const fixedWidth =
    node.style.fixedWidth === undefined
      ? undefined
      : Math.min(maximumNodeWidth, Math.max(80, node.style.fixedWidth))
  const naturalContentBlockWidth = Math.max(
    0,
    ...node.contentBlocks.map((block) =>
      block.type === 'image' ? block.width : (block.width ?? 160),
    ),
  )
  const maximumMetrics = measureMindMapTopicText(
    node,
    fixedWidth ?? maximumNodeWidth,
    config,
    measureText,
  )
  const width =
    fixedWidth ??
    Math.min(
      maximumNodeWidth,
      Math.max(
        80,
        maximumMetrics.naturalTextWidth,
        naturalContentBlockWidth + config.horizontalPadding * 2,
      ),
    )
  const textMetrics = measureMindMapTopicText(node, width, config, measureText)
  const availableContentWidth = Math.max(
    1,
    width - config.horizontalPadding * 2,
  )
  const contentBlockHeight = node.contentBlocks.reduce((total, block) => {
    const naturalWidth =
      block.type === 'image' ? block.width : (block.width ?? 160)
    const naturalHeight =
      block.type === 'image'
        ? (block.height ?? Math.max(32, block.width * 0.75))
        : (block.height ?? 48)
    const scale = Math.min(1, availableContentWidth / naturalWidth)
    return total + naturalHeight * scale + 8
  }, 0)
  const textHeight = textMetrics.lines.length * textMetrics.lineHeight

  return {
    width,
    height: Math.max(
      config.nodeHeight,
      textHeight + contentBlockHeight + config.verticalPadding * 2,
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
      ? Math.min(config.maxNodeWidth, suppliedSize.width)
      : fallbackSize.width,
    height: isUsableDimension(suppliedSize?.height)
      ? suppliedSize.height
      : fallbackSize.height,
  }
}

export function createLayoutBounds(nodes: readonly LayoutNode[]): LayoutBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function translateSubtree(
  result: LayoutSubtreeResult,
  x: number,
  y: number,
): LayoutSubtreeResult {
  const nodes = result.nodes.map((node) => ({
    ...node,
    x: node.x + x,
    y: node.y + y,
  }))
  return {
    ...result,
    nodes,
    edges: result.edges.map((edge) => ({
      ...edge,
      sourcePort: {
        ...edge.sourcePort,
        x: edge.sourcePort.x + x,
        y: edge.sourcePort.y + y,
      },
      targetPort: {
        ...edge.targetPort,
        x: edge.targetPort.x + x,
        y: edge.targetPort.y + y,
      },
      sourceX: edge.sourceX + x,
      sourceY: edge.sourceY + y,
      targetX: edge.targetX + x,
      targetY: edge.targetY + y,
    })),
    bounds: createLayoutBounds(nodes),
  }
}

function getInheritedStructure(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapStructure {
  const lineage: MindMapNodeId[] = []
  let current = document.nodes[nodeId]
  while (current) {
    lineage.push(current.id)
    current = current.parentId ? document.nodes[current.parentId] : undefined
  }
  const ownerRootId = getOwningRootNodeId(document, nodeId)
  const floatingStructure = document.floatingTopics[ownerRootId]?.structure
  let structure = floatingStructure ?? document.defaultStructure
  for (const lineageNodeId of lineage.reverse()) {
    structure = document.structureOverrides[lineageNodeId] ?? structure
  }
  return structure
}

function layoutSubtreeInternal(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
  ownerRootNodeId: MindMapNodeId,
  inheritedStructure: MindMapStructure,
  config: MindMapLayoutConfig,
  options: MindMapLayoutOptions,
  registry: LayoutStrategyRegistry,
): LayoutSubtreeResult {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Mind map node not found: ${nodeId}`)
  const computedNode = {
    ...node,
    style: getComputedMindMapNodeStyle(document, node.id),
  }
  const structure = document.structureOverrides[nodeId] ?? inheritedStructure
  const childResults = node.collapsed
    ? []
    : node.childIds
        .filter(
          (childId) =>
            !options.visibleNodeIds || options.visibleNodeIds.has(childId),
        )
        .map((childId) =>
          layoutSubtreeInternal(
            document,
            childId,
            ownerRootNodeId,
            structure,
            config,
            options,
            registry,
          ),
        )
  return registry[structure].layout({
    document,
    rootNodeId: node.id,
    ownerRootNodeId,
    structure,
    nodeSize: resolveNodeSize(computedNode, options, config),
    childResults,
    config,
  })
}

/** Layouts one main, floating or ordinary subtree in its own local space. */
export function layoutMindMapSubtree(
  document: MindMapDocument,
  rootNodeId: MindMapNodeId,
  options: MindMapLayoutOptions = {},
): LayoutSubtreeResult {
  assertMindMapDocument(document)
  if (!document.nodes[rootNodeId]) {
    throw new Error(`Mind map node not found: ${rootNodeId}`)
  }
  const config = resolveConfig(options)
  const registry = options.strategyRegistry ?? defaultLayoutStrategyRegistry
  const ownerRootNodeId = getOwningRootNodeId(document, rootNodeId)
  return layoutSubtreeInternal(
    document,
    rootNodeId,
    ownerRootNodeId,
    getInheritedStructure(document, rootNodeId),
    config,
    options,
    registry,
  )
}

function anchorSubtree(
  result: LayoutSubtreeResult,
  anchor: { readonly x: number; readonly y: number },
): LayoutSubtreeResult {
  const root = result.nodes.find((node) => node.id === result.rootNodeId)
  if (!root) throw new Error('Layout subtree is missing its root topic')
  return translateSubtree(result, anchor.x - root.x, anchor.y - root.y)
}

function normalizeSubtree(result: LayoutSubtreeResult): LayoutSubtreeResult {
  return translateSubtree(result, -result.bounds.minX, -result.bounds.minY)
}

/**
 * Composes the main root and every floating root in the same content coordinate
 * system. Floating anchors are never rewritten by automatic layout.
 */
export function layoutMindMap(
  document: MindMapDocument,
  options: MindMapLayoutOptions = {},
): MindMapLayoutResult {
  assertMindMapDocument(document)
  const roots = [
    normalizeSubtree(
      layoutMindMapSubtree(document, document.rootNodeId, options),
    ),
    ...Object.entries(document.floatingTopics)
      .filter(
        ([rootNodeId]) =>
          !options.visibleNodeIds || options.visibleNodeIds.has(rootNodeId),
      )
      .map(([rootNodeId, placement]) =>
        anchorSubtree(layoutMindMapSubtree(document, rootNodeId, options), {
          x: placement.x,
          y: placement.y,
        }),
      ),
  ]
  const nodes = roots.flatMap((root) => root.nodes)
  const edges = roots.flatMap((root) => root.edges)
  const bounds = createLayoutBounds(nodes)
  return {
    nodes,
    edges,
    roots,
    bounds,
    width: bounds.width,
    height: bounds.height,
  }
}
