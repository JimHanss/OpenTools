import { describe, expect, it } from 'vitest'

import {
  executeMindMapCommand,
  createMindMapDocument,
  createMindMapNode,
  mindMapCommandTypes,
} from '@opentools/mindmap-core'

import {
  createBatchMoveCommand,
  createBatchStyleCommand,
  createChildNodeCommand,
  createDeleteNodesCommand,
  createSiblingNodeCommand,
} from './actions'

describe('editor command builders', () => {
  it('creates sibling and child commands without bypassing core commands', () => {
    const document = createMindMapDocument({
      id: 'map',
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

    expect(
      createSiblingNodeCommand(document, 'child', 'sibling'),
    ).toMatchObject({
      type: mindMapCommandTypes.createNode,
      payload: { parentId: 'root', index: 1, node: { id: 'sibling' } },
    })
    expect(
      createSiblingNodeCommand(document, 'root', 'root-child'),
    ).toMatchObject({
      payload: { parentId: 'root', index: 1, node: { id: 'root-child' } },
    })
    expect(
      createChildNodeCommand(document, 'child', 'grandchild'),
    ).toMatchObject({
      payload: { parentId: 'child', index: 0, node: { id: 'grandchild' } },
    })
    expect(
      createChildNodeCommand(document, 'child', 'localized', '新主题'),
    ).toMatchObject({ payload: { node: { text: '新主题' } } })
    expect(createDeleteNodesCommand(['child'])).toMatchObject({
      type: mindMapCommandTypes.deleteSubtree,
      payload: { nodeIds: ['child'] },
    })
  })

  it('styles actual selections while normalizing parent and descendant move actions', () => {
    const document = createMindMapDocument({
      id: 'map',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.nodes.root!.childIds.push('parent', 'destination')
    document.nodes.parent = createMindMapNode({
      id: 'parent',
      parentId: 'root',
      text: 'Parent',
      childIds: ['child'],
    })
    document.nodes.child = createMindMapNode({
      id: 'child',
      parentId: 'parent',
      text: 'Child',
    })
    document.nodes.destination = createMindMapNode({
      id: 'destination',
      parentId: 'root',
      text: 'Destination',
    })

    const style = createBatchStyleCommand(document, ['parent', 'child'], {
      backgroundColor: '#fff1f1',
    })
    expect(style).toMatchObject({
      type: mindMapCommandTypes.batch,
      payload: {
        commands: [
          { payload: { nodeId: 'parent' } },
          { payload: { nodeId: 'child' } },
        ],
      },
    })

    const styled = executeMindMapCommand(document, style, {
      now: '2026-07-15T00:00:01.000Z',
    }).document
    expect(styled.nodes.parent?.style.backgroundColor).toBe('#fff1f1')
    expect(styled.nodes.child?.style.backgroundColor).toBe('#fff1f1')

    const move = createBatchMoveCommand(
      document,
      ['parent', 'child'],
      'destination',
      0,
    )
    expect(move).toMatchObject({
      type: mindMapCommandTypes.batch,
      payload: {
        commands: [
          {
            type: mindMapCommandTypes.moveNode,
            payload: { nodeId: 'parent', parentId: 'destination', index: 0 },
          },
        ],
      },
    })
  })

  it('uses an index after removal when moving one selected sibling', () => {
    const document = createMindMapDocument({
      id: 'map',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.nodes.root!.childIds.push('first', 'second')
    document.nodes.first = createMindMapNode({
      id: 'first',
      parentId: 'root',
      text: 'First',
    })
    document.nodes.second = createMindMapNode({
      id: 'second',
      parentId: 'root',
      text: 'Second',
    })

    const move = createBatchMoveCommand(document, ['first'], 'root', 2)
    const moved = executeMindMapCommand(document, move, {
      now: '2026-07-15T00:00:01.000Z',
    }).document

    expect(moved.nodes.root?.childIds).toEqual(['second', 'first'])
  })
})
