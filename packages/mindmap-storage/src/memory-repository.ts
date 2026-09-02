import {
  cloneMindMapDocument,
  type MindMapAssetId,
  type MindMapDocument,
  type MindMapId,
} from '@opentools/mindmap-core'

import type { MindMapRepositoryWithAssets } from './repository'
import {
  assertMindMapStoredAsset,
  cloneMindMapStoredAsset,
  type MindMapAssetRepository,
  type MindMapStoredAsset,
} from './asset-repository'
import { MindMapAssetRepositoryError } from './errors'

/** In-memory Blob repository used by contract, lifecycle, and integration tests. */
export class MemoryMindMapAssetRepository implements MindMapAssetRepository {
  readonly #assets = new Map<MindMapAssetId, MindMapStoredAsset>()

  async get(assetId: MindMapAssetId): Promise<MindMapStoredAsset | undefined> {
    const asset = this.#assets.get(assetId)
    return asset ? cloneMindMapStoredAsset(asset) : undefined
  }

  async put(asset: MindMapStoredAsset): Promise<void> {
    assertMindMapStoredAsset(asset)
    const existing = this.#assets.get(asset.id)
    if (
      existing &&
      (existing.metadata.checksum !== asset.metadata.checksum ||
        existing.metadata.mimeType !== asset.metadata.mimeType ||
        existing.metadata.byteSize !== asset.metadata.byteSize)
    ) {
      throw new MindMapAssetRepositoryError(
        'integrity-failed',
        'An asset ID cannot refer to different image content.',
      )
    }
    this.#assets.set(
      asset.id,
      cloneMindMapStoredAsset({
        ...asset,
        mapIds: [...(existing?.mapIds ?? []), ...asset.mapIds],
      }),
    )
  }

  async listByMap(mapId: MindMapId): Promise<MindMapStoredAsset[]> {
    return [...this.#assets.values()]
      .filter((asset) => asset.mapIds.includes(mapId))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneMindMapStoredAsset)
  }

  async delete(assetId: MindMapAssetId): Promise<void> {
    this.#assets.delete(assetId)
  }

  async release(assetId: MindMapAssetId, mapId: MindMapId): Promise<void> {
    const asset = this.#assets.get(assetId)
    if (!asset) return
    const mapIds = asset.mapIds.filter((candidate) => candidate !== mapId)
    if (mapIds.length === 0) this.#assets.delete(assetId)
    else
      this.#assets.set(assetId, cloneMindMapStoredAsset({ ...asset, mapIds }))
  }

  async deleteByMap(mapId: MindMapId): Promise<void> {
    for (const [assetId, asset] of this.#assets) {
      const mapIds = asset.mapIds.filter((candidate) => candidate !== mapId)
      if (mapIds.length === 0) this.#assets.delete(assetId)
      else
        this.#assets.set(assetId, cloneMindMapStoredAsset({ ...asset, mapIds }))
    }
  }
}

/** A deterministic repository for tests and non-persistent fallback scenarios. */
export class MemoryMindMapRepository implements MindMapRepositoryWithAssets {
  readonly #documents = new Map<MindMapId, MindMapDocument>()
  readonly assetRepository: MemoryMindMapAssetRepository

  constructor(assetRepository = new MemoryMindMapAssetRepository()) {
    this.assetRepository = assetRepository
  }

  async get(id: MindMapId): Promise<MindMapDocument | undefined> {
    const document = this.#documents.get(id)
    return document ? cloneMindMapDocument(document) : undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return [...this.#documents.values()]
      .sort((left, right) => {
        const timestampOrder = right.updatedAt.localeCompare(left.updatedAt)
        return timestampOrder === 0
          ? left.id.localeCompare(right.id)
          : timestampOrder
      })
      .map(cloneMindMapDocument)
  }

  async save(document: MindMapDocument): Promise<void> {
    this.#documents.set(document.id, cloneMindMapDocument(document))
  }

  async saveWithAssets(
    document: MindMapDocument,
    assets: readonly MindMapStoredAsset[],
  ): Promise<void> {
    for (const asset of assets) assertMindMapStoredAsset(asset, document.id)
    const previousDocument = await this.get(document.id)
    const previousAssets = new Map(
      await Promise.all(
        assets.map(
          async (asset) =>
            [asset.id, await this.assetRepository.get(asset.id)] as const,
        ),
      ),
    )
    try {
      for (const asset of assets) {
        await this.assetRepository.put(asset)
      }
      await this.save(document)
    } catch (error) {
      for (const asset of assets) {
        const previous = previousAssets.get(asset.id)
        await this.assetRepository.delete(asset.id)
        if (previous) await this.assetRepository.put(previous)
      }
      if (previousDocument) await this.save(previousDocument)
      else this.#documents.delete(document.id)
      throw error
    }
  }

  async delete(id: MindMapId): Promise<void> {
    this.#documents.delete(id)
    await this.assetRepository.deleteByMap(id)
  }
}
