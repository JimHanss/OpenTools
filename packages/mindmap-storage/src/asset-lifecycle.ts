import type { MindMapAssetId, MindMapId } from '@opentools/mindmap-core'

import type { MindMapAssetRepository } from './asset-repository'

export async function collectOrphanMindMapAssets(
  repository: MindMapAssetRepository,
  mapId: MindMapId,
  referencedAssetIds: ReadonlySet<MindMapAssetId>,
): Promise<readonly MindMapAssetId[]> {
  const released: MindMapAssetId[] = []
  for (const asset of await repository.listByMap(mapId)) {
    if (referencedAssetIds.has(asset.id)) continue
    await repository.release(asset.id, mapId)
    released.push(asset.id)
  }
  return released.sort()
}

export interface MindMapAssetGarbageCollectorOptions {
  readonly delayMs?: number
  readonly onError?: (error: unknown) => void
}

/** Delays orphan cleanup so undo/redo can continue to read the original Blob. */
export class MindMapAssetGarbageCollector {
  readonly #repository: MindMapAssetRepository
  readonly #delayMs: number
  readonly #onError: ((error: unknown) => void) | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #pending:
    | {
        readonly mapId: MindMapId
        readonly referencedAssetIds: ReadonlySet<MindMapAssetId>
      }
    | undefined

  constructor(
    repository: MindMapAssetRepository,
    options: MindMapAssetGarbageCollectorOptions = {},
  ) {
    this.#repository = repository
    this.#delayMs = options.delayMs ?? 30_000
    this.#onError = options.onError
  }

  schedule(
    mapId: MindMapId,
    referencedAssetIds: ReadonlySet<MindMapAssetId>,
  ): void {
    this.cancel()
    this.#pending = {
      mapId,
      referencedAssetIds: new Set(referencedAssetIds),
    }
    this.#timer = setTimeout(() => {
      void this.flush().catch((error: unknown) => this.#onError?.(error))
    }, this.#delayMs)
  }

  cancel(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = undefined
    this.#pending = undefined
  }

  async flush(): Promise<readonly MindMapAssetId[]> {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = undefined
    const pending = this.#pending
    this.#pending = undefined
    return pending
      ? collectOrphanMindMapAssets(
          this.#repository,
          pending.mapId,
          pending.referencedAssetIds,
        )
      : []
  }

  dispose(): void {
    this.cancel()
  }
}
