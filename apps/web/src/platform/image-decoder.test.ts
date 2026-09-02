import { describe, expect, it } from 'vitest'

import { MemoryMindMapAssetRepository } from '@opentools/mindmap-storage'

import {
  BrowserImageError,
  prepareBrowserImageAsset,
  validateSafeSvgText,
} from './image-decoder'

const decodeDimensions = async () => ({ width: 320, height: 180 })

function pngBlob(type = 'image/png'): Blob {
  return new Blob(
    [
      new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      ]),
    ],
    { type },
  )
}

describe('browser image decoding and validation', () => {
  it('creates deterministic content-addressed metadata after signature checks', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const first = await prepareBrowserImageAsset(
      'map-a',
      pngBlob(),
      repository,
      {
        decodeDimensions,
        now: () => '2026-07-15T00:00:00.000Z',
      },
    )
    const second = await prepareBrowserImageAsset(
      'map-a',
      pngBlob(),
      repository,
      { decodeDimensions },
    )

    expect(first.id).toMatch(/^asset-[a-f0-9]{64}$/)
    expect(second.id).toBe(first.id)
    expect(first.metadata).toMatchObject({
      mimeType: 'image/png',
      intrinsicWidth: 320,
      intrinsicHeight: 180,
      byteSize: 16,
    })
  })

  it('rejects MIME disguises and invalid signatures', async () => {
    const repository = new MemoryMindMapAssetRepository()
    await expect(
      prepareBrowserImageAsset('map-a', pngBlob('image/jpeg'), repository, {
        decodeDimensions,
      }),
    ).rejects.toMatchObject({ code: 'mime-mismatch' })
    await expect(
      prepareBrowserImageAsset(
        'map-a',
        new Blob(['not an image'], { type: 'image/png' }),
        repository,
        { decodeDimensions },
      ),
    ).rejects.toMatchObject({ code: 'invalid-signature' })
  })

  it('rejects invalid dimensions and quota violations without writing', async () => {
    const repository = new MemoryMindMapAssetRepository()
    await expect(
      prepareBrowserImageAsset('map-a', pngBlob(), repository, {
        decodeDimensions: async () => ({ width: 0, height: 1 }),
      }),
    ).rejects.toMatchObject({ code: 'invalid-dimensions' })
    await expect(
      prepareBrowserImageAsset('map-a', pngBlob(), repository, {
        decodeDimensions,
        limits: { maxAssetBytes: 8 },
      }),
    ).rejects.toMatchObject({ code: 'asset-too-large' })
    expect(await repository.listByMap('map-a')).toEqual([])
  })

  it('accepts a conservative inert SVG surface', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff" /></linearGradient></defs><rect width="10" height="20" fill="url(#g)" /></svg>`
    const asset = await prepareBrowserImageAsset(
      'map-a',
      new Blob([svg], { type: 'image/svg+xml' }),
      repository,
      { decodeDimensions: async () => ({ width: 10, height: 20 }) },
    )
    expect(asset.metadata.mimeType).toBe('image/svg+xml')
    expect(await asset.blob.text()).toContain('linearGradient')
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><foreignObject><div>unsafe</div></foreignObject></svg>',
    '<svg><image href="https://example.com/a.png" /></svg>',
    '<svg><rect style="fill:red" /></svg>',
    '<svg><use href="#payload" /></svg>',
    '<svg><rect fill="url(https://example.com/a.svg#x)" /></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg />',
  ])('rejects unsafe SVG markup: %s', (source) => {
    expect(() => validateSafeSvgText(source)).toThrow(BrowserImageError)
  })
})
