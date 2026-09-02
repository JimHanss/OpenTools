import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  CommandHistory,
  createMindMapBoundary,
  createTidyLayoutPreview,
  createMindMapClipboardPayload,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  duplicateMindMapClipboardPayload,
  executeMindMapCommand,
  MindMapCommandError,
  mindMapCommandTypes,
  type CommandExecutionContext,
  type MindMapCommand,
  type MindMapDocument,
} from './index'
import {
  createFiveHundredNodeFixture,
  createRootOnlyFixture,
  createWideTreeFixture,
} from './test-fixtures'

const context: CommandExecutionContext = {
  now: '2026-07-14T00:00:00.000Z',
}

function appendNode(
  document: MindMapDocument,
  parentId: string,
  nodeId: string,
  text = nodeId,
): void {
  const parent = document.nodes[parentId]
  if (!parent) throw new Error(`Missing fixture parent: ${parentId}`)

  parent.childIds.push(nodeId)
  document.nodes[nodeId] = createMindMapNode({
    id: nodeId,
    parentId,
    text,
  })
}

function createEditableTree(): MindMapDocument {
  const document = createRootOnlyFixture()
  appendNode(document, 'root', 'a', 'Topic A')
  appendNode(document, 'root', 'b', 'Topic B')
  appendNode(document, 'a', 'a-1', 'Topic A.1')
  return document
}

function undoCommand(
  document: MindMapDocument,
  command: MindMapCommand,
): MindMapDocument {
  const applied = executeMindMapCommand(document, command, context)
  return executeMindMapCommand(applied.document, applied.inverse, context)
    .document
}

describe('core text, map and collapse commands', () => {
  it('normalizes empty committed text and restores the original values', () => {
    const document = createEditableTree()
    const renamed = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.renameMap,
        label: 'Rename map',
        payload: { title: '   ' },
      },
      context,
    )
    const updated = executeMindMapCommand(
      renamed.document,
      {
        type: mindMapCommandTypes.updateNodeText,
        label: 'Rename topic',
        payload: { nodeId: 'a', text: '   ' },
      },
      context,
    )

    expect(renamed.document.title).toBe('Untitled mind map')
    expect(updated.document.nodes.a?.text).toBe('Untitled topic')
    expect(
      executeMindMapCommand(updated.document, updated.inverse, context).document
        .nodes.a?.text,
    ).toBe('Topic A')
    expect(
      executeMindMapCommand(renamed.document, renamed.inverse, context).document
        .title,
    ).toBe('Root topic')
  })

  it('sets and restores collapsed state', () => {
    const document = createEditableTree()
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setNodeCollapse,
        label: 'Collapse topic',
        payload: { nodeId: 'a', collapsed: true },
      },
      context,
    )

    expect(result.document.nodes.a?.collapsed).toBe(true)
    expect(
      executeMindMapCommand(result.document, result.inverse, context).document
        .nodes.a?.collapsed,
    ).toBe(false)
  })
})

