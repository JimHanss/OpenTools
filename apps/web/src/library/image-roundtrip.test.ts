import { describe, expect, it } from 'vitest'

import {
  createMindMapAssetId,
  createMindMapDocument,
  mindMapCommandTypes,
} from '@opentools/mindmap-core'
import {
  parseMindMapBundleJson,
  serializeMindMapBundle,
} from '@opentools/mindmap-format'
import { layoutMindMap } from '@opentools/mindmap-layout'
import {
  createMindMapSvgScene,
  serializeMindMapSvgScene,
} from '@opentools/mindmap-renderer-svg'
import { MemoryMindMapRepository } from '@opentools/mindmap-storage'

import { EditorSession } from '../editor/session'
import { loadRenderableMindMapAssets } from '../platform/asset-transfer'
import { MindMapLibraryService } from './map-library'

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

describe('image resource integration', () => {
  it('round-trips a bundle through import, autosave, duplicate and inline SVG export', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const checksum = await sha256(bytes)
    const assetId = createMindMapAssetId(checksum)
    const source = createMindMapDocument({
      id: 'bundle-source',
      rootNodeId: 'bundle-root',
      title: 'Bundle image',
      now: '2026-07-15T00:00:00.000Z',
    })
    const metadata = {
      id: assetId,
      kind: 'image' as const,
      mimeType: 'image/png',
      byteSize: bytes.byteLength,
      checksum,
      intrinsicWidth: 320,
      intrinsicHeight: 180,
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    source.assets[assetId] = metadata
    source.nodes[source.rootNodeId]!.contentBlocks.push({
      id: 'bundle-image-block',
      type: 'image',
      assetId,
      width: 240,
      altText: 'Original preview',
      preserveAspectRatio: true,
    })

    const serialized = await serializeMindMapBundle(source, [
      { metadata, bytes },
    ])
    const parsed = await parseMindMapBundleJson(serialized)
    const repository = new MemoryMindMapRepository()
    let idSequence = 0
    const library = new MindMapLibraryService(repository, {
      createId: () => `local-${++idSequence}`,
      now: () => '2026-07-15T00:01:00.000Z',
    })
    const imported = await library.importWithAssets(parsed.document, [
      {
        metadata: parsed.assets[0]!.metadata,
        blob: new Blob([new Uint8Array(parsed.assets[0]!.bytes)], {
          type: parsed.assets[0]!.metadata.mimeType,
        }),
      },
    ])

    const session = new EditorSession(imported, repository, {
      debounceMs: 0,
      now: () => '2026-07-15T00:02:00.000Z',
    })
    session.execute({
      type: mindMapCommandTypes.updateImageContentBlock,
      label: 'Edit image',
      payload: {
        nodeId: imported.rootNodeId,
        blockId: 'bundle-image-block',
        changes: { width: 300, altText: 'Saved preview' },
      },
    })
    expect(
      session.undo()?.document.nodes[imported.rootNodeId]?.contentBlocks[0],
    ).toMatchObject({ width: 240, altText: 'Original preview' })
    session.redo()
    await session.flush()

    const reopened = await library.open(imported.id)
    expect(reopened.nodes[reopened.rootNodeId]?.contentBlocks[0]).toMatchObject(
      {
        width: 300,
        altText: 'Saved preview',
      },
    )
    const duplicate = await library.duplicate(imported.id)
    expect((await repository.assetRepository.get(assetId))?.mapIds).toEqual(
      [duplicate.id, imported.id].sort(),
    )

    const loaded = await loadRenderableMindMapAssets(
      repository.assetRepository,
      reopened.id,
      [assetId],
      'data-uri',
    )
    try {
      const svg = serializeMindMapSvgScene(
        createMindMapSvgScene(reopened, layoutMindMap(reopened), {
          assets: loaded.assets,
        }),
      )
      expect(svg).toContain('data:image/png;base64,')
      expect(svg).not.toContain('blob:')
    } finally {
      loaded.dispose()
      session.dispose()
    }
  })
})
