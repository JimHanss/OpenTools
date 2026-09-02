import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  createMindMapRelationship,
} from '@opentools/mindmap-core'

import {
  createEditorSelectionRect,
  emptyEditorSelection,
  getEditorSelectionCapabilities,
  getIntersectingEditorTopicIds,
  getSelectedTopicIds,
  reconcileEditorSelection,
} from './selection'

function createDocument() {
  const document = createMindMapDocument({
    id: 'selection-map',
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
  return document
}

describe('editor selection reconciliation', () => {
  it('normalizes a marquee and returns every intersecting topic in scene order', () => {
    const rect = createEditorSelectionRect({ x: 240, y: 180 }, { x: 40, y: 20 })
    expect(rect).toEqual({ x: 40, y: 20, width: 200, height: 160 })
    expect(
      getIntersectingEditorTopicIds(
        [
          { id: 'outside', x: 300, y: 300, width: 80, height: 40 },
          { id: 'inside', x: 60, y: 40, width: 80, height: 40 },
          { id: 'edge', x: 240, y: 120, width: 80, height: 40 },
        ],
        rect,
      ),
    ).toEqual(['inside', 'edge'])
  })

  it('keeps valid topic selections and removes duplicate ids', () => {
    const document = createDocument()
    expect(
      reconcileEditorSelection(document, {
        kind: 'topic',
        ids: ['root', 'child'],
      }),
    ).toEqual({ kind: 'topic', ids: ['root', 'child'] })
    expect(
      reconcileEditorSelection(document, {
        kind: 'topic',
        ids: ['child', 'child'],
      }),
    ).toEqual({ kind: 'topic', ids: ['child'] })
  })

  it('falls back to the root when undo removes every selected target', () => {
    const document = createDocument()
    delete document.nodes.child
    document.nodes.root!.childIds = []
    expect(
      reconcileEditorSelection(document, { kind: 'topic', ids: ['child'] }),
    ).toEqual({ kind: 'topic', ids: ['root'] })
    expect(
      reconcileEditorSelection(document, {
        kind: 'callout',
        id: 'missing',
      }),
    ).toEqual({ kind: 'topic', ids: ['root'] })
  })

  it('preserves an intentional empty selection', () => {
    expect(
      reconcileEditorSelection(createDocument(), emptyEditorSelection),
    ).toBe(emptyEditorSelection)
  })

  it('reconciles enhancement ids and exposes target-specific capabilities', () => {
    const document = createDocument()
    document.relationships = [
      createMindMapRelationship({
        id: 'relation',
        fromNodeId: 'root',
        toNodeId: 'child',
        label: 'Related',
      }),
    ]
    const relationship = { kind: 'relationship', id: 'relation' } as const
    expect(reconcileEditorSelection(document, relationship)).toBe(relationship)
    expect(
      getEditorSelectionCapabilities(document, relationship),
    ).toMatchObject({
      canDelete: true,
      canEditGeometry: true,
      canEditStyle: true,
      canApplyTopicBatch: false,
    })
    expect(
      getEditorSelectionCapabilities(document, {
        kind: 'topic',
        ids: ['child'],
      }),
    ).toMatchObject({
      canCreateCallout: true,
      canEditText: true,
      canFocusBranch: true,
    })
    expect(getSelectedTopicIds(relationship)).toEqual([])
  })
})
