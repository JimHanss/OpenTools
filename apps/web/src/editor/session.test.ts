import { describe, expect, it } from 'vitest'

import {
  createMindMapCallout,
  createMindMapDocument,
  createMindMapNode,
  createMindMapRelationship,
  mindMapCommandTypes,
} from '@opentools/mindmap-core'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { EditorSession } from './session'

describe('EditorSession', () => {
  it('routes edits, undo and redo through command history with monotonic revisions', async () => {
    const repository = new MemoryMindMapRepository()
    const document = createMindMapDocument({
      id: 'session-map',
      rootNodeId: 'root',
      title: 'Original',
      now: '2026-07-15T00:00:00.000Z',
    })
    await repository.save(document)
    const session = new EditorSession(document, repository, {
      debounceMs: 1_000,
      now: () => '2026-07-15T00:00:01.000Z',
    })
    const revisions: number[] = []
    const unsubscribe = session.subscribe((snapshot) =>
      revisions.push(snapshot.revision),
    )

    session.renameMap('Renamed')
    expect(session.getSnapshot()).toMatchObject({
      revision: 1,
      canUndo: true,
      document: { title: 'Renamed' },
    })

    session.undo()
    expect(session.getSnapshot()).toMatchObject({
      revision: 2,
      canRedo: true,
      document: { title: 'Original' },
    })

    session.redo()
    await session.flush()
    expect(session.getSnapshot()).toMatchObject({
      revision: 3,
      document: { title: 'Renamed' },
      saveStatus: { state: 'saved', revision: 3 },
    })
    expect((await repository.get('session-map'))?.title).toBe('Renamed')
    expect(revisions).toContain(3)

    unsubscribe()
    session.dispose()
  })

  it('does not change session state when a command fails', () => {
    const document = createMindMapDocument({
      id: 'session-failure',
      rootNodeId: 'root',
      title: 'Original',
      now: '2026-07-15T00:00:00.000Z',
    })
    const session = new EditorSession(document, new MemoryMindMapRepository())

    expect(() =>
      session.execute({
        type: mindMapCommandTypes.moveNode,
        label: 'Move root',
        payload: { nodeId: 'root', parentId: 'root', index: 0 },
      }),
    ).toThrow(expect.objectContaining({ code: 'root-protected' }))
    expect(session.getSnapshot()).toMatchObject({
      revision: 0,
      canUndo: false,
      document: { title: 'Original' },
    })
  })

  it('autosaves and reopens typed enhancement edits across undo and redo', async () => {
    const repository = new MemoryMindMapRepository()
    const document = createMindMapDocument({
      id: 'enhancement-session',
      rootNodeId: 'root',
      title: 'Enhancements',
      now: '2026-07-15T00:00:00.000Z',
    })
    document.nodes.root!.childIds = ['child']
    document.nodes.child = createMindMapNode({
      id: 'child',
      parentId: 'root',
      text: 'Child',
    })
    document.relationships = [
      createMindMapRelationship({
        id: 'relation',
        fromNodeId: 'root',
        toNodeId: 'child',
        label: 'Related',
      }),
    ]
    await repository.save(document)
    const session = new EditorSession(document, repository, {
      debounceMs: 1_000,
      now: () => '2026-07-15T00:00:01.000Z',
    })

    session.execute({
      type: mindMapCommandTypes.createCallout,
      label: 'Create callout',
      payload: {
        callout: createMindMapCallout({
          id: 'callout',
          ownerNodeId: 'child',
          text: 'Persist me',
        }),
      },
    })
    session.execute({
      type: mindMapCommandTypes.updateRelationship,
      label: 'Style relationship',
      payload: {
        relationshipId: 'relation',
        changes: {
          controlPoints: [{ x: 20, y: -40 }],
          style: { color: '#dc2626', width: 4 },
        },
      },
    })
    session.undo()
    expect(session.getSnapshot().document.relationships[0]).toMatchObject({
      controlPoints: [],
      style: { color: '#8b83dc', width: 2 },
    })
    session.redo()
    await session.flush()

    const reopened = await repository.get('enhancement-session')
    expect(reopened?.callouts[0]).toMatchObject({
      id: 'callout',
      text: 'Persist me',
    })
    expect(reopened?.relationships[0]).toMatchObject({
      controlPoints: [{ x: 20, y: -40 }],
      style: { color: '#dc2626', width: 4 },
    })
    session.dispose()
  })
})
