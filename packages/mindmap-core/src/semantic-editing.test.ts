import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  buildMindMapStructureEdit,
  cloneMindMapDocument,
  CommandHistory,
  createFiveHundredNodeFixture,
  createMindMapNode,
  createRootOnlyFixture,
  createV3FeatureFixture,
  deriveMindMapNumbering,
  executeMindMapCommand,
  mindMapCommandTypes,
  queryMindMap,
  type MindMapDocument,
} from './index'

const context = { now: '2026-07-15T03:00:00.000Z' }

function appendNode(
  document: MindMapDocument,
  parentId: string,
  nodeId: string,
): void {
  document.nodes[parentId]!.childIds.push(nodeId)
  document.nodes[nodeId] = createMindMapNode({
    id: nodeId,
    parentId,
    text: nodeId,
  })
}

function createSemanticTree(): MindMapDocument {
  const document = createRootOnlyFixture()
  appendNode(document, 'root', 'a')
  appendNode(document, 'root', 'b')
  appendNode(document, 'root', 'c')
  appendNode(document, 'a', 'a-1')
  document.nodes.a!.notes = 'Needs review'
  document.nodes.a!.markers = [
    { kind: 'priority', value: '1' },
    { kind: 'status', value: 'doing' },
  ]
  document.nodes.b!.markers = [{ kind: 'status', value: 'done' }]
  return document
}

describe('label catalog and topic label commands', () => {
  it('creates, updates, applies, deletes and fully restores reusable labels', () => {
    let document = createSemanticTree()
    const created = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.upsertLabel,
        label: 'Create label',
        payload: {
          value: {
            id: 'roadmap',
            name: '  Roadmap  ',
            color: '#7c3aed',
            order: 2,
          },
        },
      },
      context,
    )
    document = created.document
    expect(document.labels.roadmap?.name).toBe('Roadmap')

    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.upsertLabel,
        label: 'Create second label',
        payload: {
          value: {
            id: 'urgent',
            name: 'Urgent',
            color: '#dc2626',
            order: 1,
          },
        },
      },
      context,
    ).document
    const applied = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setNodeLabels,
        label: 'Apply labels',
        payload: {
          nodeId: 'a',
          labelIds: ['roadmap', 'urgent'],
          sortMode: 'alphabetical',
        },
      },
      context,
    )
    document = applied.document
    expect(document.nodes.a?.labelIds).toEqual(['urgent', 'roadmap'])

    const deleted = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteLabel,
        label: 'Delete label',
        payload: { labelId: 'roadmap' },
      },
      context,
    )
    expect(deleted.document.labels).not.toHaveProperty('roadmap')
    expect(deleted.document.nodes.a?.labelIds).toEqual(['urgent'])
    const restored = executeMindMapCommand(
      deleted.document,
      deleted.inverse,
      context,
    )
    expect(restored.document.labels.roadmap?.name).toBe('Roadmap')
    expect(restored.document.nodes.a?.labelIds).toEqual(['urgent', 'roadmap'])
    assertMindMapDocument(restored.document)

    expect(
      executeMindMapCommand(created.document, created.inverse, context).document
        .labels,
    ).not.toHaveProperty('roadmap')
  })

  it('rejects empty, duplicate, comma-delimited and overlong label names atomically', () => {
    const document = createSemanticTree()
    document.labels.existing = {
      id: 'existing',
      name: 'Roadmap',
      color: '#111111',
    }
    const invalidNames = ['', 'roadMAP', 'one,two', '一，二', 'x'.repeat(65)]
    for (const [index, name] of invalidNames.entries()) {
      const original = cloneMindMapDocument(document)
      expect(() =>
        executeMindMapCommand(
          document,
          {
            type: mindMapCommandTypes.upsertLabel,
            label: 'Invalid label',
            payload: {
              value: {
                id: `invalid-${index}`,
                name,
                color: '#000000',
              },
            },
          },
          context,
        ),
      ).toThrow(expect.objectContaining({ code: 'invalid-label' }))
      expect(document).toEqual(original)
    }
  })
})

