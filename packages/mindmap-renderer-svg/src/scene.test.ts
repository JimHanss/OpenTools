import { describe, expect, it } from 'vitest'

import {
  createMindMapBoundary,
  createMindMapCallout,
  createMindMapDocument,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  createV3FeatureFixture,
  getMindMapThemePreset,
} from '@opentools/mindmap-core'
import {
  layoutMindMap,
  layoutMindMapSubtree,
  measureMindMapTopicText,
} from '@opentools/mindmap-layout'

import {
  createCubicConnectorPath,
  getMindMapEquationRenderKey,
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
    createMindMapRelationship({
      id: 'relationship-1',
      fromNodeId: 'root',
      toNodeId: 'child',
      label: 'relates to',
      controlPoints: [{ x: 36, y: -24 }],
      style: {
        color: '#dc2626',
        width: 4,
        pattern: 'dotted',
        startMarker: 'dot',
        labelColor: '#7f1d1d',
        labelFontSize: 14,
      },
    }),
  ]
  document.boundaries = [
    createMindMapBoundary({
      id: 'boundary-1',
      nodeIds: ['root', 'child'],
      label: 'Scope',
    }),
  ]
  document.summaries = [
    createMindMapSummary({
      id: 'summary-1',
      nodeIds: ['root', 'child'],
      label: 'Key idea',
    }),
  ]
  document.labels['label-safe'] = {
    id: 'label-safe',
    name: 'Roadmap <Q3>',
    color: '#7c3aed',
  }
  document.nodes.child!.labelIds = ['label-safe']
  document.callouts = [
    createMindMapCallout({
      id: 'callout-1',
      ownerNodeId: 'child',
      text: 'Check <details> & confirm',
      placement: 'right',
      offset: { x: 20, y: -10 },
      style: { backgroundColor: '#fffbeb', borderWidth: 3 },
    }),
  ]

  return document
}

