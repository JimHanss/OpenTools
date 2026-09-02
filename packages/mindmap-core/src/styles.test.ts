import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  executeMindMapCommand,
  getComputedMindMapNodeStyle,
  getMindMapStyleScopeNodeIds,
  getMindMapThemePreset,
  getSharedComputedMindMapStyleValue,
  isValidMindMapNodeStyleOverride,
  mindMapCommandTypes,
  mindMapThemePresets,
  type MindMapCommand,
  type MindMapDocument,
} from './index'

const context = { now: '2026-07-15T08:00:00.000Z' }

function append(document: MindMapDocument, parentId: string, id: string): void {
  document.nodes[parentId]!.childIds.push(id)
  document.nodes[id] = createMindMapNode({ id, parentId, text: id })
}

function createStyleTree(): MindMapDocument {
  const document = createMindMapDocument({
    id: 'style-map',
    rootNodeId: 'root',
    title: 'Style map',
    now: context.now,
  })
  append(document, 'root', 'a')
  append(document, 'root', 'b')
  append(document, 'a', 'a-1')
  append(document, 'a', 'a-2')
  append(document, 'b', 'b-1')
  document.nodes.a!.notes = 'Keep this note'
  document.nodes.a!.links = [{ label: 'Keep', url: 'https://example.test' }]
  document.nodes.a!.labelIds = ['label-keep']
  document.labels['label-keep'] = {
    id: 'label-keep',
    name: 'Keep',
    color: '#663399',
  }
  return document
}

function apply(document: MindMapDocument, command: MindMapCommand) {
  return executeMindMapCommand(document, command, context)
}

describe('mind map computed styles', () => {
  it('cascades theme role defaults and top-level branch overrides', () => {
    const document = createStyleTree()
    const ocean = getMindMapThemePreset('ocean')!
    const themed = apply(document, {
      type: mindMapCommandTypes.updateTheme,
      label: 'Use ocean',
      payload: { theme: ocean },
    }).document
    const branch = apply(themed, {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Style branch',
      payload: {
        nodeId: 'a',
        style: {
          branchColor: '#123456',
          branchWidth: 5,
          branchStyle: 'dashed',
          branchShape: 'elbow',
        },
      },
    }).document

    expect(getComputedMindMapNodeStyle(branch, 'root')).toMatchObject(
      ocean.rootTopicStyle,
    )
    expect(getComputedMindMapNodeStyle(branch, 'b')).toMatchObject(
      ocean.mainTopicStyle,
    )
    expect(getComputedMindMapNodeStyle(branch, 'a-1')).toMatchObject({
      ...ocean.subtopicStyle,
      branchColor: '#123456',
      branchWidth: 5,
      branchStyle: 'dashed',
      branchShape: 'elbow',
    })
  })

  it('keeps explicit overrides across theme changes and resets exact keys', () => {
    const document = createStyleTree()
    const styled = apply(document, {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Style topic',
      payload: {
        nodeId: 'a',
        style: { shape: 'pill', textColor: '#112233', fontSize: 27 },
      },
    })
    const themed = apply(styled.document, {
      type: mindMapCommandTypes.updateTheme,
      label: 'Use forest',
      payload: { theme: getMindMapThemePreset('forest')! },
    })
    const reset = apply(themed.document, {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Reset shape',
      payload: { nodeId: 'a', style: {}, resetKeys: ['shape'] },
    })

    expect(getComputedMindMapNodeStyle(themed.document, 'a')).toMatchObject({
      shape: 'pill',
      textColor: '#112233',
      fontSize: 27,
    })
    expect(reset.document.nodes.a!.styleOverrides).not.toHaveProperty('shape')
    expect(getComputedMindMapNodeStyle(reset.document, 'a').shape).toBe(
      getMindMapThemePreset('forest')!.mainTopicStyle.shape ??
        'rounded-rectangle',
    )
    expect(apply(reset.document, reset.inverse).document).toEqual(
      themed.document,
    )
    expect(apply(themed.document, themed.inverse).document).toEqual(
      styled.document,
    )
  })

  it('reports shared and mixed values without mutating the document', () => {
    const document = createStyleTree()
    const before = JSON.stringify(document)
    const shared = getSharedComputedMindMapStyleValue(
      document,
      ['a', 'b'],
      'shape',
    )
    const styled = apply(document, {
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Style one',
      payload: { nodeId: 'a', style: { shape: 'pill' } },
    }).document

    expect(shared).toEqual({ state: 'value', value: 'rounded-rectangle' })
    expect(
      getSharedComputedMindMapStyleValue(styled, ['a', 'b'], 'shape'),
    ).toEqual({ state: 'mixed' })
    expect(JSON.stringify(document)).toBe(before)
  })

  it('resolves current, sibling, descendant and level scopes deterministically', () => {
    const document = createStyleTree()

    expect(getMindMapStyleScopeNodeIds(document, ['a'], 'current')).toEqual([
      'a',
    ])
    expect(getMindMapStyleScopeNodeIds(document, ['a'], 'siblings')).toEqual([
      'a',
      'b',
    ])
    expect(getMindMapStyleScopeNodeIds(document, ['a'], 'descendants')).toEqual(
      ['a-1', 'a-2'],
    )
    expect(getMindMapStyleScopeNodeIds(document, ['a-1'], 'level')).toEqual([
      'a-1',
      'a-2',
      'b-1',
    ])
  })
})