describe('combined mind-map query', () => {
  it('matches text, labels, markers and notes with AND/OR context paths', () => {
    const document = createSemanticTree()
    document.labels.roadmap = {
      id: 'roadmap',
      name: 'Roadmap',
      color: '#7c3aed',
    }
    document.nodes.a!.labelIds = ['roadmap']
    document.nodes.a!.collapsed = true

    const andResult = queryMindMap(document, {
      text: 'review',
      labelIds: ['roadmap'],
      priorities: ['1'],
      statuses: ['doing'],
      hasNotes: true,
      operator: 'and',
    })
    expect(andResult.matchedNodeIds).toEqual(['a'])
    expect(andResult.pathsByNodeId.a).toEqual(['root', 'a'])
    expect(andResult.contextNodeIds).toEqual(['root', 'a'])

    const orResult = queryMindMap(document, {
      statuses: ['done'],
      labelIds: ['roadmap'],
      operator: 'or',
    })
    expect(orResult.matchedNodeIds).toEqual(['a', 'b'])
    expect(queryMindMap(document, {}).matchedNodeIds).toHaveLength(5)
    expect(document.nodes.a?.collapsed).toBe(true)
  })

  it('queries all 500 topics without changing the document', () => {
    const document = createFiveHundredNodeFixture()
    document.nodes['node-500']!.notes = 'needle'
    const before = cloneMindMapDocument(document)
    const result = queryMindMap(document, { text: 'needle' })
    expect(result.matchedNodeIds).toEqual(['node-500'])
    expect(result.pathsByNodeId['node-500']?.at(-1)).toBe('node-500')
    expect(document).toEqual(before)
  })

  it('returns an isolated context path for matches inside a floating tree', () => {
    const document = createV3FeatureFixture()
    document.nodes['floating-child']!.notes = 'floating needle'
    const result = queryMindMap(document, { text: 'floating needle' })
    expect(result.matchedNodeIds).toEqual(['floating-child'])
    expect(result.pathsByNodeId['floating-child']).toEqual([
      'floating-root',
      'floating-child',
    ])
    expect(result.contextNodeIds).toEqual(['floating-root', 'floating-child'])
  })
})

