import { describe, expect, it } from 'vitest'

import {
  createFiftyNodeFixture,
  createFiveHundredNodeFixture,
  createMindMapDocument,
  findNodeIdsByText,
  mindMapCommandTypes,
  queryMindMap,
} from '@opentools/mindmap-core'
import { layoutMindMap, layoutMindMapSubtree } from '@opentools/mindmap-layout'
import { createMindMapSvgScene } from '@opentools/mindmap-renderer-svg'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { createChildNodeCommand } from './actions'
import {
  EditorActionRegistry,
  editorActionDescriptors,
  type EditorActionId,
  type EditorActionRuntime,
} from './action-registry'
import { createEditorBranchFocus, emptyEditorBranchFocusState } from './focus'
import { EditorSession } from './session'
import { panViewport, zoomViewportAtPoint } from './viewport'

interface ProfileResult {
  readonly label: string
  readonly milliseconds: number
}

function profile<Result>(
  label: string,
  operation: () => Result,
): { readonly result: Result; readonly timing: ProfileResult } {
  const start = performance.now()
  const result = operation()
  return {
    result,
    timing: { label, milliseconds: performance.now() - start },
  }
}

function allNoopHandlers(): Record<EditorActionId, () => void> {
  return Object.fromEntries(
    editorActionDescriptors.map(({ id }) => [id, () => undefined]),
  ) as Record<EditorActionId, () => void>
}