describe('core structural commands', () => {
  it('creates a detached leaf at a requested index and restores it through inverse delete', () => {
    const document = createWideTreeFixture(2)
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.createNode,
        label: 'Create topic',
        payload: {
          parentId: 'root',
          index: 1,
          node: createMindMapNode({
            id: 'new-topic',
            parentId: null,
            text: '   ',
          }),
        },
      },
      context,
    )

    expect(result.document.nodes.root?.childIds).toEqual([
      'wide-1',
      'new-topic',
      'wide-2',
    ])
    expect(result.document.nodes['new-topic']?.text).toBe('Untitled topic')
    expect(
      executeMindMapCommand(result.document, result.inverse, context).document
        .nodes,
    ).not.toHaveProperty('new-topic')
  })

  it('moves a subtree and restores its parent and sibling index', () => {
    const document = createEditableTree()
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.moveNode,
        label: 'Move topic',
        payload: { nodeId: 'a', parentId: 'b', index: 0 },
      },
      context,
    )

    expect(result.document.nodes.root?.childIds).toEqual(['b'])
    expect(result.document.nodes.b?.childIds).toEqual(['a'])
    expect(result.document.nodes.a?.childIds).toEqual(['a-1'])

    const restored = executeMindMapCommand(
      result.document,
      result.inverse,
      context,
    )
    expect(restored.document.nodes.root?.childIds).toEqual(['a', 'b'])
    expect(restored.document.nodes.a?.parentId).toBe('root')
  })

  it('protects the root and rejects descendant and no-op move targets', () => {
    const document = createEditableTree()

    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.moveNode,
          label: 'Move root',
          payload: { nodeId: 'root', parentId: 'a', index: 0 },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.moveNode,
          label: 'Move into descendant',
          payload: { nodeId: 'a', parentId: 'a-1', index: 0 },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'target-is-descendant' }))
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.moveNode,
          label: 'Keep same place',
          payload: { nodeId: 'b', parentId: 'root', index: 1 },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'no-op-move' }))
  })

  it('deletes normalized subtrees and restores original sibling order', () => {
    const document = createEditableTree()
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteSubtree,
        label: 'Delete topics',
        payload: { nodeIds: ['a', 'a-1', 'b'] },
      },
      context,
    )

    expect(result.document.nodes.root?.childIds).toEqual([])
    expect(result.document.nodes).not.toHaveProperty('a')
    expect(result.document.nodes).not.toHaveProperty('a-1')

    const restored = executeMindMapCommand(
      result.document,
      result.inverse,
      context,
    )
    expect(restored.document.nodes.root?.childIds).toEqual(['a', 'b'])
    expect(restored.document.nodes.a?.childIds).toEqual(['a-1'])
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.deleteSubtree,
          label: 'Delete root',
          payload: { nodeIds: ['root'] },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))
  })
})

describe('clipboard and batch commands', () => {
  it('copies, duplicates and pastes a complete subtree with caller-provided IDs', () => {
    const document = createEditableTree()
    const clipboard = createMindMapClipboardPayload(document, ['a', 'a-1'])
    const duplicate = duplicateMindMapClipboardPayload(
      clipboard,
      (sourceNodeId) => `copy-${sourceNodeId}`,
    )
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.pasteSubtree,
        label: 'Paste duplicate',
        payload: { parentId: 'root', index: 2, clipboard: duplicate },
      },
      context,
    )

    expect(result.document.nodes.root?.childIds).toEqual(['a', 'b', 'copy-a'])
    expect(result.document.nodes['copy-a']?.childIds).toEqual(['copy-a-1'])
    expect(result.document.nodes['copy-a-1']?.parentId).toBe('copy-a')
    expect(
      executeMindMapCommand(result.document, result.inverse, context).document
        .nodes,
    ).not.toHaveProperty('copy-a')
  })

  it('runs valid batches as one inverse operation and leaves the input unchanged on a failure', () => {
    const document = createEditableTree()
    const command: MindMapCommand = {
      type: mindMapCommandTypes.batch,
      label: 'Batch edit',
      payload: {
        commands: [
          {
            type: mindMapCommandTypes.renameMap,
            label: 'Rename map',
            payload: { title: 'Batch title' },
          },
          {
            type: mindMapCommandTypes.updateNodeNotes,
            label: 'Add notes',
            payload: { nodeId: 'a', notes: 'Batch note' },
          },
        ],
      },
    }
    const result = executeMindMapCommand(document, command, context)

    expect(result.document.title).toBe('Batch title')
    expect(result.document.nodes.a?.notes).toBe('Batch note')
    const restored = executeMindMapCommand(
      result.document,
      result.inverse,
      context,
    )
    expect(restored.document.title).toBe('Root topic')
    expect(restored.document.nodes.a?.notes).toBe('')

    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.batch,
          label: 'Invalid batch',
          payload: {
            commands: [
              {
                type: mindMapCommandTypes.renameMap,
                label: 'Rename map',
                payload: { title: 'Should not persist' },
              },
              {
                type: mindMapCommandTypes.updateNodeText,
                label: 'Missing topic',
                payload: { nodeId: 'missing', text: 'Nope' },
              },
            ],
          },
        },
        context,
      ),
    ).toThrow(MindMapCommandError)
    expect(document.title).toBe('Root topic')
    expect(document.nodes.a?.text).toBe('Topic A')
  })
})

