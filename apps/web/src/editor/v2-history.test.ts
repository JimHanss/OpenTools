import { describe, expect, it } from 'vitest'

import {
  cloneMindMapDocument,
  createMindMapAssetId,
  createMindMapDocument,
  createMindMapNode,
  defaultMindMapCalloutStyle,
  getMindMapThemePreset,
  getReferencedMindMapAssetIds,
  mindMapCommandTypes,
  type MindMapAssetMetadata,
  type MindMapCommand,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import { layoutMindMap } from '@opentools/mindmap-layout'
import { createMindMapSvgScene } from '@opentools/mindmap-renderer-svg'
import {
  MemoryMindMapAssetRepository,
  MemoryMindMapRepository,
} from '@opentools/mindmap-storage'

import {
  EditorActionDispatcher,
  editorActionIds,
  type EditorActionRuntime,
} from './action-registry'
import { emptyEditorBranchFocusState } from './focus'
import {
  reconcileEditorSelection,
  type EditorSelectionTarget,
} from './selection'
import { EditorSession } from './session'

const checksum = `sha256:${'9'.repeat(64)}`
const assetId = createMindMapAssetId(checksum)

function createDocument(): MindMapDocument {
  return createMindMapDocument({
    id: 'v2-history-map',
    rootNodeId: 'root',
    title: 'V2 history',
    now: '2026-07-15T03:00:00.000Z',
  })
}

function withoutEditTimestamp(document: MindMapDocument): MindMapDocument {
  const clone = cloneMindMapDocument(document)
  const referencedAssetIds = getReferencedMindMapAssetIds(clone)
  clone.assets = Object.fromEntries(
    Object.entries(clone.assets).filter(([assetId]) =>
      referencedAssetIds.has(assetId),
    ),
  )
  return { ...clone, updatedAt: '<edit-time>' }
}

function expectLayoutAndScene(document: MindMapDocument): void {
  const layout = layoutMindMap(document)
  const scene = createMindMapSvgScene(document, layout)
  expect(layout.nodes).toHaveLength(Object.keys(document.nodes).length)
  expect(scene.nodes).toHaveLength(Object.keys(document.nodes).length)
  expect(scene.bounds.width).toBeGreaterThan(0)
  expect(scene.bounds.height).toBeGreaterThan(0)
}

describe('V2 mixed command history', () => {
  it('round-trips structure, semantics, resources and style through a long sequence', async () => {
    const documentRepository = new MemoryMindMapRepository()
    const assetRepository = new MemoryMindMapAssetRepository()
    const document = createDocument()
    const session = new EditorSession(document, documentRepository, {
      debounceMs: 10_000,
      now: () => '2026-07-15T03:01:00.000Z',
    })
    const assetMetadata: MindMapAssetMetadata = {
      id: assetId,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 4,
      checksum,
      intrinsicWidth: 2,
      intrinsicHeight: 2,
      createdAt: '2026-07-15T03:00:00.000Z',
    }
    await assetRepository.put({
      id: assetId,
      mapIds: [document.id],
      metadata: assetMetadata,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: 'image/png',
      }),
    })

    const snapshots = [cloneMindMapDocument(session.getSnapshot().document)]
    const execute = (command: MindMapCommand) => {
      session.execute(command)
      snapshots.push(cloneMindMapDocument(session.getSnapshot().document))
      expectLayoutAndScene(session.getSnapshot().document)
    }

    const runtime = (): EditorActionRuntime => ({
      document: session.getSnapshot().document,
      selection: { kind: 'topic', ids: ['root'] },
      branchFocus: emptyEditorBranchFocusState,
      canUndo: session.getSnapshot().canUndo,
      canRedo: session.getSnapshot().canRedo,
      isBusy: false,
      pendingActionIds: new Set(),
      hasStyleClipboard: false,
      handlers: {
        [editorActionIds.createChild]: () =>
          session.execute({
            type: mindMapCommandTypes.createNode,
            label: 'Action: create child',
            payload: {
              node: createMindMapNode({
                id: 'action-child',
                parentId: null,
                text: 'Action child',
              }),
              parentId: 'root',
              index: 0,
            },
          }),
      },
    })
    const actionResult = await new EditorActionDispatcher(runtime).dispatch(
      editorActionIds.createChild,
    )
    expect(actionResult.status).toBe('executed')
    snapshots.push(cloneMindMapDocument(session.getSnapshot().document))

    execute({
      type: mindMapCommandTypes.setNodeStructure,
      label: 'Set branch structure',
      payload: { nodeId: 'action-child', structure: 'org-top' },
    })
    execute({
      type: mindMapCommandTypes.createFloatingTopic,
      label: 'Create floating topic',
      payload: {
        node: createMindMapNode({
          id: 'floating-topic',
          parentId: null,
          text: 'Floating topic',
        }),
        placement: { x: 580, y: -240, structure: 'logic-left' },
      },
    })
    execute({
      type: mindMapCommandTypes.upsertLabel,
      label: 'Create label',
      payload: {
        value: { id: 'label-important', name: 'Important', color: '#dc2626' },
      },
    })
    execute({
      type: mindMapCommandTypes.setNodeLabels,
      label: 'Assign label',
      payload: {
        nodeId: 'action-child',
        labelIds: ['label-important'],
      },
    })
    execute({
      type: mindMapCommandTypes.setNodeNumbering,
      label: 'Set numbering',
      payload: {
        nodeId: 'root',
        numbering: { style: 'decimal', mode: 'hierarchical', startAt: 1 },
      },
    })
    execute({
      type: mindMapCommandTypes.createCallout,
      label: 'Create callout',
      payload: {
        callout: {
          id: 'callout-history',
          ownerNodeId: 'action-child',
          text: 'History callout',
          placement: 'right',
          offset: { x: 24, y: -12 },
          style: { ...defaultMindMapCalloutStyle },
        },
      },
    })
    execute({
      type: mindMapCommandTypes.createImageContentBlock,
      label: 'Create image block',
      payload: {
        nodeId: 'action-child',
        block: {
          id: 'image-history',
          type: 'image',
          assetId,
          width: 240,
          height: 120,
          altText: 'History image',
          preserveAspectRatio: true,
        },
        asset: assetMetadata,
      },
    })
    execute({
      type: mindMapCommandTypes.createEquationContentBlock,
      label: 'Create equation block',
      payload: {
        nodeId: 'action-child',
        block: {
          id: 'equation-history',
          type: 'equation',
          source: String.raw`x = {-b \pm \sqrt{b^2-4ac} \over 2a}`,
          displayMode: 'block',
        },
      },
    })
    execute({
      type: mindMapCommandTypes.updateNodeStyle,
      label: 'Style topic',
      payload: {
        nodeId: 'action-child',
        style: {
          backgroundColor: '#fef3c7',
          borderColor: '#d97706',
          fontWeight: 'bold',
        },
      },
    })
    execute({
      type: mindMapCommandTypes.updateTheme,
      label: 'Set forest theme',
      payload: { theme: getMindMapThemePreset('forest')! },
    })

    expect(session.getSnapshot().document).toMatchObject({
      defaultStructure: 'logic-right',
      floatingTopics: { 'floating-topic': { x: 580, y: -240 } },
      theme: { id: 'forest' },
    })
    expect(await assetRepository.get(assetId)).toBeDefined()

    let transientSelection: EditorSelectionTarget = {
      kind: 'callout',
      id: 'callout-history',
    }
    for (let index = snapshots.length - 1; index > 0; index -= 1) {
      const undone = session.undo()
      expect(undone).toBeDefined()
      expect(withoutEditTimestamp(session.getSnapshot().document)).toEqual(
        withoutEditTimestamp(snapshots[index - 1]!),
      )
      transientSelection = reconcileEditorSelection(
        session.getSnapshot().document,
        transientSelection,
      )
      if (!session.getSnapshot().document.callouts.length) {
        expect(transientSelection).toEqual({ kind: 'topic', ids: ['root'] })
      }
      expectLayoutAndScene(session.getSnapshot().document)
    }
    expect(session.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
    })
    // Metadata and Blob availability are retained for redo; lifecycle GC may
    // collect the orphan only after history no longer needs it.
    expect(session.getSnapshot().document.assets[assetId]).toEqual(
      assetMetadata,
    )
    expect(await assetRepository.get(assetId)).toBeDefined()

    for (let index = 1; index < snapshots.length; index += 1) {
      const redone = session.redo()
      expect(redone).toBeDefined()
      expect(withoutEditTimestamp(session.getSnapshot().document)).toEqual(
        withoutEditTimestamp(snapshots[index]!),
      )
      expectLayoutAndScene(session.getSnapshot().document)
    }
    expect(session.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
    })
    expect(session.getSnapshot().document.assets[assetId]).toEqual(
      assetMetadata,
    )
    expect(await assetRepository.get(assetId)).toBeDefined()

    session.undo()
    expect(session.getSnapshot().canRedo).toBe(true)
    session.execute({
      type: mindMapCommandTypes.updateNodeNotes,
      label: 'New edit after undo',
      payload: { nodeId: 'action-child', notes: 'Redo must be cleared' },
    })
    expect(session.getSnapshot().canRedo).toBe(false)
    expect(session.redo()).toBeUndefined()
    expectLayoutAndScene(session.getSnapshot().document)
    await session.flush()
    expect(
      (await documentRepository.get(document.id))?.nodes['action-child']?.notes,
    ).toBe('Redo must be cleared')
  })
})
