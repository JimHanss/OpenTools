import { describe, expect, it, vi } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  mindMapCommandTypes,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import {
  EditorActionDispatcher,
  EditorActionRegistry,
  editorActionDescriptors,
  editorActionIds,
  type EditorActionId,
  type EditorActionRuntime,
} from './action-registry'
import { EditorSession } from './session'

function createDocument(): MindMapDocument {
  const document = createMindMapDocument({
    id: 'action-map',
    rootNodeId: 'root',
    title: 'Actions',
    now: '2026-07-15T10:00:00.000Z',
  })
  document.nodes.root!.childIds.push('a', 'b')
  document.nodes.a = createMindMapNode({
    id: 'a',
    parentId: 'root',
    text: 'A',
    childIds: ['a-1'],
  })
  document.nodes['a-1'] = createMindMapNode({
    id: 'a-1',
    parentId: 'a',
    text: 'A.1',
  })
  document.nodes.b = createMindMapNode({
    id: 'b',
    parentId: 'root',
    text: 'B',
  })
  document.nodes.floating = createMindMapNode({
    id: 'floating',
    parentId: null,
    text: 'Floating',
  })
  document.floatingTopics.floating = { x: 320, y: 180 }
  return document
}

function allHandlers(): Record<EditorActionId, () => unknown> {
  const handlers = {} as Record<EditorActionId, () => unknown>
  for (const { id } of editorActionDescriptors) {
    handlers[id] = vi.fn<() => void>()
  }
  return handlers
}

function createRuntime(
  overrides: Partial<EditorActionRuntime> = {},
): EditorActionRuntime {
  return {
    document: createDocument(),
    selection: { kind: 'topic', ids: ['a'] },
    branchFocus: {
      rootNodeId: null,
      breadcrumbNodeIds: [],
      previousSelectionNodeIds: [],
    },
    canUndo: true,
    canRedo: true,
    isBusy: false,
    pendingActionIds: new Set(),
    hasStyleClipboard: true,
    handlers: allHandlers(),
    ...overrides,
  }
}

describe('EditorActionRegistry contract', () => {
  it('defines unique IDs, required groups, labels, shortcuts and route kinds', () => {
    const registry = new EditorActionRegistry()
    const ids = editorActionDescriptors.map(({ id }) => id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(editorActionDescriptors.map(({ group }) => group))).toEqual(
      new Set([
        'History',
        'Topic',
        'Structure',
        'Insert',
        'Style',
        'View',
        'File',
      ]),
    )
    expect(registry.get(editorActionIds.undo)).toMatchObject({
      kind: 'command',
      shortcut: 'Ctrl/⌘+Z',
      labelKey: 'actions.history.undo.label',
    })
    expect(registry.get(editorActionIds.zoomIn).kind).toBe('ui')
    expect(registry.get(editorActionIds.exportPng).kind).toBe('platform')
    expect(registry.list('Insert')).toHaveLength(11)
  })

  it('resolves history, busy, pending and missing-capability states', () => {
    const registry = new EditorActionRegistry()
    expect(
      registry.resolve(editorActionIds.undo, createRuntime({ canUndo: false })),
    ).toMatchObject({
      enabled: false,
      disabledReasonKey: 'actions.disabled.noUndo',
    })
    expect(
      registry.resolve(editorActionIds.redo, createRuntime({ isBusy: true })),
    ).toMatchObject({
      enabled: false,
      disabledReasonKey: 'actions.disabled.busy',
    })
    expect(
      registry.resolve(
        editorActionIds.exportSvg,
        createRuntime({
          pendingActionIds: new Set([editorActionIds.exportSvg]),
        }),
      ),
    ).toMatchObject({
      enabled: false,
      pending: true,
      disabledReasonKey: 'actions.disabled.pending',
    })
    expect(
      registry.resolve(editorActionIds.zoomIn, createRuntime({ handlers: {} }))
        .disabledReasonKey,
    ).toBe('actions.disabled.unavailable')
  })

  it('covers none, root, normal, floating, multi and enhancement selections', () => {
    const registry = new EditorActionRegistry()
    expect(
      registry.resolve(
        editorActionIds.edit,
        createRuntime({ selection: { kind: 'none' } }),
      ).disabledReasonKey,
    ).toBe('actions.disabled.selectTopic')
    expect(
      registry.resolve(
        editorActionIds.delete,
        createRuntime({ selection: { kind: 'topic', ids: ['root'] } }),
      ).disabledReasonKey,
    ).toBe('actions.disabled.rootProtected')
    expect(
      registry.resolve(editorActionIds.edit, createRuntime()).enabled,
    ).toBe(true)
    expect(
      registry.resolve(editorActionIds.convertToFloatingTopic, createRuntime())
        .enabled,
    ).toBe(true)
    expect(
      registry.resolve(
        editorActionIds.collapse,
        createRuntime({ selection: { kind: 'topic', ids: ['b'] } }),
      ).disabledReasonKey,
    ).toBe('actions.disabled.noChildren')
    expect(
      registry.resolve(
        editorActionIds.edit,
        createRuntime({ selection: { kind: 'topic', ids: ['floating'] } }),
      ).enabled,
    ).toBe(true)
    expect(
      registry.resolve(
        editorActionIds.convertToFloatingTopic,
        createRuntime({ selection: { kind: 'topic', ids: ['floating'] } }),
      ).disabledReasonKey,
    ).toBe('actions.disabled.alreadyFloatingTopic')
    expect(
      registry.resolve(
        editorActionIds.edit,
        createRuntime({ selection: { kind: 'topic', ids: ['a', 'b'] } }),
      ).disabledReasonKey,
    ).toBe('actions.disabled.selectOneTopic')
    expect(
      registry.resolve(
        editorActionIds.delete,
        createRuntime({ selection: { kind: 'relationship', id: 'rel-1' } }),
      ).enabled,
    ).toBe(true)
    expect(
      registry.resolve(
        editorActionIds.insertRelationship,
        createRuntime({ selection: { kind: 'topic', ids: ['a', 'b'] } }),
      ).enabled,
    ).toBe(true)
  })

  it('reports active collapse, focus and structure state from current data', () => {
    const registry = new EditorActionRegistry()
    const document = createDocument()
    document.nodes.a!.collapsed = true
    document.structureOverrides.a = 'org-top'
    const runtime = createRuntime({
      document,
      branchFocus: {
        rootNodeId: 'a',
        breadcrumbNodeIds: ['root', 'a'],
        previousSelectionNodeIds: ['b'],
      },
    })

    expect(registry.resolve(editorActionIds.collapse, runtime).active).toBe(
      true,
    )
    expect(registry.resolve(editorActionIds.focusBranch, runtime).active).toBe(
      true,
    )
    expect(registry.resolve(editorActionIds.orgTop, runtime).active).toBe(true)
    expect(registry.resolve(editorActionIds.logicRight, runtime).active).toBe(
      false,
    )
    expect(registry.resolve(editorActionIds.themeClassic, runtime).active).toBe(
      true,
    )
  })
})

