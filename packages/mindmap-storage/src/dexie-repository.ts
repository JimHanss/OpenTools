import {
  cloneMindMapDocument,
  type MindMapDocument,
  type MindMapId,
} from '@opentools/mindmap-core'
import { parseMindMapDocument } from '@opentools/mindmap-format'

import {
  MindMapAssetRepositoryError,
  toMindMapAssetRepositoryError,
  toMindMapRepositoryError,
} from './errors'
import { MindMapDatabase } from './database'
import {
  DexieMindMapAssetRepository,
  hasMatchingStoredAssetContent,
} from './dexie-asset-repository'
import {
  assertMindMapStoredAsset,
  cloneMindMapStoredAsset,
  type MindMapStoredAsset,
} from './asset-repository'
import type { MindMapRepositoryWithAssets } from './repository'

export class DexieMindMapRepository implements MindMapRepositoryWithAssets {
  readonly #database: MindMapDatabase
  readonly assetRepository: DexieMindMapAssetRepository

  constructor(databaseName = 'opentools-mindmaps') {
    this.#database = new MindMapDatabase(databaseName)
    this.assetRepository = new DexieMindMapAssetRepository(this.#database)
  }

  async get(id: MindMapId): Promise<MindMapDocument | undefined> {
    try {
      const document = await this.#database.maps.get(id)
      return document
        ? cloneMindMapDocument(parseMindMapDocument(document as unknown))
        : undefined
    } catch (error) {
      throw toMindMapRepositoryError(error, 'read-failed')
    }
  }

  async list(): Promise<MindMapDocument[]> {
    try {
      const documents = await this.#database.maps
        .orderBy('updatedAt')
        .reverse()
        .toArray()
      return documents.map((document) =>
        cloneMindMapDocument(parseMindMapDocument(document as unknown)),
      )
    } catch (error) {
      throw toMindMapRepositoryError(error, 'read-failed')
    }
  }

  async save(document: MindMapDocument): Promise<void> {
    try {
      await this.#database.maps.put(cloneMindMapDocument(document))
    } catch (error) {
      throw toMindMapRepositoryError(error, 'write-failed')
    }
  }

  async saveWithAssets(
    document: MindMapDocument,
    assets: readonly MindMapStoredAsset[],
  ): Promise<void> {
    try {
      const detachedDocument = cloneMindMapDocument(document)
      const detachedAssets = assets.map(cloneMindMapStoredAsset)
      for (const asset of detachedAssets) {
        assertMindMapStoredAsset(asset, detachedDocument.id)
      }
      await this.#database.transaction(
        'rw',
        this.#database.maps,
        this.#database.assets,
        async () => {
          for (const asset of detachedAssets) {
            const existing = await this.#database.assets.get(asset.id)
            if (existing && !hasMatchingStoredAssetContent(existing, asset)) {
              throw new MindMapAssetRepositoryError(
                'integrity-failed',
                'An asset ID cannot refer to different image content.',
              )
            }
          }
          for (const asset of detachedAssets) {
            const existing = await this.#database.assets.get(asset.id)
            await this.#database.assets.put(
              cloneMindMapStoredAsset({
                ...asset,
                mapIds: [...(existing?.mapIds ?? []), ...asset.mapIds],
              }),
            )
          }
          await this.#database.maps.put(detachedDocument)
        },
      )
    } catch (error) {
      if (error instanceof MindMapAssetRepositoryError) throw error
      throw toMindMapAssetRepositoryError(error, 'transaction-failed')
    }
  }

  async delete(id: MindMapId): Promise<void> {
    try {
      await this.#database.transaction(
        'rw',
        this.#database.maps,
        this.#database.assets,
        async () => {
          await this.#database.maps.delete(id)
          const assets = await this.#database.assets
            .where('mapIds')
            .equals(id)
            .toArray()
          for (const asset of assets) {
            const mapIds = asset.mapIds.filter((mapId) => mapId !== id)
            if (mapIds.length === 0)
              await this.#database.assets.delete(asset.id)
            else await this.#database.assets.put({ ...asset, mapIds })
          }
        },
      )
    } catch (error) {
      throw toMindMapRepositoryError(error, 'delete-failed')
    }
  }
}
