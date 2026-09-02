import type { MindMapDocument, MindMapId } from '@opentools/mindmap-core'
import type {
  MindMapAssetRepository,
  MindMapStoredAsset,
} from './asset-repository'

export interface MindMapRepository {
  get(id: MindMapId): Promise<MindMapDocument | undefined>
  list(): Promise<MindMapDocument[]>
  save(document: MindMapDocument): Promise<void>
  delete(id: MindMapId): Promise<void>
}

export interface MindMapRepositoryWithAssets extends MindMapRepository {
  readonly assetRepository: MindMapAssetRepository
  saveWithAssets(
    document: MindMapDocument,
    assets: readonly MindMapStoredAsset[],
  ): Promise<void>
}

export function isMindMapRepositoryWithAssets(
  repository: MindMapRepository,
): repository is MindMapRepositoryWithAssets {
  return (
    'assetRepository' in repository &&
    'saveWithAssets' in repository &&
    typeof repository.saveWithAssets === 'function'
  )
}
