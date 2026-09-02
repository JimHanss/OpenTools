import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
} from '@opentools/mindmap-core'
import { layoutMindMap } from '@opentools/mindmap-layout'

import { createCubicConnectorPath } from './connector'

function createTwoNodeDocument() {
  const document = createMindMapDocument({
    id: 'connector-map',
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
  return document
}

describe('direction-aware connector paths', () => {
  it('curves outward through left-facing ports', () => {
    const document = createTwoNodeDocument()
    document.defaultStructure = 'logic-left'
    const edge = layoutMindMap(document).edges[0]!
    const path = createCubicConnectorPath(edge)

    expect(edge.sourcePort.side).toBe('west')
    expect(edge.targetPort.side).toBe('east')
    expect(path).toMatch(/^M .* C /)
    expect(path).not.toContain('NaN')
  })

  it('uses vertical curves for tree layouts and elbows for org charts', () => {
    const tree = createTwoNodeDocument()
    tree.defaultStructure = 'tree-top'
    const treeEdge = layoutMindMap(tree).edges[0]!
    expect(treeEdge.sourcePort.side).toBe('south')
    expect(createCubicConnectorPath(treeEdge)).toContain(' C ')

    const org = createTwoNodeDocument()
    org.defaultStructure = 'org-top'
    const orgEdge = layoutMindMap(org).edges[0]!
    expect(orgEdge.connectorShape).toBe('elbow')
    expect(createCubicConnectorPath(orgEdge).split(' L ')).toHaveLength(4)
  })
})
