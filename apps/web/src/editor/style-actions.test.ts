import { beforeEach, describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
  executeMindMapCommand,
  getComputedMindMapNodeStyle,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import {
  createBatchStyleCommand,
  createResetStyleCommand,
  createScopedStyleCommand,
} from './actions'
import { useEditorUiStore } from './store'

const context = { now: '2026-07-15T09:00:00.000Z' }

function append(document: MindMapDocument, parentId: string, id: string) {
  document.nodes[parentId]!.childIds.push(id)
  document.nodes[id] = createMindMapNode({ id, parentId, text: id })
}

function createDocument() {
  const document = createMindMapDocument({
    id: 'web-style-actions',
    rootNodeId: 'root',
    title: 'Styles',
    now: context.now,
  })
  append(document, 'root', 'a')
  append(document, 'root', 'b')
  append(document, 'a', 'a-1')
  append(document, 'b', 'b-1')
  return document
}

describe('Web style actions', () => {
  beforeEach(() => useEditorUiStore.getState().resetEditorUi())

  it('keeps the style clipboard independent from topic selection and content', () => {
    const store = useEditorUiStore.getState()
    store.setSelectedNodeIds(['a'])
    store.setStyleClipboard({ shape: 'pill', textColor: '#123456' })
    store.setSelectedNodeIds(['b'])

    expect(useEditorUiStore.getState().styleClipboard).toEqual({
      shape: 'pill',
      textColor: '#123456',
    })
    expect(useEditorUiStore.getState().selection).toEqual({
      kind: 'topic',
      ids: ['b'],
    })
  })

  it('applies actual multi-selection atomically without changing topic content', () => {
    const document = createDocument()
    const result = executeMindMapCommand(
      document,
      createBatchStyleCommand(document, ['a', 'a-1'], {
        backgroundColor: '#abcdef',
      }),
      context,
    )

    expect(result.document.nodes.a!.styleOverrides.backgroundColor).toBe(
      '#abcdef',
    )
    expect(result.document.nodes['a-1']!.styleOverrides.backgroundColor).toBe(
      '#abcdef',
    )
    expect(result.document.nodes.a!.text).toBe('a')
    expect(
      executeMindMapCommand(result.document, result.inverse, context).document,
    ).toEqual(document)
  })

  it('builds sibling, descendant and level scope batches', () => {
    const document = createDocument()
    const siblings = executeMindMapCommand(
      document,
      createScopedStyleCommand(document, ['a'], 'siblings', {
        shape: 'rectangle',
      }),
      context,
    ).document
    const descendants = executeMindMapCommand(
      siblings,
      createScopedStyleCommand(siblings, ['a'], 'descendants', {
        fontWeight: 'bold',
      }),
      context,
    ).document
    const sameLevel = executeMindMapCommand(
      descendants,
      createScopedStyleCommand(descendants, ['a-1'], 'level', {
        textAlign: 'right',
      }),
      context,
    ).document

    expect(
      ['a', 'b'].map((id) => getComputedMindMapNodeStyle(siblings, id).shape),
    ).toEqual(['rectangle', 'rectangle'])
    expect(getComputedMindMapNodeStyle(descendants, 'a-1').fontWeight).toBe(
      'bold',
    )
    expect(
      ['a-1', 'b-1'].map(
        (id) => getComputedMindMapNodeStyle(sameLevel, id).textAlign,
      ),
    ).toEqual(['right', 'right'])
  })

  it('resets overrides so the current theme becomes visible again', () => {
    const document = createDocument()
    const styled = executeMindMapCommand(
      document,
      createBatchStyleCommand(document, ['a'], {
        shape: 'pill',
        textColor: '#010203',
      }),
      context,
    ).document
    const reset = executeMindMapCommand(
      styled,
      createResetStyleCommand(styled, ['a']),
      context,
    ).document

    expect(reset.nodes.a!.styleOverrides).toEqual({})
    expect(getComputedMindMapNodeStyle(reset, 'a').shape).toBe(
      'rounded-rectangle',
    )
  })
})
