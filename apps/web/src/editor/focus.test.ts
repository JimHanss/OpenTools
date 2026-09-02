import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  createV3FeatureFixture,
} from '@opentools/mindmap-core'

import {
  createEditorBranchFocus,
  emptyEditorBranchFocusState,
  isNodeInsideBranchFocus,
  restoreSelectionAfterBranchFocus,
} from './focus'

function createDocument() {
  const document = createMindMapDocument({
    id: 'focus-map',
    rootNodeId: 'root',
    title: 'Root',
    now: '2026-07-15T00:00:00.000Z',
  })
  document.nodes.root!.childIds.push('parent')
  document.nodes.parent = createMindMapNode({
    id: 'parent',
    parentId: 'root',
    childIds: ['child'],
    text: 'Parent',
  })
  document.nodes.child = createMindMapNode({
    id: 'child',
    parentId: 'parent',
    text: 'Child',
  })
  return document
}

describe('branch focus navigation', () => {
  it('builds breadcrumbs and restores a valid previous selection', () => {
    const document = createDocument()
    const focus = createEditorBranchFocus(document, 'parent', ['child'])
    expect(focus.breadcrumbNodeIds).toEqual(['root', 'parent'])
    expect(isNodeInsideBranchFocus(document, 'parent', 'child')).toBe(true)
    expect(isNodeInsideBranchFocus(document, 'parent', 'root')).toBe(false)
    expect(restoreSelectionAfterBranchFocus(document, focus)).toEqual(['child'])
  })

  it('falls back safely when undo removes the focus target or selection', () => {
    const document = createDocument()
    const focus = createEditorBranchFocus(document, 'parent', ['child'])
    delete document.nodes.child
    document.nodes.parent!.childIds = []
    expect(restoreSelectionAfterBranchFocus(document, focus)).toEqual(['root'])
    expect(createEditorBranchFocus(document, 'missing', [])).toBe(
      emptyEditorBranchFocusState,
    )
  })

  it('treats the main tree and every floating tree as separate focus boundaries', () => {
    const document = createV3FeatureFixture()
    expect(isNodeInsideBranchFocus(document, 'root', 'floating-root')).toBe(
      false,
    )
    expect(
      isNodeInsideBranchFocus(document, 'floating-root', 'floating-child'),
    ).toBe(true)
    expect(isNodeInsideBranchFocus(document, 'floating-root', 'wide-1')).toBe(
      false,
    )
    expect(
      createEditorBranchFocus(document, 'floating-child', ['wide-1'])
        .breadcrumbNodeIds,
    ).toEqual(['floating-root', 'floating-child'])
  })
})
