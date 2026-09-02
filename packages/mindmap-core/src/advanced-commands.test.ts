import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  buildMindMapStructureEdit,
  cloneMindMapDocument,
  CommandHistory,
  createMindMapBoundary,
  createMindMapClipboardPayload,
  createTidyLayoutPreview,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  defaultMindMapCalloutStyle,
  duplicateMindMapClipboardPayload,
  executeMindMapCommand,
  mindMapCommandTypes,
  type CommandExecutionContext,
  type MindMapCommand,
  type MindMapDocument,
} from './index'
import {
  createFiftyNodeFixture,
  createFiveHundredNodeFixture,
  createFloatingForestFixture,
  createRootOnlyFixture,
  createV3FeatureFixture,
} from './test-fixtures'

const context: CommandExecutionContext = {
  now: '2026-07-15T01:00:00.000Z',
}

function addNode(
  document: MindMapDocument,
  parentId: string,
  nodeId: string,
  childIds: readonly string[] = [],
): void {
  const parent = document.nodes[parentId]
  if (!parent) throw new Error(`Missing test parent: ${parentId}`)
  parent.childIds.push(nodeId)
  document.nodes[nodeId] = createMindMapNode({
    id: nodeId,
    parentId,
    childIds: [...childIds],
    text: nodeId,
  })
}

function createAdvancedTree(): MindMapDocument {
  const document = createRootOnlyFixture()
  addNode(document, 'root', 'a', ['a-1', 'a-2'])
  document.nodes['a-1'] = createMindMapNode({
    id: 'a-1',
    parentId: 'a',
    text: 'a-1',
  })
  document.nodes['a-2'] = createMindMapNode({
    id: 'a-2',
    parentId: 'a',
    text: 'a-2',
  })
  addNode(document, 'root', 'b')
  addNode(document, 'root', 'c')
  return document
}

function execute(
  document: MindMapDocument,
  command: MindMapCommand,
): ReturnType<typeof executeMindMapCommand> {
  return executeMindMapCommand(document, command, context)
}