describe('presentation and metadata commands', () => {
  it('updates and restores style, markers, notes and links', () => {
    const document = createEditableTree()
    const styleResult = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateNodeStyle,
        label: 'Style topic',
        payload: { nodeId: 'a', style: { fontWeight: 'bold', fontSize: 18 } },
      },
      context,
    )
    const markerResult = executeMindMapCommand(
      styleResult.document,
      {
        type: mindMapCommandTypes.updateNodeMarkers,
        label: 'Mark topic',
        payload: {
          nodeId: 'a',
          markers: [
            { kind: 'priority', value: '1' },
            { kind: 'status', value: 'in-progress' },
            { kind: 'icon', value: 'star' },
          ],
        },
      },
      context,
    )
    const noteResult = executeMindMapCommand(
      markerResult.document,
      {
        type: mindMapCommandTypes.updateNodeNotes,
        label: 'Add note',
        payload: { nodeId: 'a', notes: 'Remember this' },
      },
      context,
    )
    const linkResult = executeMindMapCommand(
      noteResult.document,
      {
        type: mindMapCommandTypes.updateNodeLinks,
        label: 'Add link',
        payload: {
          nodeId: 'a',
          links: [
            { label: 'Reference', url: 'https://example.test/reference' },
          ],
        },
      },
      context,
    )

    expect(linkResult.document.nodes.a?.style.fontWeight).toBe('bold')
    expect(linkResult.document.nodes.a?.markers).toHaveLength(3)
    expect(linkResult.document.nodes.a?.notes).toBe('Remember this')
    expect(linkResult.document.nodes.a?.links).toEqual([
      { label: 'Reference', url: 'https://example.test/reference' },
    ])

    const restoredLinks = executeMindMapCommand(
      linkResult.document,
      linkResult.inverse,
      context,
    )
    const restoredNotes = executeMindMapCommand(
      restoredLinks.document,
      noteResult.inverse,
      context,
    )
    const restoredMarkers = executeMindMapCommand(
      restoredNotes.document,
      markerResult.inverse,
      context,
    )
    const restoredStyle = executeMindMapCommand(
      restoredMarkers.document,
      styleResult.inverse,
      context,
    )

    expect(restoredStyle.document.nodes.a?.style.fontWeight).toBe('semibold')
    expect(restoredStyle.document.nodes.a?.markers).toEqual([])
    expect(restoredStyle.document.nodes.a?.notes).toBe('')
    expect(restoredStyle.document.nodes.a?.links).toEqual([])
    expect(
      undoCommand(document, {
        type: mindMapCommandTypes.updateNodeStyle,
        label: 'Style topic',
        payload: { nodeId: 'a', style: { fontWeight: 'bold' } },
      }).nodes.a?.style.fontWeight,
    ).toBe('semibold')
  })

  it('rejects duplicate priority or status markers', () => {
    const document = createEditableTree()

    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.updateNodeMarkers,
          label: 'Invalid markers',
          payload: {
            nodeId: 'a',
            markers: [
              { kind: 'priority', value: '1' },
              { kind: 'priority', value: '2' },
            ],
          },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-marker' }))
  })
})

describe('command history on large documents', () => {
  it('keeps a 500-node document valid across a mixed undo and redo sequence', () => {
    const document = createFiveHundredNodeFixture()
    const history = new CommandHistory()
    let currentDocument = document

    for (let index = 1; index <= 40; index += 1) {
      currentDocument = history.execute(
        currentDocument,
        {
          type: mindMapCommandTypes.updateNodeText,
          label: 'Update fixture topic',
          payload: { nodeId: `node-${index}`, text: `Updated ${index}` },
        },
        context,
        executeMindMapCommand,
      ).document
    }

    currentDocument = history.execute(
      currentDocument,
      {
        type: mindMapCommandTypes.moveNode,
        label: 'Move last fixture topic',
        payload: { nodeId: 'node-500', parentId: 'root', index: 20 },
      },
      context,
      executeMindMapCommand,
    ).document
    expect(assertMindMapDocument(currentDocument)).toBe(currentDocument)

    while (history.canUndo) {
      currentDocument =
        history.undo(currentDocument, context, executeMindMapCommand)
          ?.document ?? currentDocument
    }

    expect(currentDocument.nodes['node-1']?.text).toBe('Node 1')
    expect(currentDocument.nodes['node-500']?.parentId).toBe('node-25')
    expect(assertMindMapDocument(currentDocument)).toBe(currentDocument)

    while (history.canRedo) {
      currentDocument =
        history.redo(currentDocument, context, executeMindMapCommand)
          ?.document ?? currentDocument
    }

    expect(currentDocument.nodes['node-1']?.text).toBe('Updated 1')
    expect(currentDocument.nodes['node-500']?.parentId).toBe('root')
    expect(assertMindMapDocument(currentDocument)).toBe(currentDocument)
  })
})

