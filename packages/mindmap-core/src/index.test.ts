import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  CommandHistory,
  createMindMapDocument,
  findNodeIdsByText,
  getAncestorNodeIds,
  getDescendantNodeIds,
  getNodeIdsInDocumentOrder,
  getOwningRootNodeId,
  MindMapValidationError,
  normalizeTopLevelNodeSelection,
  type CommandExecutionContext,
  type CommandResult,
  type MindMapCommand,
  type MindMapCommandExecutor,
} from './index'
import {
  createDeepTreeFixture,
  createFiftyNodeFixture,
  createFiveHundredNodeFixture,
  createFloatingForestFixture,
  createMalformedV3Fixtures,
  createStyledTreeFixture,
  createV3FeatureFixture,
} from './test-fixtures'

const executionContext: CommandExecutionContext = {
  now: '2026-07-12T01:00:00.000Z',
}

const renameExecutor: MindMapCommandExecutor = (document, command, context) => {
  if (command.type !== 'map.rename') {
    throw new Error(`Unsupported test command: ${command.type}`)
  }

  const payload = command.payload as { title: string }
  const inverse: MindMapCommand = {
    type: 'map.rename',
    label: 'Restore map title',
    payload: { title: document.title },
  }

  const result: CommandResult = {
    document: {
      ...document,
      title: payload.title,
      updatedAt: context.now,
    },
    inverse,
    affectedNodeIds: [document.rootNodeId],
  }

  return result
}

describe('mindmap core document model', () => {
  it('creates a deterministic v3 document without browser APIs', () => {
    const document = createMindMapDocument({
      id: 'map-1',
      rootNodeId: 'node-1',
      title: '产品规划',
      now: '2026-07-12T00:00:00.000Z',
    })

    expect(document.rootNodeId).toBe('node-1')
    expect(document.nodes['node-1']?.text).toBe('产品规划')
    expect(document.nodes['node-1']?.style.fontWeight).toBe('semibold')
    expect(document.schemaVersion).toBe(3)
    expect(document.defaultStructure).toBe('logic-right')
    expect(document.floatingTopics).toEqual({})
  })

  it('keeps fixture documents valid without mutating their structure', () => {
    const document = createStyledTreeFixture()

    expect(assertMindMapDocument(document)).toBe(document)
    expect(document.nodes['wide-1']?.markers).toEqual([
      { kind: 'priority', value: '1' },
      { kind: 'status', value: 'in-progress' },
      { kind: 'icon', value: 'star' },
    ])
  })

  it('keeps the complete v3 feature fixture valid', () => {
    const document = createV3FeatureFixture()

    expect(assertMindMapDocument(document)).toBe(document)
    expect(document.nodes['wide-1']?.contentBlocks).toHaveLength(2)
    expect(document.callouts[0]?.ownerNodeId).toBe('wide-1')
  })
})

describe('mindmap core traversal and validation', () => {
  it('returns ancestors, descendants and normalized top-level selections', () => {
    const document = createDeepTreeFixture(3)

    expect(getAncestorNodeIds(document, 'deep-3')).toEqual([
      'deep-2',
      'deep-1',
      'root',
    ])
    expect(getDescendantNodeIds(document, 'deep-1')).toEqual([
      'deep-2',
      'deep-3',
    ])
    expect(
      normalizeTopLevelNodeSelection(document, ['deep-1', 'deep-2', 'deep-3']),
    ).toEqual(['deep-1'])
  })

  it('finds case-insensitive node text matches in document order', () => {
    const document = createDeepTreeFixture(3)

    expect(findNodeIdsByText(document, 'depth')).toEqual([
      'deep-1',
      'deep-2',
      'deep-3',
    ])
    expect(findNodeIdsByText(document, '')).toEqual([])
  })

  it('rejects duplicate child references without changing the document', () => {
    const document = createDeepTreeFixture(1)
    document.nodes.root?.childIds.push('deep-1')

    expect(() => assertMindMapDocument(document)).toThrow(
      MindMapValidationError,
    )
    expect(() => assertMindMapDocument(document)).toThrow(
      expect.objectContaining({ code: 'duplicate-child' }),
    )
  })

  it('validates a 500-node fixture iteratively', () => {
    const document = createFiveHundredNodeFixture()

    expect(assertMindMapDocument(document)).toBe(document)
    expect(Object.keys(document.nodes)).toHaveLength(501)
  })

  it('traverses the main tree and floating subtrees in deterministic order', () => {
    const document = createFloatingForestFixture()

    expect(getNodeIdsInDocumentOrder(document)).toEqual([
      'root',
      'wide-1',
      'wide-2',
      'floating-root',
      'floating-child',
      'floating-root-2',
    ])
    expect(getOwningRootNodeId(document, 'floating-child')).toBe(
      'floating-root',
    )
    expect(
      normalizeTopLevelNodeSelection(document, [
        'wide-1',
        'floating-root',
        'floating-child',
      ]),
    ).toEqual(['wide-1', 'floating-root'])
  })

  it('rejects unregistered and multiply owned forest nodes', () => {
    const unregistered = createFloatingForestFixture()
    delete unregistered.floatingTopics['floating-root']
    expect(() => assertMindMapDocument(unregistered)).toThrow(
      expect.objectContaining({ code: 'invalid-root' }),
    )

    const duplicate = createFloatingForestFixture()
    duplicate.nodes.root!.childIds.push('floating-child')
    expect(() => assertMindMapDocument(duplicate)).toThrow(
      expect.objectContaining({ code: 'parent-mismatch' }),
    )
  })

  it('rejects every deterministic malformed v3 fixture', () => {
    for (const document of Object.values(createMalformedV3Fixtures())) {
      expect(() => assertMindMapDocument(document)).toThrow(
        MindMapValidationError,
      )
    }
  })

  it('provides deterministic 50-node keyboard and 500-node scale fixtures', () => {
    expect(Object.keys(createFiftyNodeFixture().nodes)).toHaveLength(51)
    expect(Object.keys(createFiveHundredNodeFixture().nodes)).toHaveLength(501)
  })
})

describe('command history contract', () => {
  it('executes, undoes and redoes commands while clearing redo after a new edit', () => {
    const document = createMindMapDocument({
      id: 'map-1',
      rootNodeId: 'root',
      title: 'Original',
      now: '2026-07-12T00:00:00.000Z',
    })
    const history = new CommandHistory()
    const rename: MindMapCommand = {
      type: 'map.rename',
      label: 'Rename map',
      payload: { title: 'Renamed' },
    }

    const renamed = history.execute(
      document,
      rename,
      executionContext,
      renameExecutor,
    )
    expect(renamed.document.title).toBe('Renamed')
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    const undone = history.undo(
      renamed.document,
      executionContext,
      renameExecutor,
    )
    expect(undone?.document.title).toBe('Original')
    expect(history.canRedo).toBe(true)

    const redone = history.redo(
      undone?.document ?? document,
      executionContext,
      renameExecutor,
    )
    expect(redone?.document.title).toBe('Renamed')

    const undoneAgain = history.undo(
      redone?.document ?? document,
      executionContext,
      renameExecutor,
    )
    history.execute(
      undoneAgain?.document ?? document,
      {
        type: 'map.rename',
        label: 'Rename map again',
        payload: { title: 'New branch' },
      },
      executionContext,
      renameExecutor,
    )

    expect(history.canRedo).toBe(false)
    expect(history.undoDepth).toBe(1)
  })
})
