import { describe, expect, it } from 'vitest'

import {
  createFiveHundredNodeFixture,
  createMindMapNode,
  createV3FeatureFixture,
  createWideTreeFixture,
  executeMindMapCommand,
  mindMapCommandTypes,
  mindMapStructures,
  type MindMapDocument,
  type MindMapStructure,
} from '@opentools/mindmap-core'

import {
  defaultLayoutStrategyRegistry,
  layoutMindMap,
  layoutMindMapSubtree,
} from './index'

function appendNode(
  document: MindMapDocument,
  parentId: string,
  nodeId: string,
  text = nodeId,
): void {
  document.nodes[parentId]!.childIds.push(nodeId)
  document.nodes[nodeId] = createMindMapNode({
    id: nodeId,
    parentId,
    text,
  })
}

function node(result: ReturnType<typeof layoutMindMap>, nodeId: string) {
  const match = result.nodes.find(({ id }) => id === nodeId)
  if (!match) throw new Error(`Missing layout node: ${nodeId}`)
  return match
}

describe('layout strategy registry', () => {
  it('exposes every platform-neutral structure through one contract', () => {
    expect(Object.keys(defaultLayoutStrategyRegistry).sort()).toEqual(
      [...mindMapStructures].sort(),
    )
    for (const structure of mindMapStructures) {
      expect(defaultLayoutStrategyRegistry[structure]).toMatchObject({
        id: structure,
      })
      expect(defaultLayoutStrategyRegistry[structure].layout).toBeTypeOf(
        'function',
      )
    }
  })

  it('mirrors left and right logic layouts with stable ports and variable sizes', () => {
    const document = createWideTreeFixture(2)
    appendNode(
      document,
      'wide-1',
      'wide-1-child',
      'A long child label that wraps safely',
    )
    const options = {
      nodeSizes: {
        root: { width: 200, height: 72 },
        'wide-1': { width: 280, height: 90 },
        'wide-2': { width: 120, height: 44 },
      },
    }

    document.defaultStructure = 'logic-right'
    const right = layoutMindMap(document, options)
    expect(node(right, 'wide-1').x).toBeGreaterThan(node(right, 'root').x)
    expect(right.edges[0]).toMatchObject({
      structure: 'logic-right',
      sourcePort: { side: 'east' },
      targetPort: { side: 'west' },
    })

    document.defaultStructure = 'logic-left'
    const left = layoutMindMap(document, options)
    expect(node(left, 'wide-1').x).toBeLessThan(node(left, 'root').x)
    expect(left.edges[0]).toMatchObject({
      structure: 'logic-left',
      sourcePort: { side: 'west' },
      targetPort: { side: 'east' },
    })
    expect(left.bounds.width).toBeGreaterThan(0)
    expect(left.bounds.height).toBeGreaterThan(0)
  })

  it('derives stable balanced sides that do not change after sibling reorder', () => {
    const document = createWideTreeFixture(6)
    document.defaultStructure = 'mind-map-balanced'
    const initial = layoutMindMap(document)
    const initialSides = Object.fromEntries(
      document.nodes.root!.childIds.map((nodeId) => [
        nodeId,
        node(initial, nodeId).logicalSide,
      ]),
    )
    document.nodes.root!.childIds.reverse()
    const reordered = layoutMindMap(document)
    const reorderedSides = Object.fromEntries(
      document.nodes.root!.childIds.map((nodeId) => [
        nodeId,
        node(reordered, nodeId).logicalSide,
      ]),
    )

    expect(reorderedSides).toEqual(initialSides)
    expect(new Set(Object.values(initialSides))).toEqual(
      new Set(['left', 'right']),
    )
    const root = node(initial, 'root')
    expect(initial.nodes.some((item) => item.x < root.x)).toBe(true)
    expect(initial.nodes.some((item) => item.x > root.x)).toBe(true)
  })

  it.each([
    ['tree-top', 'curve'],
    ['org-top', 'elbow'],
  ] as const)(
    'lays out %s from top to bottom with %s connectors',
    (structure, connectorShape) => {
      const document = createWideTreeFixture(3)
      document.defaultStructure = structure
      const result = layoutMindMap(document, {
        nodeSizes: {
          root: { width: 260, height: 80 },
          'wide-1': { width: 100, height: 50 },
          'wide-2': { width: 300, height: 110 },
        },
      })
      const root = node(result, 'root')
      for (const childId of document.nodes.root!.childIds) {
        expect(node(result, childId).y).toBeGreaterThan(root.y + root.height)
      }
      expect(
        result.edges.every((edge) => edge.connectorShape === connectorShape),
      ).toBe(true)
      expect(result.edges[0]).toMatchObject({
        sourcePort: { side: 'south' },
        targetPort: { side: 'north' },
      })
    },
  )
})

