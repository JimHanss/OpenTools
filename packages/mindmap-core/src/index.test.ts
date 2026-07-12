import { describe, expect, it } from 'vitest'

import { CommandHistory, createMindMapDocument } from './index'

describe('mindmap core bootstrap', () => {
  it('creates a deterministic document without browser APIs', () => {
    const document = createMindMapDocument({
      id: 'map-1',
      rootNodeId: 'node-1',
      title: '产品规划',
      now: '2026-07-12T00:00:00.000Z',
    })

    expect(document.rootNodeId).toBe('node-1')
    expect(document.nodes['node-1']?.text).toBe('产品规划')
    expect(document.schemaVersion).toBe(1)
  })

  it('starts with an empty undo and redo history', () => {
    const history = new CommandHistory()

    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
