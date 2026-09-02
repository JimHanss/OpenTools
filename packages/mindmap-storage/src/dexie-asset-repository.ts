import type { MindMapAssetId, MindMapId } from '@opentools/mindmap-core'

import {
  assertMindMapStoredAsset,
  cloneMindMapStoredAsset,
  type MindMapAssetRepository,
  type MindMapStoredAsset,
} from './asset-repository'
import { MindMapDatabase } from './database'
import {
  MindMapAssetRepositoryError,
  toMindMapAssetRepositoryError,
} from './errors'

export function hasMatchingStoredAssetContent(
  left: MindMapStoredAsset,
  right: MindMapStoredAsset,
): boolean {
  return (
    left.id === right.id &&
    left.metadata.id === right.metadata.id &&
    left.metadata.checksum === right.metadata.checksum &&
    left.metadata.mimeType === right.metadata.mimeType &&
    left.metadata.byteSize === right.metadata.byteSize &&
    left.blob.size === right.blob.size &&
    left.blob.type === right.blob.type
  )
}

export class DexieMindMapAssetRepository implements MindMapAssetRepository {
  readonly database: MindMapDatabase

  constructor(database: MindMapDatabase | string = 'opentools-mindmaps') {
    this.database =
      typeof database === 'string' ? new MindMapDatabase(database) : database
  }

  async get(assetId: MindMapAssetId): Promise<MindMapStoredAsset | undefined> {
    try {
      const asset = await this.database.assets.get(assetId)
      return asset ? cloneMindMapStoredAsset(asset) : undefined
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'read-failed')
    }
  }

  async put(asset: MindMapStoredAsset): Promise<void> {
    try {
      assertMindMapStoredAsset(asset)
      await this.database.transaction('rw', this.database.assets, async () => {
        const existing = await this.database.assets.get(asset.id)
        if (existing && !hasMatchingStoredAssetContent(existing, asset)) {
          throw new MindMapAssetRepositoryError(
            'integrity-failed',
            'An asset ID cannot refer to different image content.',
          )
        }
        const next = cloneMindMapStoredAsset({
          ...asset,
          mapIds: [...(existing?.mapIds ?? []), ...asset.mapIds],
        })
        await this.database.assets.put(next)
      })
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'write-failed')
    }
  }

  async listByMap(mapId: MindMapId): Promise<MindMapStoredAsset[]> {
    try {
      const assets = await this.database.assets
        .where('mapIds')
        .equals(mapId)
        .sortBy('id')
      return assets.map(cloneMindMapStoredAsset)
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'read-failed')
    }
  }

  async delete(assetId: MindMapAssetId): Promise<void> {
    try {
      await this.database.assets.delete(assetId)
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'delete-failed')
    }
  }

  async release(assetId: MindMapAssetId, mapId: MindMapId): Promise<void> {
    try {
      await this.database.transaction('rw', this.database.assets, async () => {
        const asset = await this.database.assets.get(assetId)
        if (!asset) return
        const mapIds = asset.mapIds.filter((candidate) => candidate !== mapId)
        if (mapIds.length === 0) await this.database.assets.delete(assetId)
        else await this.database.assets.put({ ...asset, mapIds })
      })
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'delete-failed')
    }
  }

  async deleteByMap(mapId: MindMapId): Promise<void> {
    try {
      await this.database.transaction('rw', this.database.assets, async () => {
        const assets = await this.database.assets
          .where('mapIds')
          .equals(mapId)
          .toArray()
        for (const asset of assets) {
          const mapIds = asset.mapIds.filter((candidate) => candidate !== mapId)
          if (mapIds.length === 0) await this.database.assets.delete(asset.id)
          else await this.database.assets.put({ ...asset, mapIds })
        }
      })
    } catch (error) {
      throw toMindMapAssetRepositoryError(error, 'delete-failed')
    }
  }
}