describe('mixed and floating layout composition', () => {
  it('switches default and subtree structures only through reversible commands', () => {
    const document = createWideTreeFixture(2)
    appendNode(document, 'wide-1', 'nested')
    const changedDefault = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setDefaultStructure,
        label: 'Use tree layout',
        payload: { structure: 'tree-top' },
      },
      { now: '2026-07-15T02:00:00.000Z' },
    )
    expect(layoutMindMap(changedDefault.document).edges[0]).toMatchObject({
      structure: 'tree-top',
      sourcePort: { side: 'south' },
    })
    expect(
      executeMindMapCommand(changedDefault.document, changedDefault.inverse, {
        now: '2026-07-15T02:00:01.000Z',
      }).document.defaultStructure,
    ).toBe(document.defaultStructure)

    const changedBranch = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setNodeStructure,
        label: 'Use org layout for branch',
        payload: { nodeId: 'wide-1', structure: 'org-top' },
      },
      { now: '2026-07-15T02:00:02.000Z' },
    )
    expect(
      layoutMindMap(changedBranch.document).edges.find(
        ({ id }) => id === 'wide-1->nested',
      ),
    ).toMatchObject({ structure: 'org-top', connectorShape: 'elbow' })
    expect(
      executeMindMapCommand(changedBranch.document, changedBranch.inverse, {
        now: '2026-07-15T02:00:03.000Z',
      }).document.structureOverrides,
    ).not.toHaveProperty('wide-1')
  })

  it('composes nearest overrides and all floating anchors into complete bounds', () => {
    const document = createV3FeatureFixture()
    appendNode(document, 'wide-1', 'org-child')
    appendNode(document, 'wide-2', 'left-child')
    const beforePlacements = Object.fromEntries(
      Object.entries(document.floatingTopics).map(([nodeId, placement]) => [
        nodeId,
        { ...placement },
      ]),
    )
    const result = layoutMindMap(document)

    expect(result.nodes).toHaveLength(Object.keys(document.nodes).length)
    expect(result.roots.map(({ rootNodeId }) => rootNodeId)).toEqual([
      'root',
      'floating-root',
      'floating-root-2',
    ])
    expect(node(result, 'floating-root')).toMatchObject({ x: 640, y: -160 })
    expect(node(result, 'floating-root-2')).toMatchObject({ x: -480, y: 220 })
    expect(
      result.edges.find(({ id }) => id === 'wide-1->org-child'),
    ).toMatchObject({ structure: 'org-top', connectorShape: 'elbow' })
    expect(
      result.edges.find(({ id }) => id === 'wide-2->left-child'),
    ).toMatchObject({
      structure: 'logic-left',
      sourcePort: { side: 'west' },
    })
    expect(result.bounds.minX).toBeLessThanOrEqual(-480)
    expect(result.bounds.minY).toBeLessThanOrEqual(-160)
    expect(document.floatingTopics).toEqual(beforePlacements)

    const floatingOnly = layoutMindMapSubtree(document, 'floating-root')
    expect(floatingOnly.ownerRootNodeId).toBe('floating-root')
    expect(floatingOnly.nodes.map(({ id }) => id)).toEqual([
      'floating-root',
      'floating-child',
    ])
  })

  it('honors fixed widths and completes all structures on the 500-topic fixture', () => {
    const document = createFiveHundredNodeFixture()
    document.nodes['node-1']!.style.fixedWidth = 320
    document.nodes['node-1']!.styleOverrides.fixedWidth = 320
    for (const structure of mindMapStructures) {
      document.defaultStructure = structure as MindMapStructure
      const result = layoutMindMap(document)
      expect(result.nodes).toHaveLength(501)
      expect(result.edges).toHaveLength(500)
      expect(node(result, 'node-1').width).toBe(320)
      expect(Number.isFinite(result.bounds.width)).toBe(true)
      expect(Number.isFinite(result.bounds.height)).toBe(true)
    }
  }, 15_000)

  it('projects a filtered context without mutating collapse or hierarchy data', () => {
    const document = createWideTreeFixture(3)
    appendNode(document, 'wide-1', 'nested')
    document.nodes['wide-1']!.collapsed = true
    const originalChildIds = [...document.nodes['wide-1']!.childIds]

    const result = layoutMindMap(document, {
      visibleNodeIds: new Set(['root', 'wide-1']),
    })

    expect(result.nodes.map(({ id }) => id)).toEqual(['root', 'wide-1'])
    expect(document.nodes['wide-1']!.collapsed).toBe(true)
    expect(document.nodes['wide-1']!.childIds).toEqual(originalChildIds)
  })
})
