import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorUiStore } from './store'

describe('editor UI store', () => {
  beforeEach(() => {
    useEditorUiStore.getState().resetEditorUi()
  })

  it('keeps editor-only state separate and supports selection, search, dialogs and save feedback', () => {
    const store = useEditorUiStore.getState()
    store.setSelectedNodeIds(['root', 'child', 'root'])
    store.toggleSelectedNodeId('child')
    store.setEditingNodeId('root')
    store.setViewport({ x: 24, y: -12, zoom: 1.25 })
    store.setDragPreview({
      nodeIds: ['root'],
      targetNodeId: 'child',
      placement: 'child',
    })
    store.setSearch({
      query: 'plan',
      resultNodeIds: ['root'],
      activeResultIndex: 0,
    })
    store.setDialog('confirm-delete-map')
    store.setSaveStatus({ state: 'saved', revision: 3 })
    store.setStyleClipboard({ shape: 'pill', branchWidth: 3 })

    expect(useEditorUiStore.getState()).toMatchObject({
      selection: { kind: 'topic', ids: ['root'] },
      editingNodeId: 'root',
      viewport: { x: 24, y: -12, zoom: 1.25 },
      dragPreview: { placement: 'child' },
      search: { query: 'plan', activeResultIndex: 0 },
      dialog: 'confirm-delete-map',
      saveStatus: { state: 'saved', revision: 3 },
      styleClipboard: { shape: 'pill', branchWidth: 3 },
    })
  })
})
