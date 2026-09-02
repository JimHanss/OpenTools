import { describe, expect, it } from 'vitest'

import {
  createMindMapAssetId,
  createV3FeatureFixture,
  type MindMapAssetMetadata,
} from '@opentools/mindmap-core'
import type {
  EquationRenderRequest,
  EquationRenderer,
} from '@opentools/mindmap-renderer-svg'
import { MemoryMindMapAssetRepository } from '@opentools/mindmap-storage'

import { assertPngExportCapacity } from '../platform/export-error'
import { prepareMindMapExport } from './export-pipeline'

const checksum = `sha256:${'e'.repeat(64)}`
const assetId = createMindMapAssetId(checksum)

class ReadyEquationRenderer implements EquationRenderer {
  readonly sources: string[] = []

  async render(request: EquationRenderRequest) {
    this.sources.push(request.source)
    return {
      state: 'ready' as const,
      cacheKey: request.source,
      svg: '<svg width="96" height="32" viewBox="0 0 96 32"><path d="M0 16h96"/></svg>',
      width: 96,
      height: 32,
    }
  }
}

function createExportFixture() {
  const document = createV3FeatureFixture()
  const imageNode = document.nodes['wide-1']!
  const imageBlock = imageNode.contentBlocks.find(
    (block) => block.type === 'image',
  )!
  imageBlock.assetId = assetId
  delete document.assets['asset-image']
  const metadata: MindMapAssetMetadata = {
    id: assetId,
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 4,
    checksum,
    intrinsicWidth: 2,
    intrinsicHeight: 2,
    createdAt: '2026-07-15T00:00:00.000Z',
  }
  document.assets[assetId] = metadata
  return { document, metadata }
}

async function createRepository(mapId: string, metadata: MindMapAssetMetadata) {
  const repository = new MemoryMindMapAssetRepository()
  await repository.put({
    id: metadata.id,
    mapIds: [mapId],
    metadata,
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: metadata.mimeType,
    }),
  })
  return repository
}

describe('complete export pipeline', () => {
  it('waits for resources and emits one self-contained full-document SVG', async () => {
    const { document, metadata } = createExportFixture()
    document.theme.backgroundColor = '#dbeafe'
    const repository = await createRepository(document.id, metadata)
    const renderer = new ReadyEquationRenderer()

    const prepared = await prepareMindMapExport({
      assetRepository: repository,
      document,
      equationRenderer: renderer,
    })

    expect(renderer.sources).toEqual([String.raw`E = mc^2`])
    expect(prepared.scene.background).toBe('#ffffff')
    expect(prepared.svg).toContain('data-map-background="true"')
    expect(prepared.svg).toContain('fill="#ffffff"')
    expect(prepared.scene.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['root', 'floating-root', 'floating-root-2']),
    )
    expect(prepared.svg).toContain('data:image/png;base64,AQIDBA==')
    expect(prepared.svg).toContain('<path d="M0 16h96"')
    expect(
      prepared.scene.images.every((image) => image.state === 'ready'),
    ).toBe(true)
    expect(
      prepared.scene.equations.every((equation) => equation.state === 'ready'),
    ).toBe(true)
  })

  it('fails with a typed recoverable error when a referenced resource is missing', async () => {
    const { document } = createExportFixture()

    await expect(
      prepareMindMapExport({
        assetRepository: new MemoryMindMapAssetRepository(),
        document,
        equationRenderer: new ReadyEquationRenderer(),
      }),
    ).rejects.toMatchObject({
      name: 'MindMapExportError',
      code: 'resource-unavailable',
      resourceIds: [assetId],
    })
  })

  it('keeps very distant floating topics in SVG and rejects only unsafe PNG capacity', async () => {
    const { document, metadata } = createExportFixture()
    document.floatingTopics['floating-root'] = {
      ...document.floatingTopics['floating-root']!,
      x: 20_000_000,
      y: -20_000_000,
    }
    const prepared = await prepareMindMapExport({
      assetRepository: await createRepository(document.id, metadata),
      document,
      equationRenderer: new ReadyEquationRenderer(),
    })

    expect(
      prepared.scene.nodes.find((node) => node.id === 'floating-root')?.x,
    ).toBe(20_000_000)
    expect(() =>
      assertPngExportCapacity(
        prepared.scene.bounds.width,
        prepared.scene.bounds.height,
      ),
    ).toThrowError(expect.objectContaining({ code: 'png-too-large' }))
    expect(prepared.svg).toContain('viewBox=')
  })

  it('types equation failures as unavailable resources', async () => {
    const { document, metadata } = createExportFixture()
    const renderer: EquationRenderer = {
      async render(request) {
        return {
          state: 'error',
          cacheKey: request.source,
          error: 'Formula unavailable',
          width: 160,
          height: 48,
        }
      },
    }

    await expect(
      prepareMindMapExport({
        assetRepository: await createRepository(document.id, metadata),
        document,
        equationRenderer: renderer,
      }),
    ).rejects.toMatchObject({ code: 'resource-unavailable' })
  })
})
