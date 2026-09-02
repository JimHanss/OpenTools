import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMindMapAssetId,
  createMindMapDocument,
  type MindMapAssetMetadata,
} from '@opentools/mindmap-core'

import {
  assertMindMapAssetWithinLimits,
  collectOrphanMindMapAssets,
  DexieMindMapAssetRepository,
  DexieMindMapRepository,
  getMindMapStoredAssetReferenceCount,
  MemoryMindMapAssetRepository,
  MemoryMindMapRepository,
  MindMapAssetGarbageCollector,
  MindMapAssetRepositoryError,
  type MindMapAssetRepository,
  type MindMapRepositoryWithAssets,
  type MindMapStoredAsset,
} from './index'

let databaseSequence = 0
const checksum = `sha256:${'a'.repeat(64)}`
const assetId = createMindMapAssetId(checksum)

function createAsset(
  mapIds: readonly string[] = ['map-a'],
): MindMapStoredAsset {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
    type: 'image/png',
  })
  const metadata: MindMapAssetMetadata = {
    id: assetId,
    kind: 'image',
    mimeType: 'image/png',
    byteSize: blob.size,
    checksum,
    intrinsicWidth: 2,
    intrinsicHeight: 2,
    createdAt: '2026-07-15T00:00:00.000Z',
  }
  return { id: assetId, mapIds, metadata, blob }
}

function runAssetRepositoryContract(
  name: string,
  createRepository: () => MindMapAssetRepository,
): void {
  describe(name, () => {
    it('stores defensive Blob records and merges map ownership', async () => {
      const repository = createRepository()
      const source = createAsset()
      await repository.put(source)
      await repository.put(createAsset(['map-b']))

      const stored = await repository.get(assetId)
      expect(stored?.mapIds).toEqual(['map-a', 'map-b'])
      expect(getMindMapStoredAssetReferenceCount(stored!)).toBe(2)
      expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3, 4]),
      )

      ;(stored!.metadata as { mimeType: string }).mimeType = 'changed'
      ;(stored!.mapIds as string[]).push('changed')
      expect((await repository.get(assetId))?.metadata.mimeType).toBe(
        'image/png',
      )
      expect((await repository.get(assetId))?.mapIds).toEqual([
        'map-a',
        'map-b',
      ])

      await repository.release(assetId, 'map-a')
      expect(await repository.listByMap('map-a')).toEqual([])
      expect((await repository.get(assetId))?.mapIds).toEqual(['map-b'])

      await repository.deleteByMap('map-b')
      expect(await repository.get(assetId)).toBeUndefined()
    })

    it('rejects conflicting content for a stable asset ID', async () => {
      const repository = createRepository()
      await repository.put(createAsset())
      const conflict = createAsset()
      const changed = {
        ...conflict,
        metadata: { ...conflict.metadata, byteSize: 99 },
      }
      await expect(repository.put(changed)).rejects.toMatchObject({
        code: 'integrity-failed',
      })
    })
  })
}

runAssetRepositoryContract(
  'memory asset repository',
  () => new MemoryMindMapAssetRepository(),
)
runAssetRepositoryContract('Dexie asset repository', () => {
  databaseSequence += 1
  return new DexieMindMapAssetRepository(
    `opentools-asset-contract-${databaseSequence}`,
  )
})

describe('asset limits and lifecycle', () => {
  afterEach(() => vi.useRealTimers())

  it('applies configurable per-image and per-map limits', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const asset = createAsset()
    await expect(
      assertMindMapAssetWithinLimits(repository, 'map-a', asset.metadata, {
        maxAssetBytes: 3,
        maxMapBytes: 10,
      }),
    ).rejects.toMatchObject({ code: 'asset-too-large' })

    await repository.put(asset)
    const second = {
      ...asset.metadata,
      id: createMindMapAssetId(`sha256:${'b'.repeat(64)}`),
      checksum: `sha256:${'b'.repeat(64)}`,
      byteSize: 7,
    }
    await expect(
      assertMindMapAssetWithinLimits(repository, 'map-a', second, {
        maxAssetBytes: 10,
        maxMapBytes: 10,
      }),
    ).rejects.toMatchObject({ code: 'map-limit-exceeded' })
  })

  it('delays orphan cleanup and isolates scheduled failures', async () => {
    vi.useFakeTimers()
    const repository = new MemoryMindMapAssetRepository()
    await repository.put(createAsset())
    const errors: unknown[] = []
    const collector = new MindMapAssetGarbageCollector(repository, {
      delayMs: 50,
      onError: (error) => errors.push(error),
    })

    collector.schedule('map-a', new Set())
    expect(await repository.get(assetId)).toBeDefined()
    await vi.advanceTimersByTimeAsync(50)
    expect(await repository.get(assetId)).toBeUndefined()
    expect(errors).toEqual([])
  })

  it('keeps referenced assets and returns deterministic orphan IDs', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const kept = createAsset()
    const orphanId = createMindMapAssetId(`sha256:${'c'.repeat(64)}`)
    await repository.put(kept)
    await repository.put({
      ...createAsset(),
      id: orphanId,
      metadata: {
        ...createAsset().metadata,
        id: orphanId,
        checksum: `sha256:${'c'.repeat(64)}`,
      },
    })

    expect(
      await collectOrphanMindMapAssets(repository, 'map-a', new Set([assetId])),
    ).toEqual([orphanId])
    expect(await repository.get(assetId)).toBeDefined()
  })
})

