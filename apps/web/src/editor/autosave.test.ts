import { describe, expect, it } from 'vitest'

import {
  cloneMindMapDocument,
  createMindMapAssetId,
  createMindMapDocument,
  createV3FeatureFixture,
  getMindMapThemePreset,
  mindMapCommandTypes,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import {
  MemoryMindMapRepository,
  type MindMapRepository,
} from '@opentools/mindmap-storage'

import { AutosaveController } from './autosave'
import { EditorSession } from './session'

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

class GatedRepository implements MindMapRepository {
  readonly saved: MindMapDocument[] = []
  #releaseFirstSave: (() => void) | undefined
  #resolveFirstSaveStarted: () => void = () => undefined
  readonly firstSaveStarted = new Promise<void>((resolve) => {
    this.#resolveFirstSaveStarted = resolve
  })

  async get(): Promise<undefined> {
    return undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return []
  }

  async save(document: MindMapDocument): Promise<void> {
    this.saved.push(cloneMindMapDocument(document))
    if (this.saved.length === 1) {
      this.#resolveFirstSaveStarted()
      await new Promise<void>((resolve) => {
        this.#releaseFirstSave = resolve
      })
    }
  }

  release(): void {
    this.#releaseFirstSave?.()
  }

  async delete(): Promise<void> {}
}

class RecoveringRepository implements MindMapRepository {
  readonly saved: MindMapDocument[] = []
  shouldFail = true

  async get(): Promise<undefined> {
    return undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return []
  }

  async save(document: MindMapDocument): Promise<void> {
    if (this.shouldFail) throw new Error('Simulated repository failure')
    this.saved.push(cloneMindMapDocument(document))
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

  it('persists only the newest rich schema revision while an older write is in flight', async () => {
    const repository = new GatedRepository()
    const session = new EditorSession(createV3FeatureFixture(), repository, {
      debounceMs: 10_000,
      now: () => '2026-07-15T01:00:00.000Z',
    })
    const checksum = `sha256:${'f'.repeat(64)}`
    const imageAssetId = createMindMapAssetId(checksum)

    session.execute({
      type: mindMapCommandTypes.setDefaultStructure,
      label: 'Change layout while saving',
      payload: { structure: 'tree-top' },
    })
    const flush = session.flush()
    await repository.firstSaveStarted

    session.execute({
      type: mindMapCommandTypes.createImageContentBlock,
      label: 'Paste image while saving',
      payload: {
        nodeId: 'wide-2',
        block: {
          id: 'overlap-image',
          type: 'image',
          assetId: imageAssetId,
          width: 240,
          height: 120,
          altText: 'Autosave image',
          preserveAspectRatio: true,
        },
        asset: {
          id: imageAssetId,
          kind: 'image',
          mimeType: 'image/png',
          byteSize: 4,
          checksum,
          intrinsicWidth: 2,
          intrinsicHeight: 1,
          createdAt: '2026-07-15T01:00:00.000Z',
        },
      },
    })
    session.execute({
      type: mindMapCommandTypes.updateEquationContentBlock,
      label: 'Edit formula while saving',
      payload: {
        nodeId: 'wide-1',
        blockId: 'content-equation',
        changes: { source: String.raw`a^2 + b^2 = c^2` },
      },
    })
    session.execute({
      type: mindMapCommandTypes.setFloatingTopicPlacement,
      label: 'Move floating topic while saving',
      payload: {
        nodeId: 'floating-root',
        placement: { x: 920, y: -320, structure: 'logic-right' },
      },
    })
    session.undo()
    session.redo()
    session.execute({
      type: mindMapCommandTypes.updateTheme,
      label: 'Change theme while saving',
      payload: { theme: getMindMapThemePreset('forest')! },
    })

    repository.release()
    await flush

    expect(repository.saved).toHaveLength(2)
    const latest = repository.saved.at(-1)!
    expect(latest.schemaVersion).toBe(3)
    expect(latest.defaultStructure).toBe('tree-top')
    expect(latest.theme.id).toBe('forest')
    expect(latest.nodes['wide-2']?.contentBlocks).toContainEqual(
      expect.objectContaining({ id: 'overlap-image', assetId: imageAssetId }),
    )
    expect(latest.nodes['wide-1']?.contentBlocks).toContainEqual(
      expect.objectContaining({
        id: 'content-equation',
        source: String.raw`a^2 + b^2 = c^2`,
      }),
    )
    expect(latest.floatingTopics['floating-root']).toMatchObject({
      x: 920,
      y: -320,
    })
    expect(latest.labels['label-roadmap']).toBeDefined()
    expect(latest.nodes.root?.numbering).toBeDefined()
    expect(latest.callouts).toHaveLength(1)
    expect(session.getSnapshot().saveStatus).toEqual({
      state: 'saved',
      revision: session.getSnapshot().revision,
    })
  })

  it('keeps the current document and history editable after a save failure', async () => {
    const repository = new RecoveringRepository()
    const session = new EditorSession(
      createDocument('Before failure'),
      repository,
      {
        debounceMs: 10_000,
        now: () => '2026-07-15T02:00:00.000Z',
      },
    )

    session.renameMap('Unsaved but editable')
    await expect(session.flush()).rejects.toThrow(
      'Simulated repository failure',
    )
    expect(session.getSnapshot()).toMatchObject({
      canUndo: true,
      document: { title: 'Unsaved but editable' },
      saveStatus: { state: 'error', revision: 1 },
    })

    expect(session.undo()?.document.title).toBe('Before failure')
    expect(session.redo()?.document.title).toBe('Unsaved but editable')
    repository.shouldFail = false
    session.renameMap('Recovered revision')
    await session.flush()

    expect(repository.saved.at(-1)?.title).toBe('Recovered revision')
    expect(session.getSnapshot().saveStatus).toEqual({
      state: 'saved',
      revision: 4,
    })
  })
})
