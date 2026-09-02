import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  MindMapValidationError,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import {
  defaultLayoutConfig,
  estimateMindMapNodeSize,
  layoutMindMap,
  measureMindMapTopicText,
} from './index'

function appendNode(
  document: MindMapDocument,
  parentId: string,
  nodeId: string,
  text = nodeId,
): void {
  const parent = document.nodes[parentId]
  if (!parent) throw new Error(`Missing test parent: ${parentId}`)

  parent.childIds.push(nodeId)
  document.nodes[nodeId] = createMindMapNode({
    id: nodeId,
    parentId,
    text,
  })
}

function createDeepTree(depth: number): MindMapDocument {
  const document = createMindMapDocument({
    id: 'deep-map',
    rootNodeId: 'root',
    title: 'Root',
    now: '2026-07-15T00:00:00.000Z',
  })
  let parentId = 'root'

  for (let level = 1; level <= depth; level += 1) {
    const nodeId = `deep-${level}`
    appendNode(document, parentId, nodeId, `Depth ${level}`)
    parentId = nodeId
  }

  return document
}

function createFiveHundredNodeTree(): MindMapDocument {
  const document = createMindMapDocument({
    id: 'large-map',
    rootNodeId: 'root',
    title: 'Root',
    now: '2026-07-15T00:00:00.000Z',
  })

  for (let index = 1; index <= 500; index += 1) {
    const parentId = index <= 20 ? 'root' : `node-${Math.floor(index / 20)}`
    appendNode(document, parentId, `node-${index}`, `Node ${index}`)
  }

  return document
}

