import { describe, expect, it } from 'vitest'

import {
  createMindMapAssetId,
  createMindMapDocument,
  type MindMapAssetMetadata,
} from '@opentools/mindmap-core'

import {
  MindMapFormatError,
  parseMindMapBundleJson,
  parseMindMapDocument,
  serializeMindMapBundle,
} from './index'

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes).buffer,
  )
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

async function createBundleFixture() {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const digest = await checksum(bytes)
  const id = createMindMapAssetId(digest)
  const metadata: MindMapAssetMetadata = {
    id,
    kind: 'image',
    mimeType: 'image/png',
    byteSize: bytes.byteLength,
    checksum: digest,
    intrinsicWidth: 320,
    intrinsicHeight: 180,
    createdAt: '2026-07-15T00:00:00.000Z',
  }
  const document = createMindMapDocument({
    id: 'bundle-map',
    rootNodeId: 'root',
    title: 'Bundle map',
    now: '2026-07-15T00:00:00.000Z',
  })
  document.assets[id] = metadata
  document.nodes.root!.contentBlocks.push({
    id: 'image-block',
    type: 'image',
    assetId: id,
    width: 240,
    height: 135,
    altText: 'Bundle image',
    preserveAspectRatio: true,
  })
  return { bytes, document, metadata }
}

describe('mind map bundle format', () => {
  it('round trips document metadata and binary payload deterministically', async () => {
    const fixture = await createBundleFixture()
    const first = await serializeMindMapBundle(fixture.document, [
      { metadata: fixture.metadata, bytes: fixture.bytes },
    ])
    const second = await serializeMindMapBundle(fixture.document, [
      { metadata: fixture.metadata, bytes: fixture.bytes },
    ])
    expect(second).toBe(first)

    const parsed = await parseMindMapBundleJson(first)
    expect(parsed.document).toEqual(fixture.document)
    expect(parsed.assets).toHaveLength(1)
    expect(parsed.assets[0]?.metadata).toEqual(fixture.metadata)
    expect(parsed.assets[0]?.bytes).toEqual(fixture.bytes)
  })

  it('rejects checksum corruption, missing payloads and configured limits', async () => {
    const fixture = await createBundleFixture()
    const source = JSON.parse(
      await serializeMindMapBundle(fixture.document, [
        { metadata: fixture.metadata, bytes: fixture.bytes },
      ]),
    ) as {
      assets: Array<{ data: string }>
    }

    source.assets[0]!.data = 'AAAAAAAAAAA='
    await expect(
      parseMindMapBundleJson(JSON.stringify(source)),
    ).rejects.toMatchObject({ code: 'asset-checksum-mismatch' })

    source.assets = []
    await expect(
      parseMindMapBundleJson(JSON.stringify(source)),
    ).rejects.toMatchObject({ code: 'missing-asset' })

    await expect(
      serializeMindMapBundle(
        fixture.document,
        [{ metadata: fixture.metadata, bytes: fixture.bytes }],
        { maxAssetBytes: 4 },
      ),
    ).rejects.toMatchObject({ code: 'asset-limit-exceeded' })
  })

  it('validates the whole envelope before returning any asset', async () => {
    const fixture = await createBundleFixture()
    const source = JSON.parse(
      await serializeMindMapBundle(fixture.document, [
        { metadata: fixture.metadata, bytes: fixture.bytes },
      ]),
    ) as { kind: string; assets: unknown[] }
    source.kind = 'not-a-bundle'
    await expect(
      parseMindMapBundleJson(JSON.stringify(source)),
    ).rejects.toBeInstanceOf(MindMapFormatError)
  })

  it('keeps document-only schema parsing independent from bundles', async () => {
    const fixture = await createBundleFixture()
    expect(parseMindMapDocument(fixture.document)).toEqual(fixture.document)
  })
})
