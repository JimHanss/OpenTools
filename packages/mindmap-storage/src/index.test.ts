import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import {
  cloneMindMapDocument,
  createMindMapDocument,
} from '@opentools/mindmap-core'

import {
  DexieMindMapRepository,
  MemoryMindMapRepository,
  MindMapRepositoryError,
  toMindMapRepositoryError,
  type MindMapRepository,
} from './index'

let databaseSequence = 0

function createDocument(id: string, updatedAt: string) {
  return createMindMapDocument({
    id,
    rootNodeId: `${id}-root`,
    title: id,
    now: updatedAt,
  })
}

function runRepositoryContract(
  name: string,
  createRepository: () => MindMapRepository,
): void {
  describe(name, () => {
    it('saves, lists, gets and deletes defensive document copies', async () => {
      const repository = createRepository()
      const olderDocument = createDocument('older', '2026-07-12T00:00:00.000Z')
      const newerDocument = createDocument('newer', '2026-07-13T00:00:00.000Z')

      await repository.save(olderDocument)
      await repository.save(newerDocument)
      olderDocument.title = 'Changed after save'

      const documents = await repository.list()
      expect(documents.map((document) => document.id)).toEqual([
        'newer',
        'older',
      ])
      expect(documents[1]?.title).toBe('older')

      const storedDocument = await repository.get('newer')
      expect(storedDocument).toEqual(newerDocument)
      if (!storedDocument) throw new Error('Expected a stored document')
      storedDocument.title = 'Changed after get'
      expect((await repository.get('newer'))?.title).toBe('newer')

      await repository.delete('older')
      expect(await repository.get('older')).toBeUndefined()
    })
  })
}

runRepositoryContract('memory repository', () => new MemoryMindMapRepository())
runRepositoryContract('Dexie repository', () => {
  databaseSequence += 1
  return new DexieMindMapRepository(`opentools-test-${databaseSequence}`)
})

describe('repository errors', () => {
  it('maps storage failures to stable recoverable errors', () => {
    const originalError = new Error('IndexedDB is unavailable')
    const error = toMindMapRepositoryError(originalError, 'write-failed')

    expect(error).toBeInstanceOf(MindMapRepositoryError)
    expect(error.code).toBe('write-failed')
    expect(error.message).toBe(
      'The mind map could not be saved to local storage.',
    )
    expect(error.cause).toBe(originalError)
  })

  it('does not expose live references when a caller keeps a clone', async () => {
    const repository = new MemoryMindMapRepository()
    const document = createDocument('copy', '2026-07-12T00:00:00.000Z')
    const detachedCopy = cloneMindMapDocument(document)

    await repository.save(detachedCopy)
    detachedCopy.nodes['copy-root']!.text = 'Detached mutation'

    expect((await repository.get('copy'))?.nodes['copy-root']?.text).toBe(
      'copy',
    )
  })
})
