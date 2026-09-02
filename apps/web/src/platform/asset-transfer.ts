import type { MindMapAssetId, MindMapId } from '@opentools/mindmap-core'
import type { RenderableMindMapAsset } from '@opentools/mindmap-renderer-svg'
import type { MindMapAssetRepository } from '@opentools/mindmap-storage'

export type BrowserAssetUrlMode = 'data-uri' | 'object-url'

export interface LoadedRenderableAssets {
  readonly assets: Readonly<Record<MindMapAssetId, RenderableMindMapAsset>>
  dispose(): void
}

const base64Alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function encodeBase64(bytes: Uint8Array): string {
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    const value = (first << 16) | (second << 8) | third
    result += base64Alphabet[(value >> 18) & 63]
    result += base64Alphabet[(value >> 12) & 63]
    result += index + 1 < bytes.length ? base64Alphabet[(value >> 6) & 63] : '='
    result += index + 2 < bytes.length ? base64Alphabet[value & 63] : '='
  }
  return result
}

export async function blobToDataUri(blob: Blob): Promise<string> {
  return `data:${blob.type || 'application/octet-stream'};base64,${encodeBase64(
    new Uint8Array(await blob.arrayBuffer()),
  )}`
}

export async function loadRenderableMindMapAssets(
  repository: MindMapAssetRepository,
  mapId: MindMapId,
  assetIds: Iterable<MindMapAssetId>,
  mode: BrowserAssetUrlMode,
): Promise<LoadedRenderableAssets> {
  const objectUrls: string[] = []
  const assets: Record<MindMapAssetId, RenderableMindMapAsset> = {}
  for (const assetId of [...new Set(assetIds)].sort()) {
    try {
      const stored = await repository.get(assetId)
      if (!stored || !stored.mapIds.includes(mapId)) {
        assets[assetId] = { id: assetId, state: 'error' }
        continue
      }
      const href =
        mode === 'data-uri'
          ? await blobToDataUri(stored.blob)
          : URL.createObjectURL(stored.blob)
      if (mode === 'object-url') objectUrls.push(href)
      assets[assetId] = { id: assetId, state: 'ready', href }
    } catch (error) {
      assets[assetId] = {
        id: assetId,
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  return {
    assets,
    dispose() {
      for (const url of objectUrls) URL.revokeObjectURL(url)
    },
  }
}
