import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
} from '@opentools/mindmap-core'
import { layoutMindMap } from '@opentools/mindmap-layout'

import {
  createCubicConnectorPath,
  createMindMapSvgScene,
  serializeMindMapSvgScene,
} from './index'

function createSceneDocument() {
  const document = createMindMapDocument({
    id: 'scene-map',
    rootNodeId: 'root',
    title: 'Export <safe>',
    now: '2026-07-15T00:00:00.000Z',
  })
  document.nodes.root!.markers = [
    { kind: 'priority', value: '1' },
    { kind: 'status', value: 'in-progress' },
    { kind: 'icon', value: 'star' },
  ]
  document.nodes.root!.childIds.push('child')
  document.nodes.child = createMindMapNode({
    id: 'child',
    parentId: 'root',
    text: 'A deliberately long child label that is wrapped into several text lines for SVG rendering',
    style: {
      backgroundColor: '#eefbf6',
      borderColor: '#20a779',
      textColor: '#0d5f46',
      shape: 'pill',
    },
  })
  document.relationships = [
    {
      id: 'relationship-1',
      fromNodeId: 'root',
      toNodeId: 'child',
      label: 'relates to',
    },
  ]
  document.boundaries = [
    { id: 'boundary-1', nodeIds: ['root', 'child'], label: 'Scope' },
  ]
  document.summaries = [
    { id: 'summary-1', nodeIds: ['root', 'child'], label: 'Key idea' },
  ]

  return document
}

describe('pure SVG scene builder', () => {
  it('builds styled nodes, marker presentation, stable connector paths and padded bounds', () => {
    const document = createSceneDocument()
    const layout = layoutMindMap(document)
    const scene = createMindMapSvgScene(document, layout, { padding: 24 })

    expect(scene.nodes).toHaveLength(2)
    expect(scene.nodes[0]?.markers).toEqual([
      expect.objectContaining({ kind: 'priority', label: 'P1' }),
      expect.objectContaining({ kind: 'status', label: 'in-progress' }),
      expect.objectContaining({ kind: 'icon', label: 'star' }),
    ])
    expect(scene.nodes[1]).toMatchObject({
      id: 'child',
      cornerRadius: expect.any(Number),
      fill: '#eefbf6',
    })
    expect(scene.nodes[1]?.textLines.length).toBeGreaterThan(1)
    expect(scene.connectors).toEqual([
      expect.objectContaining({
        id: 'root->child',
        path: createCubicConnectorPath(layout.edges[0]!),
      }),
    ])
    expect(scene.bounds).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    })
    expect(scene.relationships[0]).toMatchObject({
      id: 'relationship-1',
      label: 'relates to',
    })
    expect(scene.boundaries[0]).toMatchObject({
      id: 'boundary-1',
      label: 'Scope',
    })
    expect(scene.summaries[0]).toMatchObject({
      id: 'summary-1',
      label: 'Key idea',
    })
  })

  it('excludes collapsed descendants and serializes all visible text safely', () => {
    const document = createSceneDocument()
    document.nodes.child!.collapsed = true
    document.nodes.child!.childIds.push('hidden')
    document.nodes.hidden = createMindMapNode({
      id: 'hidden',
      parentId: 'child',
      text: 'Hidden descendant',
    })

    const layout = layoutMindMap(document)
    const scene = createMindMapSvgScene(document, layout)
    const svg = serializeMindMapSvgScene(scene)

    expect(scene.nodes.map((node) => node.id)).toEqual(['root', 'child'])
    expect(scene.connectors).toHaveLength(1)
    expect(svg).toContain('Export &lt;safe&gt;')
    expect(svg).toContain('A deliberately long child label')
    expect(svg).not.toContain('Hidden descendant')
    expect(svg).toContain('data-relationship-id="relationship-1"')
    expect(svg).toContain('data-boundary-id="boundary-1"')
    expect(svg).toContain('data-summary-id="summary-1"')

    document.relationships[0]!.toNodeId = 'hidden'
    document.boundaries[0]!.nodeIds = ['root', 'hidden']
    document.summaries[0]!.nodeIds = ['root', 'hidden']
    const collapsedScene = createMindMapSvgScene(
      document,
      layoutMindMap(document),
    )
    expect(collapsedScene.relationships).toEqual([])
    expect(collapsedScene.boundaries).toEqual([])
    expect(collapsedScene.summaries).toEqual([])
  })
})