describe('derived numbering policy', () => {
  it('derives decimal, alpha and Roman labels without changing topic text', () => {
    const document = createSemanticTree()
    const originalTexts = Object.fromEntries(
      Object.entries(document.nodes).map(([id, node]) => [id, node.text]),
    )
    document.nodes.root!.numbering = {
      style: 'decimal',
      mode: 'hierarchical',
      startAt: 1,
    }
    let numbering = deriveMindMapNumbering(document)
    expect(numbering.a?.label).toBe('1')
    expect(numbering['a-1']?.label).toBe('1.1')
    expect(numbering.b?.label).toBe('2')

    document.nodes.root!.numbering = {
      style: 'alpha',
      mode: 'siblings',
      startAt: 2,
    }
    numbering = deriveMindMapNumbering(document)
    expect(numbering.a?.label).toBe('B')
    expect(numbering.b?.label).toBe('C')
    expect(numbering['a-1']).toBeUndefined()

    document.nodes.root!.numbering = {
      style: 'roman',
      mode: 'siblings',
      startAt: 4,
      restartAtNodeId: 'c',
    }
    numbering = deriveMindMapNumbering(document)
    expect(numbering.a?.label).toBe('IV')
    expect(numbering.b?.label).toBe('V')
    expect(numbering.c?.label).toBe('IV')
    expect(
      Object.fromEntries(
        Object.entries(document.nodes).map(([id, node]) => [id, node.text]),
      ),
    ).toEqual(originalTexts)
  })

  it('updates numbering reversibly and recomputes after structural edits', () => {
    let document = createSemanticTree()
    const configured = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setNodeNumbering,
        label: 'Enable numbering',
        payload: {
          nodeId: 'root',
          numbering: {
            style: 'decimal',
            mode: 'hierarchical',
            startAt: 1,
          },
        },
      },
      context,
    )
    document = configured.document
    const moved = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.moveNode,
        label: 'Move sibling',
        payload: { nodeId: 'b', parentId: 'root', index: 0 },
      },
      context,
    )
    expect(deriveMindMapNumbering(moved.document)).toMatchObject({
      b: { label: '1' },
      a: { label: '2' },
      'a-1': { label: '2.1' },
    })

    const floated = executeMindMapCommand(
      moved.document,
      {
        type: mindMapCommandTypes.convertToFloatingTopic,
        label: 'Float numbered branch',
        payload: { nodeId: 'a', placement: { x: 300, y: 100 } },
      },
      context,
    )
    expect(deriveMindMapNumbering(floated.document).a).toBeUndefined()
    expect(deriveMindMapNumbering(floated.document).b?.label).toBe('1')
    const restored = executeMindMapCommand(
      configured.document,
      configured.inverse,
      context,
    )
    expect(restored.document.nodes.root?.numbering).toBeUndefined()

    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.setNodeNumbering,
          label: 'Invalid numbering',
          payload: {
            nodeId: 'root',
            numbering: {
              style: 'roman',
              mode: 'siblings',
              startAt: 4000,
            },
          },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-numbering' }))
  })

  it('recomputes after insert, delete, hierarchy edits, parent moves, undo and redo', () => {
    let document = createSemanticTree()
    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.setNodeNumbering,
        label: 'Enable numbering',
        payload: {
          nodeId: 'root',
          numbering: {
            style: 'decimal',
            mode: 'hierarchical',
            startAt: 1,
          },
        },
      },
      context,
    ).document

    const history = new CommandHistory()
    const inserted = history.execute(
      document,
      {
        type: mindMapCommandTypes.createNode,
        label: 'Insert numbered topic',
        payload: {
          node: createMindMapNode({
            id: 'inserted',
            parentId: null,
            text: 'Inserted',
          }),
          parentId: 'root',
          index: 1,
        },
      },
      context,
      executeMindMapCommand,
    )
    document = inserted.document
    expect(deriveMindMapNumbering(document)).toMatchObject({
      a: { label: '1' },
      inserted: { label: '2' },
      b: { label: '3' },
      c: { label: '4' },
    })

    document = history.undo(document, context, executeMindMapCommand)!.document
    expect(deriveMindMapNumbering(document).b?.label).toBe('2')
    document = history.redo(document, context, executeMindMapCommand)!.document
    expect(deriveMindMapNumbering(document).inserted?.label).toBe('2')

    const deleted = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteSubtree,
        label: 'Delete numbered topic',
        payload: { nodeIds: ['inserted'] },
      },
      context,
    )
    expect(deriveMindMapNumbering(deleted.document).b?.label).toBe('2')
    document = executeMindMapCommand(
      deleted.document,
      deleted.inverse,
      context,
    ).document
    expect(deriveMindMapNumbering(document).inserted?.label).toBe('2')

    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteSubtree,
        label: 'Remove inserted topic',
        payload: { nodeIds: ['inserted'] },
      },
      context,
    ).document
    const demote = buildMindMapStructureEdit(document, 'b', 'demote')
    if (!demote.enabled) throw new Error(demote.disabledReason)
    document = executeMindMapCommand(document, demote.command, context).document
    expect(deriveMindMapNumbering(document)).toMatchObject({
      a: { label: '1' },
      'a-1': { label: '1.1' },
      b: { label: '1.2' },
      c: { label: '2' },
    })

    const promote = buildMindMapStructureEdit(document, 'b', 'promote')
    if (!promote.enabled) throw new Error(promote.disabledReason)
    document = executeMindMapCommand(
      document,
      promote.command,
      context,
    ).document
    expect(deriveMindMapNumbering(document).b?.label).toBe('2')

    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.moveNode,
        label: 'Move numbered topic to another parent',
        payload: { nodeId: 'a-1', parentId: 'c', index: 0 },
      },
      context,
    ).document
    expect(deriveMindMapNumbering(document)['a-1']?.label).toBe('3.1')
    assertMindMapDocument(document)
  })
})