describe('large-map regression coverage', () => {
  it('creates and reorders 50 keyboard-style topics without losing text', async () => {
    const repository = new MemoryMindMapRepository()
    const session = new EditorSession(
      createMindMapDocument({
        id: 'keyboard-performance',
        rootNodeId: 'root',
        title: 'Keyboard performance',
        now: '2026-07-15T04:00:00.000Z',
      }),
      repository,
      { debounceMs: 10_000, now: () => '2026-07-15T04:01:00.000Z' },
    )

    const { timing: editTiming } = profile('50 topic command edits', () => {
      for (let index = 1; index <= 50; index += 1) {
        session.execute(
          createChildNodeCommand(
            session.getSnapshot().document,
            'root',
            `typed-${index}`,
            `Keyboard input ${index}`,
          ),
        )
      }
      for (let index = 50; index >= 41; index -= 1) {
        session.execute({
          type: mindMapCommandTypes.moveNode,
          label: 'Keyboard reorder topic',
          payload: { nodeId: `typed-${index}`, parentId: 'root', index: 0 },
        })
      }
    })
    const edited = session.getSnapshot().document
    const { result: scene, timing: renderTiming } = profile(
      '50 topic layout and scene',
      () => createMindMapSvgScene(edited, layoutMindMap(edited)),
    )

    expect(Object.keys(edited.nodes)).toHaveLength(51)
    expect(
      new Set(
        Object.values(edited.nodes)
          .filter((node) => node.id !== 'root')
          .map((node) => node.text),
      ).size,
    ).toBe(50)
    expect(edited.nodes.root?.childIds.slice(0, 10)).toEqual(
      Array.from({ length: 10 }, (_, index) => `typed-${41 + index}`),
    )
    expect(scene.nodes).toHaveLength(51)
    expect(editTiming.milliseconds).toBeLessThan(3_000)
    expect(renderTiming.milliseconds).toBeLessThan(1_000)
    await session.flush()
    expect((await repository.get(edited.id))?.nodes).toHaveProperty('typed-50')
    console.info('[performance]', editTiming, renderTiming)
  })

  it('keeps the deterministic 50-node fixture layout-capable', () => {
    const document = createFiftyNodeFixture()
    expect(
      createMindMapSvgScene(document, layoutMindMap(document)).nodes,
    ).toHaveLength(51)
  })

  it('profiles 500-node layout switching, scene, query/focus, viewport, toolbar and save', async () => {
    const document = createFiveHundredNodeFixture()
    const repository = new MemoryMindMapRepository()
    const session = new EditorSession(document, repository, {
      debounceMs: 10_000,
      now: () => '2026-07-15T04:02:00.000Z',
    })
    const timings: ProfileResult[] = []
    const { result: layout, timing: layoutTiming } = profile(
      '500 topic initial layout',
      () => layoutMindMap(document),
    )
    timings.push(layoutTiming)
    const { result: scene, timing: sceneTiming } = profile(
      '500 topic scene',
      () => createMindMapSvgScene(document, layout),
    )
    timings.push(sceneTiming)
    expect(layout.nodes).toHaveLength(501)
    expect(scene.nodes).toHaveLength(501)
    expect(findNodeIdsByText(document, 'node 500')).toEqual(['node-500'])

    const { timing: structureTiming } = profile(
      'five layout strategies',
      () => {
        for (const structure of [
          'logic-left',
          'mind-map-balanced',
          'tree-top',
          'org-top',
          'logic-right',
        ] as const) {
          session.execute({
            type: mindMapCommandTypes.setDefaultStructure,
            label: 'Profile layout strategy',
            payload: { structure },
          })
          const current = session.getSnapshot().document
          expect(layoutMindMap(current).nodes).toHaveLength(501)
        }
      },
    )
    timings.push(structureTiming)

    const current = session.getSnapshot().document
    const { result: query, timing: queryTiming } = profile(
      '500 topic query and focus',
      () => {
        const queryResult = queryMindMap(current, {
          text: 'node 500',
          hasNotes: false,
          operator: 'and',
        })
        const focus = createEditorBranchFocus(current, 'node-20', ['node-500'])
        const subtree = layoutMindMapSubtree(current, focus.rootNodeId!, {})
        return { queryResult, focus, subtree }
      },
    )
    timings.push(queryTiming)
    expect(query.queryResult.matchedNodeIds).toEqual(['node-500'])
    expect(query.focus.breadcrumbNodeIds.at(-1)).toBe('node-20')
    expect(query.subtree.nodes.length).toBeGreaterThan(1)

    const { result: viewport, timing: viewportTiming } = profile(
      '1000 viewport pan and zoom operations',
      () => {
        let next = { x: 0, y: 0, zoom: 1 }
        for (let index = 0; index < 500; index += 1) {
          next = panViewport(next, { x: 1, y: -1 })
          next = zoomViewportAtPoint(
            next,
            { x: 640, y: 360 },
            index % 2 === 0 ? 0.01 : -0.01,
          )
        }
        return next
      },
    )
    timings.push(viewportTiming)
    expect(viewport.zoom).toBeCloseTo(1)

    const registry = new EditorActionRegistry()
    const actionRuntime: EditorActionRuntime = {
      document: current,
      selection: { kind: 'topic', ids: ['node-500'] },
      branchFocus: emptyEditorBranchFocusState,
      canUndo: true,
      canRedo: false,
      isBusy: false,
      pendingActionIds: new Set(),
      hasStyleClipboard: true,
      handlers: allNoopHandlers(),
    }
    const { timing: toolbarTiming } = profile(
      '100 toolbar state resolutions',
      () => {
        for (let pass = 0; pass < 100; pass += 1) {
          for (const descriptor of editorActionDescriptors) {
            registry.resolve(descriptor.id, actionRuntime)
          }
        }
      },
    )
    timings.push(toolbarTiming)

    session.execute({
      type: mindMapCommandTypes.setNodeCollapse,
      label: 'Collapse large branch',
      payload: { nodeId: 'node-1', collapsed: true },
    })
    const saveStart = performance.now()
    await session.flush()
    timings.push({
      label: '500 topic autosave',
      milliseconds: performance.now() - saveStart,
    })
    expect(
      (await repository.get(document.id))?.nodes['node-1']?.collapsed,
    ).toBe(true)

    for (const timing of timings) {
      expect(timing.milliseconds, timing.label).toBeLessThan(5_000)
    }
    console.info('[performance]', ...timings)
  }, 15_000)
})
