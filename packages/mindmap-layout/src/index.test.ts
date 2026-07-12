import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
} from '@opentools/mindmap-core'

import { layoutMindMap } from './index'

describe('left-to-right mind map layout', () => {
  it('places a child to the right of its parent', () => {
    const document = createMindMapDocument({
      id: 'map-1',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-12T00:00:00.000Z',
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
    expect(result.edges).toHaveLength(1)
  })
})