describe('left-to-right mind map layout', () => {
  it('places a child to the right of its parent with stable connector endpoints', () => {
    const document = createMindMapDocument({
      id: 'map-1',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.nodes.root!.childIds.push('child')
    document.nodes.child = createMindMapNode({
      id: 'child',
      parentId: 'root',
      text: 'Child',
    })

    const result = layoutMindMap(document)
    const root = result.nodes.find((node) => node.id === 'root')
    const child = result.nodes.find((node) => node.id === 'child')

    expect(root).toBeDefined()
    expect(child).toBeDefined()
    expect(child!.x).toBeGreaterThan(root!.x)
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'root->child',
        sourceX: root!.x + root!.width,
        targetX: child!.x,
      }),
    ])
  })

  it('uses supplied measurements and returns content-complete bounds', () => {
    const document = createMindMapDocument({
      id: 'wide-map',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T00:00:00.000Z',
    })
    appendNode(document, 'root', 'wide-1', 'Wide 1')
    appendNode(document, 'root', 'wide-2', 'Wide 2')
    const result = layoutMindMap(document, {
      nodeSizes: {
        root: { width: 220, height: 80 },
        'wide-1': { width: 320, height: 96 },
        'wide-2': { width: 120, height: 40 },
      },
    })
    const firstChild = result.nodes.find((node) => node.id === 'wide-1')!
    const secondChild = result.nodes.find((node) => node.id === 'wide-2')!

    expect(firstChild).toMatchObject({ width: 320, height: 96 })
    expect(secondChild.y).toBeGreaterThanOrEqual(
      firstChild.y + firstChild.height + defaultLayoutConfig.verticalGap,
    )
    expect(result.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: Math.max(...result.nodes.map((node) => node.x + node.width)),
      maxY: Math.max(...result.nodes.map((node) => node.y + node.height)),
      width: result.width,
      height: result.height,
    })

    const safeFallbackResult = layoutMindMap(document, {
      nodeSizes: { root: { width: -1, height: 0 } },
    })
    const fallbackRoot = safeFallbackResult.nodes.find(
      (node) => node.id === 'root',
    )!
    expect(fallbackRoot.width).toBe(80)
    expect(fallbackRoot.height).toBeGreaterThanOrEqual(
      defaultLayoutConfig.nodeHeight,
    )
  })

  it('caps supplied measurements at the configured topic width', () => {
    const document = createMindMapDocument({
      id: 'measured-width-cap',
      rootNodeId: 'root',
      title: 'Measured width cap',
      now: '2026-07-15T00:00:00.000Z',
    })
    const result = layoutMindMap(document, {
      nodeSizes: { root: { width: 800, height: 72 } },
    })

    expect(result.nodes[0]).toMatchObject({ width: 350, height: 72 })
  })

  it('estimates larger dimensions for long multiline labels without DOM APIs', () => {
    const document = createMindMapDocument({
      id: 'long-label',
      rootNodeId: 'root',
      title:
        'A deliberately long root title that needs more than one visual line\nSecond line',
      now: '2026-07-15T00:00:00.000Z',
    })
    const result = layoutMindMap(document)
    const root = result.nodes[0]

    expect(root).toMatchObject({ id: 'root' })
    expect(root!.height).toBeGreaterThan(defaultLayoutConfig.nodeHeight)
    expect(root!.width).toBeGreaterThan(defaultLayoutConfig.nodeWidth)
    expect(root!.width).toBeLessThanOrEqual(350)
  })

  it('uses 20 pixel topic padding and caps legacy fixed widths at 350 pixels', () => {
    const document = createMindMapDocument({
      id: 'topic-size-rules',
      rootNodeId: 'root',
      title: 'Short title',
      now: '2026-07-20T00:00:00.000Z',
    })

    expect(defaultLayoutConfig.horizontalPadding).toBe(20)
    expect(defaultLayoutConfig.verticalPadding).toBe(20)
    expect(layoutMindMap(document).nodes[0]!.width).toBeLessThan(
      defaultLayoutConfig.nodeWidth,
    )

    document.nodes.root!.style.fixedWidth = 800
    document.nodes.root!.styleOverrides.fixedWidth = 800
    expect(layoutMindMap(document).nodes[0]!.width).toBe(350)
  })

  it('grows automatic topics naturally and wraps mixed text only at the maximum width', () => {
    const document = createMindMapDocument({
      id: 'automatic-topic-width',
      rootNodeId: 'root',
      title: '短主题',
      now: '2026-09-02T00:00:00.000Z',
    })

    const short = layoutMindMap(document).nodes[0]!
    expect(short.width).toBeGreaterThanOrEqual(80)
    expect(short.width).toBeLessThan(defaultLayoutConfig.nodeWidth)
    expect(short.height).toBeGreaterThanOrEqual(defaultLayoutConfig.nodeHeight)

    document.nodes.root!.text = `${'连续中文😀'.repeat(20)}Supercalifragilisticexpialidocious`
    const long = layoutMindMap(document).nodes[0]!
    expect(long.width).toBe(defaultLayoutConfig.maxNodeWidth)
    expect(long.height).toBeGreaterThan(short.height)

    document.nodes.root!.style.fixedWidth = 220
    document.nodes.root!.styleOverrides.fixedWidth = 220
    expect(layoutMindMap(document).nodes[0]!.width).toBe(220)
  })

  it('reserves full-width space for mixed ASCII and Chinese topic text', () => {
    const node = createMindMapNode({
      id: 'mixed-width-topic',
      parentId: 'root',
      text: '1123新主题',
    })

    const size = estimateMindMapNodeSize(node)
    const metrics = measureMindMapTopicText(node, size.width)

    expect(size.width).toBeGreaterThanOrEqual(116)
    expect(metrics.lines).toEqual(['1123新主题'])

    node.style.fixedWidth = 98
    node.styleOverrides.fixedWidth = 98
    const fixedSize = estimateMindMapNodeSize(node)
    expect(fixedSize.width).toBe(98)
    expect(measureMindMapTopicText(node, fixedSize.width).lines).toEqual([
      '1123新',
      '主题',
    ])
  })

  it('accepts proportional font measurement without coupling layout to a browser API', () => {
    const node = createMindMapNode({
      id: 'proportional-topic',
      parentId: 'root',
      text: 'Wide iii 思维😀',
    })
    const measureText = (text: string) =>
      Array.from(text).reduce(
        (width, character) =>
          width +
          (character === 'i'
            ? 3
            : /[\u2e80-\u9fff]|\p{Extended_Pictographic}/u.test(character)
              ? 14
              : 8),
        0,
      )

    const size = estimateMindMapNodeSize(node, defaultLayoutConfig, measureText)
    const metrics = measureMindMapTopicText(
      node,
      size.width,
      defaultLayoutConfig,
      measureText,
    )

    expect(size.width).toBe(134)
    expect(metrics.lines).toEqual(['Wide iii 思维😀'])
    expect(metrics.naturalTextWidth).toBe(size.width)
  })

  it('reserves stable intrinsic space for image content blocks', () => {
    const document = createMindMapDocument({
      id: 'image-layout',
      rootNodeId: 'root',
      title: 'Image topic',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.assets.image = {
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 10,
      checksum: 'sha256:image',
      intrinsicWidth: 400,
      intrinsicHeight: 200,
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    document.nodes.root!.contentBlocks = [
      {
        id: 'image-block',
        type: 'image',
        assetId: 'image',
        width: 300,
        height: 150,
        altText: 'Diagram',
        preserveAspectRatio: true,
      },
    ]

    const root = layoutMindMap(document).nodes[0]!
    expect(root.width).toBeGreaterThanOrEqual(
      300 + defaultLayoutConfig.horizontalPadding * 2,
    )
    expect(root.height).toBeGreaterThan(
      150 + defaultLayoutConfig.verticalPadding * 2,
    )
  })

  it('reserves persisted and fallback intrinsic space for equation blocks', () => {
    const document = createMindMapDocument({
      id: 'equation-layout',
      rootNodeId: 'root',
      title: 'Equation topic',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.nodes.root!.contentBlocks = [
      {
        id: 'equation-block',
        type: 'equation',
        source: String.raw`\sum_{i=1}^{n} i`,
        displayMode: 'block',
        width: 360,
        height: 72,
      },
    ]
    const measured = layoutMindMap(document).nodes[0]!
    expect(measured.width).toBe(350)
    expect(measured.height).toBeGreaterThan(
      72 * (310 / 360) + defaultLayoutConfig.verticalPadding * 2,
    )

    document.nodes.root!.contentBlocks[0] = {
      id: 'equation-block',
      type: 'equation',
      source: String.raw`x^2`,
      displayMode: 'block',
    }
    const fallback = layoutMindMap(document).nodes[0]!
    expect(fallback.width).toBeGreaterThanOrEqual(
      160 + defaultLayoutConfig.horizontalPadding * 2,
    )
    expect(fallback.height).toBeGreaterThan(
      48 + defaultLayoutConfig.verticalPadding * 2,
    )
  })

  it('excludes collapsed descendants while preserving layout for the collapsed node', () => {
    const document = createDeepTree(3)
    document.nodes['deep-1']!.collapsed = true

    const result = layoutMindMap(document)

    expect(result.nodes.map((node) => node.id)).toEqual(['root', 'deep-1'])
    expect(result.edges.map((edge) => edge.id)).toEqual(['root->deep-1'])
  })

  it('validates malformed trees and handles a 500-node map', () => {
    const invalidDocument = createDeepTree(1)
    invalidDocument.nodes.root!.childIds.push('deep-1')
    expect(() => layoutMindMap(invalidDocument)).toThrow(MindMapValidationError)

    const largeResult = layoutMindMap(createFiveHundredNodeTree())
    expect(largeResult.nodes).toHaveLength(501)
    expect(largeResult.edges).toHaveLength(500)
    expect(largeResult.bounds.width).toBeGreaterThan(0)
    expect(largeResult.bounds.height).toBeGreaterThan(0)
  })
})
