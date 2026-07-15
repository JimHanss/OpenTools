import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  MindMapValidationError,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import { defaultLayoutConfig, layoutMindMap } from './index'

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
    expect(
      safeFallbackResult.nodes.find((node) => node.id === 'root'),
    ).toMatchObject({
      width: defaultLayoutConfig.nodeWidth,
      height: defaultLayoutConfig.nodeHeight,
    })
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
    expect(root!.width).toBeGreaterThanOrEqual(defaultLayoutConfig.nodeWidth)
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