describe('pure SVG scene builder', () => {
  it('keeps short topic text on one line and wraps only after its content width is used', () => {
    const document = createMindMapDocument({
      id: 'topic-text-width',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T08:30:00.000Z',
    })
    document.nodes.root!.childIds.push('short', 'long')
    document.nodes.short = createMindMapNode({
      id: 'short',
      parentId: 'root',
      text: 'Floating V2 topic',
    })
    const longText = 'A'.repeat(70)
    document.nodes.long = createMindMapNode({
      id: 'long',
      parentId: 'root',
      text: longText,
    })

    const scene = createMindMapSvgScene(document, layoutMindMap(document))
    const shortTopic = scene.nodes.find(({ id }) => id === 'short')!
    const longTopic = scene.nodes.find(({ id }) => id === 'long')!

    expect(shortTopic.textLines.map(({ text }) => text)).toEqual([
      'Floating V2 topic',
    ])
    expect(shortTopic.textLines[0]!.x - shortTopic.x).toBe(20)
    expect(longTopic.width).toBeGreaterThan(300)
    expect(longTopic.width).toBeLessThanOrEqual(350)
    expect(longTopic.textLines).toHaveLength(2)
    expect(longTopic.textLines.map(({ text }) => text).join('')).toBe(longText)
  })

  it('uses supplied topic text metrics instead of recomputing scene line breaks', () => {
    const document = createMindMapDocument({
      id: 'supplied-text-metrics',
      rootNodeId: 'root',
      title: 'OpenTools 思维导图1231231231',
      now: '2026-09-02T00:00:00.000Z',
    })
    const layout = layoutMindMap(document, {
      nodeSizes: { root: { width: 260, height: 78 } },
    })
    const fallbackMetrics = measureMindMapTopicText(document.nodes.root!, 260)
    const scene = createMindMapSvgScene(document, layout, {
      textMetricsByNodeId: {
        root: {
          ...fallbackMetrics,
          lines: ['OpenTools 思维导图', '1231231231'],
        },
      },
    })

    expect(scene.nodes[0]!.textLines.map(({ text }) => text)).toEqual([
      'OpenTools 思维导图',
      '1231231231',
    ])
  })

  it('uses one computed style model for themes, five shapes, text, borders and branches', () => {
    const document = createMindMapDocument({
      id: 'computed-style-scene',
      rootNodeId: 'root',
      title: 'Computed styles',
      now: '2026-07-15T08:30:00.000Z',
    })
    document.theme = getMindMapThemePreset('ocean')!
    const shapes = [
      'rounded-rectangle',
      'rectangle',
      'pill',
      'underline',
      'borderless',
    ] as const
    shapes.forEach((shape, index) => {
      const id = `shape-${index}`
      document.nodes.root!.childIds.push(id)
      document.nodes[id] = createMindMapNode({
        id,
        parentId: 'root',
        text: shape,
        style: {
          shape,
          borderColor: '#334455',
          borderWidth: 3,
          borderStyle: 'dashed',
          branchColor: '#445566',
          branchWidth: 4,
          branchStyle: 'dotted',
          branchShape: 'elbow',
          fontFamily: 'Georgia, Cambria, serif',
          fontSize: 19,
          fontWeight: 'bold',
          fontStyle: 'italic',
          textDecoration: 'line-through',
          textAlign: 'right',
        },
      })
    })

    const layout = layoutMindMap(document)
    document.theme.backgroundColor = '#ddeeff'
    const scene = createMindMapSvgScene(document, layout, {
      backgroundColor: '#ffffff',
    })
    const svg = serializeMindMapSvgScene(scene)

    expect(scene.background).toBe('#ffffff')
    expect(scene.nodes.slice(1).map(({ shape }) => shape)).toEqual(shapes)
    expect(scene.nodes[1]?.cornerRadius).toBe(10)
    expect(scene.nodes[2]?.cornerRadius).toBe(0)
    expect(scene.nodes[3]?.cornerRadius).toBe(
      Math.min(scene.nodes[3]!.width, scene.nodes[3]!.height) / 2,
    )
    expect(scene.nodes[1]).toMatchObject({
      stroke: '#334455',
      strokeWidth: 3,
      strokeDasharray: '8 5',
    })
    expect(scene.nodes[1]!.textLines[0]).toMatchObject({
      fontFamily: 'Georgia, Cambria, serif',
      fontSize: 19,
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'line-through',
      textAnchor: 'end',
    })
    expect(scene.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stroke: '#445566',
          strokeWidth: 4,
          strokeDasharray: '2 4',
        }),
      ]),
    )
    expect(svg).toContain('data-map-background="true"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('font-family="Georgia, Cambria, serif"')
    expect(svg).toContain('text-decoration="line-through"')
    expect(svg).toContain('<line ')
    expect(svg).not.toContain('foreignObject')
  })

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
      stroke: '#dc2626',
      strokeWidth: 4,
      strokeDasharray: '2 4',
      startMarker: 'dot',
    })
    expect(scene.relationships[0]?.controlPoints).toHaveLength(1)
    expect(scene.boundaries[0]).toMatchObject({
      id: 'boundary-1',
      label: 'Scope',
    })
    expect(scene.summaries[0]).toMatchObject({
      id: 'summary-1',
      label: 'Key idea',
    })
    expect(scene.labels).toEqual([
      expect.objectContaining({
        nodeId: 'child',
        labelId: 'label-safe',
        text: 'Roadmap <Q3>',
      }),
    ])
    expect(scene.callouts[0]).toMatchObject({
      id: 'callout-1',
      ownerNodeId: 'child',
      fill: '#fffbeb',
      strokeWidth: 3,
    })
    expect(scene.contentBounds.maxX).toBeGreaterThan(layout.bounds.maxX)
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
    expect(svg).toContain('Export &lt;safe')
    expect(svg).toContain('&gt;')
    expect(svg).toContain('A deliberately long child label')
    expect(svg).not.toContain('Hidden descendant')
    expect(svg).toContain('data-relationship-id="relationship-1"')
    expect(svg).toContain('data-boundary-id="boundary-1"')
    expect(svg).toContain('data-summary-id="summary-1"')
    expect(svg).toContain('data-label-id="label-safe"')
    expect(svg).toContain('Roadmap &lt;Q3&gt;')
    expect(svg).toContain('data-callout-id="callout-1"')
    expect(svg).toContain('Check &lt;details&gt; &amp; confirm')
    expect(svg).toContain('stroke-dasharray="2 4"')
    expect(serializeMindMapSvgScene(scene)).toBe(svg)

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

  it('includes only visible callouts for focused and floating layout roots', () => {
    const document = createV3FeatureFixture()
    document.callouts.push(
      createMindMapCallout({
        id: 'floating-callout',
        ownerNodeId: 'floating-root',
        text: 'Floating note',
      }),
    )
    const mainScene = createMindMapSvgScene(
      document,
      (() => {
        const root = layoutMindMapSubtree(document, 'root')
        return {
          nodes: root.nodes,
          edges: root.edges,
          roots: [root],
          bounds: root.bounds,
          width: root.bounds.width,
          height: root.bounds.height,
        }
      })(),
    )
    expect(mainScene.callouts.map(({ id }) => id)).toEqual(['callout-1'])

    const floatingScene = createMindMapSvgScene(
      document,
      (() => {
        const root = layoutMindMapSubtree(document, 'floating-root')
        return {
          nodes: root.nodes,
          edges: root.edges,
          roots: [root],
          bounds: root.bounds,
          width: root.bounds.width,
          height: root.bounds.height,
        }
      })(),
    )
    expect(floatingScene.callouts.map(({ id }) => id)).toEqual([
      'floating-callout',
    ])
  })

  it('keeps relationship control offsets stable when layout strategy changes', () => {
    const document = createSceneDocument()
    const assertRelativeControlOffset = () => {
      const layout = layoutMindMap(document)
      const scene = createMindMapSvgScene(document, layout)
      const from = layout.nodes.find(({ id }) => id === 'root')!
      const to = layout.nodes.find(({ id }) => id === 'child')!
      const midpoint = {
        x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
        y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
      }
      const control = scene.relationships[0]!.controlPoints[0]!
      expect({
        x: control.x - midpoint.x,
        y: control.y - midpoint.y,
      }).toEqual({ x: 36, y: -24 })
    }

    document.defaultStructure = 'logic-right'
    assertRelativeControlOffset()
    document.defaultStructure = 'tree-top'
    assertRelativeControlOffset()
    document.structureOverrides.child = 'org-top'
    assertRelativeControlOffset()
  })

  it('renders derived numbering as an independent SVG primitive', () => {
    const document = createSceneDocument()
    document.nodes.root!.numbering = {
      style: 'decimal',
      mode: 'hierarchical',
      startAt: 1,
    }
    const scene = createMindMapSvgScene(document, layoutMindMap(document))
    const childTextX = scene.nodes.find(({ id }) => id === 'child')
      ?.textLines[0]?.x

    expect(scene.numberings).toEqual([
      expect.objectContaining({ nodeId: 'child', text: '1' }),
    ])
    expect(childTextX).toBeGreaterThan(scene.numberings[0]!.x)
    expect(serializeMindMapSvgScene(scene)).toContain(
      'data-numbering-for="child"',
    )

    document.nodes.root!.numbering = undefined
    const withoutNumbering = createMindMapSvgScene(
      document,
      layoutMindMap(document),
    )
    expect(withoutNumbering.numberings).toEqual([])
    expect(document.nodes.child?.text).toContain('deliberately long')
  })

  it('renders ready images inline and uses stable loading/error placeholders', () => {
    const document = createV3FeatureFixture()
    const layout = layoutMindMap(document)
    const ready = createMindMapSvgScene(document, layout, {
      assets: {
        'asset-image': {
          id: 'asset-image',
          state: 'ready',
          href: 'data:image/png;base64,iVBORw0KGgo=',
        },
      },
    })
    expect(ready.images).toEqual([
      expect.objectContaining({
        id: 'content-image',
        nodeId: 'wide-1',
        assetId: 'asset-image',
        state: 'ready',
        width: 240,
        height: 135,
      }),
    ])
    const image = ready.images[0]!
    const node = ready.nodes.find(({ id }) => id === 'wide-1')!
    expect(image.x).toBeGreaterThanOrEqual(node.x)
    expect(image.y + image.height).toBeLessThanOrEqual(node.y + node.height)
    const svg = serializeMindMapSvgScene(ready)
    expect(svg).toContain('data-image-id="content-image"')
    expect(svg).toContain('href="data:image/png;base64,iVBORw0KGgo="')
    expect(svg).not.toContain('blob:')

    const loading = createMindMapSvgScene(document, layout, {
      assets: {
        'asset-image': { id: 'asset-image', state: 'loading' },
      },
    })
    expect(loading.images[0]?.state).toBe('loading')
    expect(serializeMindMapSvgScene(loading)).toContain(
      'data-image-state="loading"',
    )
    const missing = createMindMapSvgScene(document, layout)
    expect(missing.images[0]?.state).toBe('error')
    expect(serializeMindMapSvgScene(missing)).toContain(
      'data-image-state="error"',
    )
  })

  it('never serializes temporary Blob URLs and accepts supported inline formats', () => {
    const document = createV3FeatureFixture()
    const layout = layoutMindMap(document)
    const blobScene = createMindMapSvgScene(document, layout, {
      assets: {
        'asset-image': {
          id: 'asset-image',
          state: 'ready',
          href: 'blob:https://example.test/transient',
        },
      },
    })
    expect(() => serializeMindMapSvgScene(blobScene)).toThrow(
      'SVG export requires every ready image to use an inline data URI.',
    )

    for (const href of [
      'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      'data:image/svg+xml;base64,PHN2Zy8+',
      'data:image/webp;base64,UklGRg==',
    ]) {
      const scene = createMindMapSvgScene(document, layout, {
        assets: {
          'asset-image': { id: 'asset-image', state: 'ready', href },
        },
      })
      expect(serializeMindMapSvgScene(scene)).toContain(`href="${href}"`)
    }
  })

  it('renders equations as native SVG primitives with stable placeholders', () => {
    const document = createV3FeatureFixture()
    const layout = layoutMindMap(document)
    const equationKey = getMindMapEquationRenderKey(
      'wide-1',
      'content-equation',
    )
    const equationSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32" viewBox="0 0 80 32"><path id="equation-path" d="M0 16 H80" /></svg>'
    const ready = createMindMapSvgScene(document, layout, {
      equations: {
        [equationKey]: {
          id: equationKey,
          nodeId: 'wide-1',
          blockId: 'content-equation',
          state: 'ready',
          svg: equationSvg,
          width: 80,
          height: 32,
        },
      },
    })
    expect(ready.equations).toEqual([
      expect.objectContaining({
        id: equationKey,
        blockId: 'content-equation',
        state: 'ready',
        width: 80,
        height: 32,
      }),
    ])
    expect(ready.equations[0]!.y).toBeGreaterThan(ready.images[0]!.y)
    const svg = serializeMindMapSvgScene(ready)
    expect(svg).toContain('data-equation-id="content-equation"')
    expect(svg).toContain('<path id="equation-path"')
    expect(svg).not.toContain('foreignObject')

    const loading = createMindMapSvgScene(document, layout, {
      equations: {
        [equationKey]: {
          id: equationKey,
          nodeId: 'wide-1',
          blockId: 'content-equation',
          state: 'loading',
          width: 160,
          height: 48,
        },
      },
    })
    expect(serializeMindMapSvgScene(loading)).toContain(
      'data-equation-state="loading"',
    )
    const unsafe = createMindMapSvgScene(document, layout, {
      equations: {
        [equationKey]: {
          id: equationKey,
          nodeId: 'wide-1',
          blockId: 'content-equation',
          state: 'ready',
          svg: '<svg width="80" height="32"><script /></svg>',
          width: 80,
          height: 32,
        },
      },
    })
    expect(() => serializeMindMapSvgScene(unsafe)).toThrowError(
      'sanitized inline equation markup',
    )
  })
})
