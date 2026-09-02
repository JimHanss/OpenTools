import { describe, expect, it } from 'vitest'

import {
  CommandHistory,
  createMindMapClipboardPayload,
  createMindMapDocument,
  duplicateMindMapClipboardPayload,
  executeMindMapCommand,
  mindMapCommandTypes,
  type MindMapEquationContentBlock,
} from './index'

const context = { now: '2026-07-15T06:00:00.000Z' }
const equation: MindMapEquationContentBlock = {
  id: 'equation-block',
  type: 'equation',
  source: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
  displayMode: 'block',
  width: 218,
  height: 48,
}

function createDocument() {
  return createMindMapDocument({
    id: 'equation-map',
    rootNodeId: 'root',
    title: 'Equation map',
    now: context.now,
  })
}

describe('equation content block commands', () => {
  it('creates, updates, deletes and restores through inverse commands', () => {
    const created = executeMindMapCommand(
      createDocument(),
      {
        type: mindMapCommandTypes.createEquationContentBlock,
        label: 'Add equation',
        payload: { nodeId: 'root', block: equation },
      },
      context,
    )
    expect(created.document.nodes.root?.contentBlocks).toEqual([equation])

    const updated = executeMindMapCommand(
      created.document,
      {
        type: mindMapCommandTypes.updateEquationContentBlock,
        label: 'Update equation',
        payload: {
          nodeId: 'root',
          blockId: equation.id,
          changes: { source: String.raw`E = mc^2`, width: 96, height: 32 },
        },
      },
      context,
    )
    expect(updated.document.nodes.root?.contentBlocks[0]).toMatchObject({
      source: String.raw`E = mc^2`,
      width: 96,
      height: 32,
    })
    expect(
      executeMindMapCommand(updated.document, updated.inverse, context).document
        .nodes.root?.contentBlocks[0],
    ).toEqual(equation)

    const deleted = executeMindMapCommand(
      updated.document,
      {
        type: mindMapCommandTypes.deleteEquationContentBlock,
        label: 'Delete equation',
        payload: { nodeId: 'root', blockId: equation.id },
      },
      context,
    )
    expect(deleted.document.nodes.root?.contentBlocks).toEqual([])
    expect(
      executeMindMapCommand(deleted.document, deleted.inverse, context).document
        .nodes.root?.contentBlocks[0],
    ).toMatchObject({ source: String.raw`E = mc^2` })
  })

  it('supports exact history undo/redo and remaps copied block IDs', () => {
    const history = new CommandHistory()
    const created = history.execute(
      createDocument(),
      {
        type: mindMapCommandTypes.createEquationContentBlock,
        label: 'Add equation',
        payload: { nodeId: 'root', block: equation },
      },
      context,
      executeMindMapCommand,
    )
    const undone = history.undo(
      created.document,
      context,
      executeMindMapCommand,
    )
    expect(undone?.document.nodes.root?.contentBlocks).toEqual([])
    expect(
      history.redo(undone!.document, context, executeMindMapCommand)?.document
        .nodes.root?.contentBlocks,
    ).toEqual([equation])

    const payload = createMindMapClipboardPayload(created.document, ['root'])
    const duplicated = duplicateMindMapClipboardPayload(
      payload,
      () => 'copied-node',
      (kind) => `copied-${kind}`,
    )
    const copiedEquation =
      duplicated.roots[0]?.nodes['copied-node']?.contentBlocks[0]
    expect(copiedEquation).toMatchObject({
      type: 'equation',
      source: equation.source,
    })
    expect(copiedEquation?.id).not.toBe(equation.id)
  })

  it('rejects empty, excessive and invalid geometry without mutation', () => {
    for (const invalid of [
      { ...equation, source: '   ' },
      { ...equation, source: 'x'.repeat(10_001) },
      { ...equation, width: 0 },
      { ...equation, height: Number.NaN },
    ]) {
      const document = createDocument()
      expect(() =>
        executeMindMapCommand(
          document,
          {
            type: mindMapCommandTypes.createEquationContentBlock,
            label: 'Add invalid equation',
            payload: { nodeId: 'root', block: invalid },
          },
          context,
        ),
      ).toThrowError('The equation content block is invalid.')
      expect(document.nodes.root?.contentBlocks).toEqual([])
    }
  })
})
