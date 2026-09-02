import { describe, expect, it } from 'vitest'

import {
  createMindMapBoundary,
  createMindMapDocument,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  createMindMapAssetId,
  createV3FeatureFixture,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { MindMapLibraryService } from './map-library'

function createService(repository = new MemoryMindMapRepository()) {
  let id = 0
  let second = 0
  const service = new MindMapLibraryService(repository, {
    createId: () => `id-${++id}`,
    now: () => `2026-07-15T00:00:${String(++second).padStart(2, '0')}.000Z`,
  })

  return { repository, service }
}

describe('MindMapLibraryService', () => {
  it('uses injected locale-aware defaults only when new content is created', async () => {
    let id = 0
    const service = new MindMapLibraryService(new MemoryMindMapRepository(), {
      createId: () => `localized-${++id}`,
      duplicateTitle: (title) => `${title} 副本`,
      now: () => '2026-07-15T00:00:00.000Z',
      starterTitle: () => '我的第一张思维导图',
      untitledTitle: () => '未命名思维导图',
    })

    const [starter] = await service.hydrate()
    expect(starter?.title).toBe('我的第一张思维导图')
    const untitled = await service.create('   ')
    expect(untitled.title).toBe('未命名思维导图')
    expect((await service.duplicate(untitled.id)).title).toBe(
      '未命名思维导图 副本',
    )
  })

  it('creates exactly one starter map when no valid saved maps exist', async () => {
    const { repository, service } = createService()
    const invalidDocument = createMindMapDocument({
      id: 'invalid',
      rootNodeId: 'root',
      title: 'Invalid',
      now: '2026-07-15T00:00:00.000Z',
    })
    invalidDocument.nodes.root!.childIds.push('missing')
    await repository.save(invalidDocument as MindMapDocument)

    const [hydratedMaps, duplicateHydration] = await Promise.all([
      service.hydrate(),
      service.hydrate(),
    ])

    expect(hydratedMaps).toHaveLength(1)
    expect(duplicateHydration).toHaveLength(1)
    expect(hydratedMaps[0]).toMatchObject({ title: 'My first mind map' })
    expect(await service.list()).toHaveLength(1)
  })

  it('creates, opens, renames, duplicates and deletes only the requested map', async () => {
    const { service } = createService()
    const firstMap = await service.create('Roadmap')
    const secondMap = await service.create('Research')

    expect((await service.open(firstMap.id)).title).toBe('Roadmap')
    expect((await service.rename(firstMap.id, 'Q3 roadmap')).title).toBe(
      'Q3 roadmap',
    )

    const duplicate = await service.duplicate(firstMap.id)
    expect(duplicate).toMatchObject({
      title: 'Q3 roadmap copy',
      rootNodeId: firstMap.rootNodeId,
    })
    expect(duplicate.id).not.toBe(firstMap.id)

    await service.delete(firstMap.id)
    await expect(service.open(firstMap.id)).rejects.toMatchObject({
      code: 'map-not-found',
    })
    expect((await service.open(secondMap.id)).title).toBe('Research')
    expect((await service.open(duplicate.id)).title).toBe('Q3 roadmap copy')
  })

  it('imports a validated map as an independent copy with fresh local IDs', async () => {
    const { repository, service } = createService()
    const source = createMindMapDocument({
      id: 'external-map',
      rootNodeId: 'external-root',
      title: 'Imported roadmap',
      now: '2026-07-15T00:00:00.000Z',
    })
    source.nodes['external-root']!.childIds.push('external-child')
    source.nodes['external-child'] = createMindMapNode({
      id: 'external-child',
      parentId: 'external-root',
      text: 'Imported child',
    })
    source.relationships = [
      createMindMapRelationship({
        id: 'external-relationship',
        fromNodeId: 'external-root',
        toNodeId: 'external-child',
        label: 'connects',
      }),
    ]
    source.boundaries = [
      createMindMapBoundary({
        id: 'external-boundary',
        nodeIds: ['external-root', 'external-child'],
        label: 'Imported scope',
      }),
    ]
    source.summaries = [
      createMindMapSummary({
        id: 'external-summary',
        nodeIds: ['external-root', 'external-child'],
        label: 'Imported summary',
      }),
    ]

    const imported = await service.import(source)

    expect(imported).toMatchObject({
      title: 'Imported roadmap',
      schemaVersion: 3,
    })
    expect(imported.id).not.toBe(source.id)
    expect(imported.rootNodeId).not.toBe(source.rootNodeId)
    expect(imported.nodes[imported.rootNodeId]?.text).toBe('Imported roadmap')
    expect(imported.relationships[0]).toMatchObject({
      fromNodeId: imported.rootNodeId,
    })
    expect(imported.relationships[0]?.toNodeId).not.toBe('external-child')
    expect(imported.boundaries[0]?.nodeIds).toEqual(
      expect.arrayContaining([imported.rootNodeId]),
    )
    expect(imported.summaries[0]?.nodeIds).toEqual(
      expect.arrayContaining([imported.rootNodeId]),
    )
    expect(await repository.get(source.id)).toBeUndefined()
    expect(await repository.get(imported.id)).toEqual(imported)
  })

  it('remaps every node-owned v3 reference during import', async () => {
    const { service } = createService()
    const source = createV3FeatureFixture()
    source.nodes['wide-1']!.contentBlocks = source.nodes[
      'wide-1'
    ]!.contentBlocks.filter((block) => block.type !== 'image')
    source.assets = {}
    source.nodes.root!.numbering = {
      ...source.nodes.root!.numbering!,
      restartAtNodeId: 'wide-1',
    }

    const imported = await service.import(source)
    const importedWideNode = Object.values(imported.nodes).find(
      (node) => node.text === 'Wide 1',
    )!

    expect(importedWideNode.id).not.toBe('wide-1')
    expect(imported.structureOverrides[importedWideNode.id]).toBe('org-top')
    expect(imported.structureOverrides['wide-1']).toBeUndefined()
    expect(
      imported.nodes[imported.rootNodeId]?.numbering?.restartAtNodeId,
    ).toBe(importedWideNode.id)
    expect(imported.callouts[0]?.ownerNodeId).toBe(importedWideNode.id)
    expect(Object.keys(imported.floatingTopics)).not.toContain('floating-root')
    for (const floatingRootId of Object.keys(imported.floatingTopics)) {
      expect(imported.nodes[floatingRootId]?.parentId).toBeNull()
    }
  })

  it('atomically imports and duplicates referenced image assets', async () => {
    const { repository, service } = createService()
    const source = createMindMapDocument({
      id: 'external-with-image',
      rootNodeId: 'external-image-root',
      title: 'Image map',
      now: '2026-07-15T00:00:00.000Z',
    })
    const checksum = `sha256:${'7'.repeat(64)}`
    const id = createMindMapAssetId(checksum)
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    })
    const metadata = {
      id,
      kind: 'image' as const,
      mimeType: 'image/png',
      byteSize: blob.size,
      checksum,
      intrinsicWidth: 2,
      intrinsicHeight: 2,
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    source.assets[id] = metadata
    source.nodes[source.rootNodeId]!.contentBlocks.push({
      id: 'image-block',
      type: 'image',
      assetId: id,
      width: 120,
      altText: 'Preview',
      preserveAspectRatio: true,
    })

    const imported = await service.importWithAssets(source, [
      { metadata, blob },
    ])
    const duplicate = await service.duplicate(imported.id)

    expect((await repository.assetRepository.get(id))?.mapIds).toEqual(
      [duplicate.id, imported.id].sort(),
    )
    expect(
      duplicate.nodes[duplicate.rootNodeId]?.contentBlocks[0],
    ).toMatchObject({ assetId: id })
    await service.delete(imported.id)
    expect((await repository.assetRepository.get(id))?.mapIds).toEqual([
      duplicate.id,
    ])
  })

  it('rejects incomplete image imports without leaving a partial map', async () => {
    const { repository, service } = createService()
    const source = createMindMapDocument({
      id: 'incomplete-image-map',
      rootNodeId: 'incomplete-image-root',
      title: 'Incomplete image map',
      now: '2026-07-15T00:00:00.000Z',
    })
    const checksum = `sha256:${'8'.repeat(64)}`
    const id = createMindMapAssetId(checksum)
    source.assets[id] = {
      id,
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 4,
      checksum,
      intrinsicWidth: 2,
      intrinsicHeight: 2,
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    source.nodes[source.rootNodeId]!.contentBlocks.push({
      id: 'missing-image-block',
      type: 'image',
      assetId: id,
      width: 120,
      altText: '',
      preserveAspectRatio: true,
    })

    await expect(service.importWithAssets(source, [])).rejects.toMatchObject({
      code: 'missing-assets',
    })
    expect(await repository.list()).toEqual([])
    expect(await repository.assetRepository.listByMap(source.id)).toEqual([])
  })
})
