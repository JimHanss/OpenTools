import { describe, expect, it } from 'vitest'

import {
  createFiveHundredNodeFixture,
  findNodeIdsByText,
} from '@opentools/mindmap-core'
import { layoutMindMap } from '@opentools/mindmap-layout'
import { createMindMapSvgScene } from '@opentools/mindmap-renderer-svg'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { EditorSession } from './session'

describe('large-map regression coverage', () => {
  it('keeps a 500-node map layout, scene, search, collapse and autosave-capable', async () => {
    const document = createFiveHundredNodeFixture()
    const layout = layoutMindMap(document)
    const scene = createMindMapSvgScene(document, layout)
    expect(layout.nodes).toHaveLength(501)
    expect(scene.nodes).toHaveLength(501)
    expect(findNodeIdsByText(document, 'node 500')).toEqual(['node-500'])

    const repository = new MemoryMindMapRepository()
    const session = new EditorSession(document, repository, { debounceMs: 1 })
    session.execute({
      type: 'node.set-collapse',
      label: 'Collapse large branch',
      payload: { nodeId: 'node-1', collapsed: true },
    })
    await session.flush()
    expect(
      (await repository.get(document.id))?.nodes['node-1']?.collapsed,
    ).toBe(true)
  })
})