describe('Dexie schema v2 asset upgrade', () => {
  it('preserves a version-1 maps table while adding Blob storage', async () => {
    databaseSequence += 1
    const databaseName = `opentools-asset-upgrade-${databaseSequence}`
    const legacy = new Dexie(databaseName)
    legacy.version(1).stores({ maps: 'id, updatedAt' })
    const document = createMindMapDocument({
      id: 'legacy-map',
      rootNodeId: 'legacy-root',
      title: 'Legacy map',
      now: '2026-07-15T00:00:00.000Z',
    })
    await legacy.table('maps').put(document)
    legacy.close()

    const repository = new DexieMindMapRepository(databaseName)
    await repository.assetRepository.put(createAsset(['legacy-map']))
    expect((await repository.get('legacy-map'))?.title).toBe('Legacy map')
    expect(
      await repository.assetRepository.listByMap('legacy-map'),
    ).toHaveLength(1)

    await repository.delete('legacy-map')
    expect(await repository.assetRepository.get(assetId)).toBeUndefined()
    await Dexie.delete(databaseName)
  })

  it('exposes stable typed asset errors', () => {
    const error = new MindMapAssetRepositoryError('quota-exceeded', 'No space')
    expect(error).toMatchObject({
      name: 'MindMapAssetRepositoryError',
      code: 'quota-exceeded',
    })
  })

  it('cleans memory assets when a map is deleted', async () => {
    const repository = new MemoryMindMapRepository()
    const document = createMindMapDocument({
      id: 'memory-map',
      rootNodeId: 'memory-root',
      title: 'Memory map',
      now: '2026-07-15T00:00:00.000Z',
    })
    await repository.save(document)
    await repository.assetRepository.put(createAsset(['memory-map']))
    await repository.delete('memory-map')
    expect(await repository.assetRepository.get(assetId)).toBeUndefined()
  })
})

function createAtomicAsset(
  digestCharacter: string,
  mapId: string,
  bytes: readonly number[] = [1, 2, 3, 4],
): MindMapStoredAsset {
  const nextChecksum = `sha256:${digestCharacter.repeat(64)}`
  const nextAssetId = createMindMapAssetId(nextChecksum)
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
  return {
    id: nextAssetId,
    mapIds: [mapId],
    metadata: {
      id: nextAssetId,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: blob.size,
      checksum: nextChecksum,
      intrinsicWidth: 2,
      intrinsicHeight: 2,
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    blob,
  }
}

function runAtomicRepositoryContract(
  name: string,
  createRepository: () => MindMapRepositoryWithAssets,
): void {
  describe(name, () => {
    it('saves a map and all of its assets as one operation', async () => {
      const repository = createRepository()
      const document = createMindMapDocument({
        id: 'atomic-map',
        rootNodeId: 'atomic-root',
        title: 'Atomic map',
        now: '2026-07-15T00:00:00.000Z',
      })
      const first = createAtomicAsset('d', document.id)
      const second = createAtomicAsset('e', document.id)

      await repository.saveWithAssets(document, [first, second])

      expect(await repository.get(document.id)).toEqual(document)
      expect(
        await repository.assetRepository.listByMap(document.id),
      ).toHaveLength(2)
    })

    it('rolls back both the document and earlier asset writes on conflict', async () => {
      const repository = createRepository()
      const document = createMindMapDocument({
        id: 'failed-atomic-map',
        rootNodeId: 'failed-atomic-root',
        title: 'Must not persist',
        now: '2026-07-15T00:00:00.000Z',
      })
      const first = createAtomicAsset('f', document.id)
      const existing = createAtomicAsset('1', 'other-map')
      await repository.assetRepository.put(existing)
      const conflict = createAtomicAsset('1', document.id, [1, 2, 3, 4, 5])

      await expect(
        repository.saveWithAssets(document, [first, conflict]),
      ).rejects.toMatchObject({ code: 'integrity-failed' })

      expect(await repository.get(document.id)).toBeUndefined()
      expect(await repository.assetRepository.get(first.id)).toBeUndefined()
      expect(
        (await repository.assetRepository.get(existing.id))?.mapIds,
      ).toEqual(['other-map'])
    })
  })
}

runAtomicRepositoryContract(
  'memory atomic map repository',
  () => new MemoryMindMapRepository(),
)
runAtomicRepositoryContract('Dexie atomic map repository', () => {
  databaseSequence += 1
  return new DexieMindMapRepository(
    `opentools-asset-atomic-${databaseSequence}`,
  )
})
