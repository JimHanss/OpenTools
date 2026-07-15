import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import {
  MemoryMindMapRepository,
  type MindMapRepository,
} from '@opentools/mindmap-storage'

import { AutosaveController } from './autosave'

function createDocument(title: string): MindMapDocument {
  return createMindMapDocument({
    id: 'autosave-map',
    rootNodeId: 'root',
    title,
    now: '2026-07-14T00:00:00.000Z',
  })
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

class DelayedRepository implements MindMapRepository {
  readonly savedTitles: string[] = []

  async get(): Promise<undefined> {
    return undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return []
  }

  async save(document: MindMapDocument): Promise<void> {
    this.savedTitles.push(document.title)
    await wait(5)
  }

  async delete(): Promise<void> {}
}

class FailingRepository implements MindMapRepository {
  async get(): Promise<undefined> {
    return undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return []
  }

  async save(): Promise<void> {
    throw new Error('Write failed')
  }

  async delete(): Promise<void> {}
}

describe('AutosaveController', () => {
  it('debounces rapid edits and saves the newest scheduled revision', async () => {
    const repository = new MemoryMindMapRepository()
    const autosave = new AutosaveController(repository, { debounceMs: 5 })

    autosave.schedule(createDocument('First'), 1)
    autosave.schedule(createDocument('Second'), 2)
    await wait(20)

    expect((await repository.get('autosave-map'))?.title).toBe('Second')
    expect(autosave.getStatus()).toEqual({ state: 'saved', revision: 2 })
  })

  it('serializes overlapping writes and does not report stale success', async () => {
    const repository = new DelayedRepository()
    const statusHistory: string[] = []
    const autosave = new AutosaveController(repository, {
      debounceMs: 100,
      onStatusChange: (status) =>
        statusHistory.push(`${status.state}:${status.revision}`),
    })

    autosave.schedule(createDocument('First'), 1)
    const flush = autosave.flush()
    autosave.schedule(createDocument('Second'), 2)
    await flush

    expect(repository.savedTitles).toEqual(['First', 'Second'])
    expect(statusHistory).not.toContain('saved:1')
    expect(autosave.getStatus()).toEqual({ state: 'saved', revision: 2 })
  })

  it('exposes failed saves and flushes without waiting for the debounce delay', async () => {
    const failingAutosave = new AutosaveController(new FailingRepository(), {
      debounceMs: 1_000,
    })
    failingAutosave.schedule(createDocument('Failure'), 3)

    await expect(failingAutosave.flush()).rejects.toThrow('Write failed')
    expect(failingAutosave.getStatus()).toMatchObject({
      state: 'error',
      revision: 3,
    })

    const repository = new MemoryMindMapRepository()
    const autosave = new AutosaveController(repository, { debounceMs: 1_000 })
    autosave.schedule(createDocument('Flush now'), 4)
    await autosave.flush()

    expect((await repository.get('autosave-map'))?.title).toBe('Flush now')
    expect(autosave.getStatus()).toEqual({ state: 'saved', revision: 4 })
  })
})
