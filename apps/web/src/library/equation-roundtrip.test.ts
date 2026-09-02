import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  mindMapCommandTypes,
} from '@opentools/mindmap-core'
import {
  parseMindMapDocumentJson,
  serializeMindMapDocument,
} from '@opentools/mindmap-format'
import { layoutMindMap } from '@opentools/mindmap-layout'
import {
  createMindMapSvgScene,
  getMindMapEquationRenderKey,
  serializeMindMapSvgScene,
} from '@opentools/mindmap-renderer-svg'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { EditorSession } from '../editor/session'
import { MathJaxEquationRenderer } from '../platform/equation-renderer'
import { MindMapLibraryService } from './map-library'

const equationSvg =
  '<svg width="96" height="32" viewBox="0 0 96 32"><path id="formula" d="M0 16 H96" /></svg>'

describe('equation integration', () => {
  it('round-trips through commands, autosave, reopen, duplicate, JSON and SVG export', async () => {
    const repository = new MemoryMindMapRepository()
    const source = createMindMapDocument({
      id: 'equation-source',
      rootNodeId: 'root',
      title: 'Equation map',
      now: '2026-07-15T07:00:00.000Z',
    })
    await repository.save(source)
    const session = new EditorSession(source, repository, {
      debounceMs: 0,
      now: () => '2026-07-15T07:01:00.000Z',
    })
    session.execute({
      type: mindMapCommandTypes.createEquationContentBlock,
      label: 'Add equation',
      payload: {
        nodeId: 'root',
        block: {
          id: 'formula-block',
          type: 'equation',
          source: String.raw`E = mc^2`,
          displayMode: 'block',
          width: 96,
          height: 32,
        },
      },
    })
    expect(session.undo()?.document.nodes.root?.contentBlocks).toEqual([])
    session.redo()
    await session.flush()

    const library = new MindMapLibraryService(repository, {
      createId: () => 'equation-copy',
      now: () => '2026-07-15T07:02:00.000Z',
      duplicateTitle: (title) => `${title} copy`,
    })
    const reopened = await library.open(source.id)
    expect(reopened.nodes.root?.contentBlocks[0]).toMatchObject({
      type: 'equation',
      source: String.raw`E = mc^2`,
      width: 96,
      height: 32,
    })
    const parsed = parseMindMapDocumentJson(serializeMindMapDocument(reopened))
    expect(parsed).toEqual(reopened)
    const duplicate = await library.duplicate(source.id)
    expect(duplicate.nodes.root?.contentBlocks[0]).toEqual(
      reopened.nodes.root?.contentBlocks[0],
    )

    const renderer = new MathJaxEquationRenderer({
      createEngine: async () => ({ render: async () => equationSvg }),
    })
    const result = await renderer.render({
      source: String.raw`E = mc^2`,
      displayMode: 'block',
      fontSize: reopened.nodes.root!.style.fontSize,
    })
    expect(result.state).toBe('ready')
    const key = getMindMapEquationRenderKey('root', 'formula-block')
    const svg = serializeMindMapSvgScene(
      createMindMapSvgScene(reopened, layoutMindMap(reopened), {
        equations: {
          [key]: {
            id: key,
            nodeId: 'root',
            blockId: 'formula-block',
            state: result.state,
            width: result.width,
            height: result.height,
            ...(result.state === 'ready'
              ? { svg: result.svg }
              : { error: result.error }),
          },
        },
      }),
    )
    expect(svg).toContain('data-equation-id="formula-block"')
    expect(svg).toContain('<path id="equation-')
    expect(svg).not.toContain('foreignObject')
    session.dispose()
  })
})