describe('advanced hierarchy commands', () => {
  it('inserts a parent and supports undo, redo and redo invalidation', () => {
    const document = createAdvancedTree()
    const history = new CommandHistory()
    const command: MindMapCommand = {
      type: mindMapCommandTypes.insertParent,
      label: 'Insert parent',
      payload: {
        targetNodeId: 'a',
        node: createMindMapNode({
          id: 'inserted',
          parentId: null,
          text: 'Inserted parent',
        }),
      },
    }

    const inserted = history.execute(
      document,
      command,
      context,
      executeMindMapCommand,
    )
    expect(inserted.document.nodes.root?.childIds).toEqual([
      'inserted',
      'b',
      'c',
    ])
    expect(inserted.document.nodes.inserted?.childIds).toEqual(['a'])
    expect(inserted.document.nodes.a?.parentId).toBe('inserted')
    expect(inserted.document.updatedAt).toBe(context.now)

    const undone = history.undo(
      inserted.document,
      context,
      executeMindMapCommand,
    )
    expect(undone?.document.nodes.root?.childIds).toEqual(['a', 'b', 'c'])
    expect(undone?.document.nodes).not.toHaveProperty('inserted')
    const redone = history.redo(
      undone!.document,
      context,
      executeMindMapCommand,
    )
    expect(redone?.document.nodes.inserted?.childIds).toEqual(['a'])

    const undoneAgain = history.undo(
      redone!.document,
      context,
      executeMindMapCommand,
    )
    history.execute(
      undoneAgain!.document,
      {
        type: mindMapCommandTypes.setNodeWidth,
        label: 'Set width',
        payload: { nodeId: 'b', width: 180 },
      },
      context,
      executeMindMapCommand,
    )
    expect(history.canRedo).toBe(false)

    expect(() =>
      execute(document, {
        ...command,
        payload: { ...command.payload, targetNodeId: 'root' },
      }),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))
  })

  it('deletes only the current topic, preserves promoted descendants and restores references', () => {
    const document = createAdvancedTree()
    document.relationships = [
      createMindMapRelationship({
        id: 'relationship-deleted',
        fromNodeId: 'a',
        toNodeId: 'b',
      }),
      createMindMapRelationship({
        id: 'relationship-retained',
        fromNodeId: 'a-1',
        toNodeId: 'b',
      }),
    ]
    document.boundaries = [
      createMindMapBoundary({
        id: 'boundary-retained',
        nodeIds: ['a-1', 'a-2'],
      }),
      createMindMapBoundary({
        id: 'boundary-restored',
        nodeIds: ['a'],
      }),
    ]
    document.summaries = [
      createMindMapSummary({
        id: 'summary-restored',
        nodeIds: ['a', 'a-1'],
      }),
    ]
    document.callouts = [
      {
        id: 'callout-restored',
        ownerNodeId: 'a',
        text: 'Parent note',
        placement: 'right',
        offset: { x: 20, y: 0 },
        style: { ...defaultMindMapCalloutStyle },
      },
    ]

    const deleted = execute(document, {
      type: mindMapCommandTypes.deleteNodeKeepChildren,
      label: 'Delete current topic',
      payload: { nodeId: 'a' },
    })
    expect(deleted.document.nodes.root?.childIds).toEqual([
      'a-1',
      'a-2',
      'b',
      'c',
    ])
    expect(deleted.document.nodes['a-1']?.parentId).toBe('root')
    expect(deleted.document.nodes).not.toHaveProperty('a')
    expect(deleted.document.relationships.map(({ id }) => id)).toEqual([
      'relationship-retained',
    ])
    expect(deleted.document.boundaries.map(({ id }) => id)).toEqual([
      'boundary-retained',
    ])

    const restored = execute(deleted.document, deleted.inverse)
    expect(restored.document.nodes.root?.childIds).toEqual(['a', 'b', 'c'])
    expect(restored.document.nodes.a?.childIds).toEqual(['a-1', 'a-2'])
    expect(restored.document.relationships).toHaveLength(2)
    expect(restored.document.boundaries).toHaveLength(2)
    expect(restored.document.summaries).toHaveLength(1)
    expect(restored.document.callouts).toHaveLength(1)
    assertMindMapDocument(restored.document)

    const forest = createFloatingForestFixture()
    expect(() =>
      execute(forest, {
        type: mindMapCommandTypes.deleteNodeKeepChildren,
        label: 'Delete floating root only',
        payload: { nodeId: 'floating-root' },
      }),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))
  })

  it('reorders, promotes and demotes with explicit boundary reasons', () => {
    let document = createAdvancedTree()
    const previous = buildMindMapStructureEdit(
      document,
      'b',
      'move-sibling-previous',
    )
    expect(previous.enabled).toBe(true)
    if (previous.enabled)
      document = execute(document, previous.command).document
    expect(document.nodes.root?.childIds).toEqual(['b', 'a', 'c'])

    const next = buildMindMapStructureEdit(document, 'b', 'move-sibling-next')
    if (next.enabled) document = execute(document, next.command).document
    expect(document.nodes.root?.childIds).toEqual(['a', 'b', 'c'])

    const demote = buildMindMapStructureEdit(document, 'b', 'demote')
    if (demote.enabled) document = execute(document, demote.command).document
    expect(document.nodes.a?.childIds).toEqual(['a-1', 'a-2', 'b'])
    expect(document.nodes.b?.parentId).toBe('a')

    const promote = buildMindMapStructureEdit(document, 'b', 'promote')
    if (promote.enabled) document = execute(document, promote.command).document
    expect(document.nodes.root?.childIds).toEqual(['a', 'b', 'c'])
    assertMindMapDocument(document)

    expect(
      buildMindMapStructureEdit(document, 'a', 'move-sibling-previous'),
    ).toEqual({ enabled: false, disabledReason: 'first-sibling' })
    expect(
      buildMindMapStructureEdit(document, 'c', 'move-sibling-next'),
    ).toEqual({ enabled: false, disabledReason: 'last-sibling' })
    expect(buildMindMapStructureEdit(document, 'a', 'promote')).toEqual({
      enabled: false,
      disabledReason: 'no-grandparent',
    })
    expect(buildMindMapStructureEdit(document, 'a', 'demote')).toEqual({
      enabled: false,
      disabledReason: 'no-previous-sibling',
    })
    expect(buildMindMapStructureEdit(document, 'root', 'demote')).toEqual({
      enabled: false,
      disabledReason: 'root-protected',
    })
  })

  it('switches between fixed and automatic width without changing topic content', () => {
    const document = createAdvancedTree()
    document.nodes.a!.text = '中文 long-word-without-breaks\n🙂 & < >'
    const beforeText = document.nodes.a!.text
    const fixed = execute(document, {
      type: mindMapCommandTypes.setNodeWidth,
      label: 'Set fixed width',
      payload: { nodeId: 'a', width: 240 },
    })
    expect(fixed.document.nodes.a?.style.fixedWidth).toBe(240)
    expect(fixed.document.nodes.a?.text).toBe(beforeText)
    const automatic = execute(fixed.document, {
      type: mindMapCommandTypes.setNodeWidth,
      label: 'Use automatic width',
      payload: { nodeId: 'a', width: null },
    })
    expect(automatic.document.nodes.a?.style.fixedWidth).toBeUndefined()
    expect(
      execute(automatic.document, automatic.inverse).document.nodes.a?.style
        .fixedWidth,
    ).toBe(240)
    for (const width of [79, 351, 801, Number.NaN]) {
      expect(() =>
        execute(document, {
          type: mindMapCommandTypes.setNodeWidth,
          label: 'Invalid width',
          payload: { nodeId: 'a', width },
        }),
      ).toThrow(expect.objectContaining({ code: 'invalid-width' }))
    }
  })

  it('keeps a mixed advanced batch atomic when a later command fails', () => {
    const document = createAdvancedTree()
    const original = cloneMindMapDocument(document)

    expect(() =>
      execute(document, {
        type: mindMapCommandTypes.batch,
        label: 'Atomic advanced edit',
        payload: {
          commands: [
            {
              type: mindMapCommandTypes.insertParent,
              label: 'Insert parent',
              payload: {
                targetNodeId: 'a',
                node: createMindMapNode({
                  id: 'batch-parent',
                  parentId: null,
                  text: 'Batch parent',
                }),
              },
            },
            {
              type: mindMapCommandTypes.setNodeWidth,
              label: 'Invalid width',
              payload: { nodeId: 'b', width: 20 },
            },
          ],
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-width' }))
    expect(document).toEqual(original)
  })
})

describe('floating topics and forest clipboard', () => {
  it('supports the complete floating-topic lifecycle with reversible placement', () => {
    let document = createAdvancedTree()
    const created = execute(document, {
      type: mindMapCommandTypes.createFloatingTopic,
      label: 'Create floating topic',
      payload: {
        node: createMindMapNode({
          id: 'floating-new',
          parentId: null,
          text: 'Floating',
        }),
        placement: { x: 300, y: -120, structure: 'tree-top' },
      },
    })
    document = created.document
    expect(document.floatingTopics['floating-new']).toEqual({
      x: 300,
      y: -120,
      structure: 'tree-top',
    })

    const moved = execute(document, {
      type: mindMapCommandTypes.setFloatingTopicPlacement,
      label: 'Move floating topic',
      payload: { nodeId: 'floating-new', placement: { x: 410, y: 80 } },
    })
    expect(moved.document.floatingTopics['floating-new']).toEqual({
      x: 410,
      y: 80,
    })
    expect(
      execute(moved.document, moved.inverse).document.floatingTopics[
        'floating-new'
      ],
    ).toEqual({ x: 300, y: -120, structure: 'tree-top' })

    const converted = execute(document, {
      type: mindMapCommandTypes.convertToFloatingTopic,
      label: 'Convert branch',
      payload: { nodeId: 'a', placement: { x: -200, y: 200 } },
    })
    expect(converted.document.nodes.a?.parentId).toBeNull()
    expect(converted.document.nodes.a?.childIds).toEqual(['a-1', 'a-2'])
    expect(converted.document.floatingTopics.a).toEqual({ x: -200, y: 200 })

    const attached = execute(converted.document, {
      type: mindMapCommandTypes.attachFloatingTopic,
      label: 'Attach branch',
      payload: { nodeId: 'a', parentId: 'b', index: 0 },
    })
    expect(attached.document.floatingTopics.a).toBeUndefined()
    expect(attached.document.nodes.b?.childIds).toEqual(['a'])
    expect(
      execute(attached.document, attached.inverse).document.floatingTopics.a,
    ).toEqual({
      x: -200,
      y: 200,
    })

    expect(() =>
      execute(converted.document, {
        type: mindMapCommandTypes.attachFloatingTopic,
        label: 'Create a cycle',
        payload: { nodeId: 'a', parentId: 'a-1', index: 0 },
      }),
    ).toThrow(expect.objectContaining({ code: 'target-is-descendant' }))
    expect(() =>
      execute(document, {
        type: mindMapCommandTypes.convertToFloatingTopic,
        label: 'Convert main root',
        payload: { nodeId: 'root', placement: { x: 0, y: 0 } },
      }),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))

    const deleted = execute(document, {
      type: mindMapCommandTypes.deleteSubtree,
      label: 'Delete floating topic',
      payload: { nodeIds: ['floating-new'] },
    })
    expect(deleted.document.nodes).not.toHaveProperty('floating-new')
    expect(
      execute(deleted.document, deleted.inverse).document.floatingTopics[
        'floating-new'
      ],
    ).toEqual({ x: 300, y: -120, structure: 'tree-top' })
  })

  it('duplicates mixed roots and remaps enhancements while preserving catalogs', () => {
    const source = createV3FeatureFixture()
    source.relationships = [
      createMindMapRelationship({
        id: 'relationship-cross-root',
        fromNodeId: 'wide-1',
        toNodeId: 'floating-root',
      }),
    ]
    source.boundaries = [
      createMindMapBoundary({
        id: 'boundary-cross-root',
        nodeIds: ['wide-1', 'floating-root'],
      }),
    ]
    source.summaries = [
      createMindMapSummary({
        id: 'summary-cross-root',
        nodeIds: ['wide-1', 'floating-root'],
      }),
    ]
    const clipboard = createMindMapClipboardPayload(source, [
      'wide-1',
      'floating-root',
      'floating-child',
    ])
    expect(clipboard.roots.map(({ rootNodeId }) => rootNodeId)).toEqual([
      'wide-1',
      'floating-root',
    ])
    expect(clipboard.labels).toHaveProperty('label-roadmap')
    expect(clipboard.assets).toHaveProperty('asset-image')

    const duplicate = duplicateMindMapClipboardPayload(
      clipboard,
      (id) => `copy-${id}`,
      (id) => `copy-record-${id}`,
    )
    expect(duplicate.roots[0]?.nodes['copy-wide-1']?.labelIds).toEqual([
      'label-roadmap',
    ])
    expect(
      duplicate.roots[0]?.nodes['copy-wide-1']?.contentBlocks[0],
    ).toMatchObject({ assetId: 'asset-image' })
    const copiedEnhancements = duplicate.roots.flatMap((root) => [
      ...root.relationships,
      ...root.boundaries,
      ...root.summaries,
      ...root.callouts,
    ])
    expect(
      copiedEnhancements.every(({ id }) => id.startsWith('copy-record-')),
    ).toBe(true)

    const target = createRootOnlyFixture()
    const history = new CommandHistory()
    const pasted = history.execute(
      target,
      {
        type: mindMapCommandTypes.pasteSubtree,
        label: 'Paste mixed roots',
        payload: { parentId: 'root', index: 0, clipboard: duplicate },
      },
      context,
      executeMindMapCommand,
    )
    expect(pasted.document.nodes.root?.childIds).toEqual([
      'copy-wide-1',
      'copy-floating-root',
    ])
    expect(pasted.document.labels).toHaveProperty('label-roadmap')
    expect(pasted.document.assets).toHaveProperty('asset-image')
    expect(pasted.document.relationships[0]).toMatchObject({
      fromNodeId: 'copy-wide-1',
      toNodeId: 'copy-floating-root',
    })
    expect(pasted.document.callouts[0]?.ownerNodeId).toBe('copy-wide-1')
    assertMindMapDocument(pasted.document)

    const undone = history.undo(pasted.document, context, executeMindMapCommand)
    expect(undone?.document.labels).not.toHaveProperty('label-roadmap')
    expect(undone?.document.assets).not.toHaveProperty('asset-image')
    expect(undone?.document.nodes.root?.childIds).toEqual([])
    const redone = history.redo(
      undone!.document,
      context,
      executeMindMapCommand,
    )
    expect(redone?.document.nodes.root?.childIds).toHaveLength(2)
    expect(redone?.document.assets).toHaveProperty('asset-image')
  })

  it('tidies one floating subtree without changing anchors or other roots', () => {
    const document = createFloatingForestFixture()
    addNode(document, 'floating-root', 'floating-z')
    addNode(document, 'floating-root', 'floating-a')
    const placements = Object.fromEntries(
      Object.entries(document.floatingTopics).map(([nodeId, placement]) => [
        nodeId,
        { ...placement },
      ]),
    )
    const preview = createTidyLayoutPreview(document, 'floating-root')
    expect(preview.changedParentIds).toEqual(['floating-root'])
    expect(preview.childIdsByParent['floating-root']).toEqual([
      'floating-child',
      'floating-a',
      'floating-z',
    ])
    expect(preview.changedParentIds).not.toContain('root')
    expect(document.floatingTopics).toEqual(placements)
  })
})

describe('advanced command regression on scale fixtures', () => {
  it('keeps the forest invariant through mixed sequences on 50 and 500 topics', () => {
    for (const source of [
      createFiftyNodeFixture(),
      createFiveHundredNodeFixture(),
    ]) {
      let document = cloneMindMapDocument(source)
      const history = new CommandHistory()
      const firstChild = document.nodes.root?.childIds[0]
      const secondChild = document.nodes.root?.childIds[1]
      if (!firstChild || !secondChild)
        throw new Error('Missing scale fixture nodes')

      for (let index = 0; index < 3; index += 1) {
        document = history.execute(
          document,
          {
            type: mindMapCommandTypes.createNode,
            label: 'Create scale topic',
            payload: {
              parentId: 'root',
              index: document.nodes.root!.childIds.length,
              node: createMindMapNode({
                id: `scale-new-${index}`,
                parentId: null,
                text: `Scale new ${index}`,
              }),
            },
          },
          context,
          executeMindMapCommand,
        ).document
      }
      assertMindMapDocument(document)

      const reordered = buildMindMapStructureEdit(
        document,
        secondChild,
        'move-sibling-previous',
      )
      if (!reordered.enabled) throw new Error(reordered.disabledReason)
      document = history.execute(
        document,
        reordered.command,
        context,
        executeMindMapCommand,
      ).document
      assertMindMapDocument(document)

      const demoted = buildMindMapStructureEdit(document, firstChild, 'demote')
      if (!demoted.enabled) throw new Error(demoted.disabledReason)
      document = history.execute(
        document,
        demoted.command,
        context,
        executeMindMapCommand,
      ).document
      assertMindMapDocument(document)

      const promoted = buildMindMapStructureEdit(
        document,
        firstChild,
        'promote',
      )
      if (!promoted.enabled) throw new Error(promoted.disabledReason)
      document = history.execute(
        document,
        promoted.command,
        context,
        executeMindMapCommand,
      ).document
      assertMindMapDocument(document)

      document = history.execute(
        document,
        {
          type: mindMapCommandTypes.convertToFloatingTopic,
          label: 'Convert scale branch',
          payload: { nodeId: firstChild, placement: { x: 900, y: 300 } },
        },
        context,
        executeMindMapCommand,
      ).document
      assertMindMapDocument(document)

      document = history.execute(
        document,
        {
          type: mindMapCommandTypes.attachFloatingTopic,
          label: 'Attach scale branch',
          payload: { nodeId: firstChild, parentId: secondChild, index: 0 },
        },
        context,
        executeMindMapCommand,
      ).document
      assertMindMapDocument(document)

      while (history.canUndo) {
        document = history.undo(
          document,
          context,
          executeMindMapCommand,
        )!.document
        assertMindMapDocument(document)
      }
      expect(Object.keys(document.nodes)).toHaveLength(
        Object.keys(source.nodes).length,
      )
    }
  })
})