describe('relationship, grouping and tidy commands', () => {
  it('creates, edits and removes relationship records through reversible commands', () => {
    const document = createEditableTree()
    const created = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateRelationships,
        label: 'Create relationship',
        payload: {
          relationships: [
            createMindMapRelationship({
              id: 'rel-1',
              fromNodeId: 'a',
              toNodeId: 'b',
              label: 'depends on',
            }),
          ],
        },
      },
      context,
    )
    const edited = executeMindMapCommand(
      created.document,
      {
        type: mindMapCommandTypes.updateRelationships,
        label: 'Edit relationship',
        payload: {
          relationships: [
            createMindMapRelationship({
              id: 'rel-1',
              fromNodeId: 'a',
              toNodeId: 'b',
              label: 'blocks',
            }),
          ],
        },
      },
      context,
    )
    const removed = executeMindMapCommand(
      edited.document,
      {
        type: mindMapCommandTypes.updateRelationships,
        label: 'Delete relationship',
        payload: { relationships: [] },
      },
      context,
    )

    expect(edited.document.relationships[0]?.label).toBe('blocks')
    expect(removed.document.relationships).toEqual([])
    expect(
      executeMindMapCommand(removed.document, removed.inverse, context).document
        .relationships,
    ).toEqual(edited.document.relationships)
  })

  it('updates grouped records and preserves node selection semantics', () => {
    const document = createEditableTree()
    const boundaries = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateBoundaries,
        label: 'Add boundary',
        payload: {
          boundaries: [
            createMindMapBoundary({
              id: 'boundary-1',
              nodeIds: ['a', 'a-1'],
              label: 'Plan',
            }),
          ],
        },
      },
      context,
    )
    const summaries = executeMindMapCommand(
      boundaries.document,
      {
        type: mindMapCommandTypes.updateSummaries,
        label: 'Add summary',
        payload: {
          summaries: [
            createMindMapSummary({
              id: 'summary-1',
              nodeIds: ['a', 'b'],
              label: 'Overview',
            }),
          ],
        },
      },
      context,
    )

    expect(summaries.document.boundaries[0]?.nodeIds).toEqual(['a', 'a-1'])
    expect(summaries.document.summaries[0]?.nodeIds).toEqual(['a', 'b'])
    expect(assertMindMapDocument(summaries.document)).toBe(summaries.document)
  })

  it('uses a visible tidy preview to reorder siblings without changing hierarchy and supports undo', () => {
    const document = createEditableTree()
    document.nodes.root!.childIds = ['b', 'a']
    const preview = createTidyLayoutPreview(document)
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.tidyLayout,
        label: 'Tidy all topic order',
        payload: { childIdsByParent: preview.childIdsByParent },
      },
      context,
    )

    expect(preview.changedParentIds).toEqual(['root'])
    expect(result.document.nodes.root?.childIds).toEqual(['a', 'b'])
    expect(result.document.nodes.a?.parentId).toBe('root')
    expect(
      executeMindMapCommand(result.document, result.inverse, context).document
        .nodes.root?.childIds,
    ).toEqual(['b', 'a'])
  })

  it('rejects invalid enhancement records before mutating the document', () => {
    const document = createEditableTree()
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.updateRelationships,
          label: 'Invalid relationship',
          payload: {
            relationships: [
              createMindMapRelationship({
                id: 'rel-1',
                fromNodeId: 'a',
                toNodeId: 'a',
                label: '',
              }),
            ],
          },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-enhancement' }))
    expect(document.relationships).toEqual([])
  })
})