describe('EditorActionDispatcher', () => {
  it('reads live runtime state and never stores a document copy', async () => {
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()
    let runtime = createRuntime({
      handlers: { [editorActionIds.edit]: firstHandler },
    })
    const dispatcher = new EditorActionDispatcher(() => runtime)
    await dispatcher.dispatch(editorActionIds.edit)

    runtime = createRuntime({
      document: { ...createDocument(), title: 'Latest document' },
      selection: { kind: 'topic', ids: ['b'] },
      handlers: { [editorActionIds.edit]: secondHandler },
    })
    await dispatcher.dispatch(editorActionIds.edit)

    expect(firstHandler).toHaveBeenCalledOnce()
    expect(secondHandler).toHaveBeenCalledOnce()
    expect(dispatcher.resolve(editorActionIds.edit).enabled).toBe(true)
  })

  it('returns a localized disabled reason instead of silently executing', async () => {
    const handler = vi.fn()
    const runtime = createRuntime({
      selection: { kind: 'topic', ids: ['root'] },
      handlers: { [editorActionIds.delete]: handler },
    })
    const result = await new EditorActionDispatcher(() => runtime).dispatch(
      editorActionIds.delete,
    )

    expect(result).toEqual({
      status: 'disabled',
      id: editorActionIds.delete,
      reasonKey: 'actions.disabled.rootProtected',
    })
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('shared Action entry equivalence', () => {
  it.each(['toolbar', 'shortcut', 'context-menu', 'inspector'])(
    '%s executes the same document, history and autosave transition',
    async () => {
      const document = createDocument()
      const repository = new MemoryMindMapRepository()
      await repository.save(document)
      const session = new EditorSession(document, repository, {
        debounceMs: 1_000,
        now: () => '2026-07-15T10:01:00.000Z',
      })
      const runtime = createRuntime({
        document,
        handlers: {
          [editorActionIds.collapse]: () =>
            session.execute({
              type: mindMapCommandTypes.setNodeCollapse,
              label: 'Collapse topic',
              payload: { nodeId: 'a', collapsed: true },
            }),
        },
      })

      const result = await new EditorActionDispatcher(() => runtime).dispatch(
        editorActionIds.collapse,
      )
      await session.flush()
      const snapshot = session.getSnapshot()

      expect(result.status).toBe('executed')
      expect(snapshot).toMatchObject({
        revision: 1,
        canUndo: true,
        canRedo: false,
        saveStatus: { state: 'saved', revision: 1 },
      })
      expect(snapshot.document.nodes.a?.collapsed).toBe(true)
      expect((await repository.get(document.id))?.nodes.a?.collapsed).toBe(true)
      session.dispose()
    },
  )
})
