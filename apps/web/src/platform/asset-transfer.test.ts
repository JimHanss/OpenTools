import { describe, expect, it } from 'vitest'

import {
  createMindMapAssetId,
  type MindMapAssetMetadata,
} from '@opentools/mindmap-core'
import { MemoryMindMapAssetRepository } from '@opentools/mindmap-storage'

import { blobToDataUri, loadRenderableMindMapAssets } from './asset-transfer'

const checksum = `sha256:${'d'.repeat(64)}`
const id = createMindMapAssetId(checksum)
const metadata: MindMapAssetMetadata = {
  id,
  kind: 'image',
  mimeType: 'image/png',
  byteSize: 4,
  checksum,
  intrinsicWidth: 1,
  intrinsicHeight: 1,
  createdAt: '2026-07-15T00:00:00.000Z',
}

describe('asset transfer adapter', () => {
  it('creates exact data URIs without relying on Blob URLs', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    })
    expect(await blobToDataUri(blob)).toBe('data:image/png;base64,AQIDBA==')
  })

  it('loads only assets owned by the requested map', async () => {
    const repository = new MemoryMindMapAssetRepository()
    await repository.put({
      id,
      mapIds: ['map-a'],
      metadata,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], {
        type: 'image/png',
      }),
    })
    const loaded = await loadRenderableMindMapAssets(
      repository,
      'map-a',
      [id, 'missing'],
      'data-uri',
    )
    expect(loaded.assets[id]).toMatchObject({
      state: 'ready',
      href: 'data:image/png;base64,AQIDBA==',
    })
    expect(loaded.assets.missing).toMatchObject({ state: 'error' })
    loaded.dispose()
  })
})