describe('mind map style commands', () => {
  it('supports all five shapes as an atomic batch with an exact inverse', () => {
    const document = createStyleTree()
    const shapes = [
      'rounded-rectangle',
      'rectangle',
      'pill',
      'underline',
      'borderless',
    ] as const
    const nodeIds = ['root', 'a', 'a-1', 'b', 'b-1'] as const
    const command: MindMapCommand = {
      type: mindMapCommandTypes.batch,
      label: 'Apply five shapes',
      payload: {
        commands: nodeIds.map((nodeId, index) => ({
          type: mindMapCommandTypes.updateNodeStyle,
          label: 'Set shape',
          payload: { nodeId, style: { shape: shapes[index]! } },
        })),
      },
    }
    const result = apply(document, command)

    expect(
      nodeIds.map(
        (id) => getComputedMindMapNodeStyle(result.document, id).shape,
      ),
    ).toEqual(shapes)
    expect(apply(result.document, result.inverse).document).toEqual(document)
  })

  it('preserves content and metadata during style-only batches', () => {
    const document = createStyleTree()
    const protectedData = {
      text: document.nodes.a!.text,
      notes: document.nodes.a!.notes,
      links: document.nodes.a!.links.map((link) => ({ ...link })),
      labelIds: [...document.nodes.a!.labelIds],
      childIds: [...document.nodes.a!.childIds],
    }
    const result = apply(document, {
      type: mindMapCommandTypes.batch,
      label: 'Style siblings',
      payload: {
        commands: ['a', 'b'].map((nodeId) => ({
          type: mindMapCommandTypes.updateNodeStyle,
          label: 'Style topic',
          payload: {
            nodeId,
            style: {
              fontFamily: 'Georgia, Cambria, serif',
              fontSize: 20,
              fontWeight: 'bold',
              fontStyle: 'italic',
              textDecoration: 'line-through',
              textAlign: 'right',
              borderWidth: 4,
              borderStyle: 'dotted',
              fixedWidth: 240,
            },
          },
        })),
      },
    })

    expect(result.document.nodes.a).toMatchObject(protectedData)
    expect(apply(result.document, result.inverse).document).toEqual(document)
  })

  it('validates style limits and exposes four built-in valid themes', () => {
    expect(mindMapThemePresets.map(({ id }) => id)).toEqual([
      'classic',
      'ocean',
      'forest',
      'sunset',
    ])
    expect(
      isValidMindMapNodeStyleOverride({ fontSize: 8, borderWidth: 20 }),
    ).toBe(true)
    expect(isValidMindMapNodeStyleOverride({ fontSize: 7 })).toBe(false)
    expect(isValidMindMapNodeStyleOverride({ fixedWidth: 801 })).toBe(false)
    expect(() =>
      apply(createStyleTree(), {
        type: mindMapCommandTypes.updateNodeStyle,
        label: 'Invalid style',
        payload: { nodeId: 'a', style: { branchWidth: 21 } },
      }),
    ).toThrow()
  })
})
