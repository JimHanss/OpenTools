import type {
  MindMapAssetId,
  MindMapAssetMetadata,
  MindMapId,
} from '@opentools/mindmap-core'
import {
  createMindMapAssetId,
  isMindMapImageMimeType,
} from '@opentools/mindmap-core'

import { MindMapAssetRepositoryError } from './errors'

export const defaultMindMapAssetLimits = {
  maxAssetBytes: 5 * 1024 * 1024,
  maxMapBytes: 25 * 1024 * 1024,
} as const

export interface MindMapAssetLimits {
  readonly maxAssetBytes: number
  readonly maxMapBytes: number
}

/** Immutable Blob plus map ownership kept outside the editable document. */
export interface MindMapStoredAsset {
  readonly id: MindMapAssetId
  readonly mapIds: readonly MindMapId[]
  readonly metadata: MindMapAssetMetadata
  readonly blob: Blob
}

export interface MindMapAssetRepository {
  get(assetId: MindMapAssetId): Promise<MindMapStoredAsset | undefined>
  put(asset: MindMapStoredAsset): Promise<void>
  listByMap(mapId: MindMapId): Promise<MindMapStoredAsset[]>
  delete(assetId: MindMapAssetId): Promise<void>
  release(assetId: MindMapAssetId, mapId: MindMapId): Promise<void>
  deleteByMap(mapId: MindMapId): Promise<void>
}

/** Validates the immutable record boundary before any adapter writes data. */
export function assertMindMapStoredAsset(
  asset: MindMapStoredAsset,
  expectedMapId?: MindMapId,
): void {
  const normalizedMimeType = asset.metadata.mimeType.toLowerCase()
  let checksumAssetId: MindMapAssetId
  try {
    checksumAssetId = createMindMapAssetId(asset.metadata.checksum)
  } catch (error) {
    throw new MindMapAssetRepositoryError(
      'integrity-failed',
      'The image checksum is not a valid SHA-256 digest.',
      error,
    )
  }

  if (
    asset.id !== asset.metadata.id ||
    asset.id !== checksumAssetId ||
    !isMindMapImageMimeType(normalizedMimeType) ||
    asset.blob.size !== asset.metadata.byteSize ||
    asset.blob.type.toLowerCase() !== normalizedMimeType ||
    asset.mapIds.length === 0 ||
    asset.mapIds.some((mapId) => mapId.trim().length === 0) ||
    (expectedMapId !== undefined && !asset.mapIds.includes(expectedMapId))
  ) {
    throw new MindMapAssetRepositoryError(
      'integrity-failed',
      'The stored image does not match its asset metadata or map ownership.',
    )
  }
}

export function cloneMindMapStoredAsset(
  asset: MindMapStoredAsset,
): MindMapStoredAsset {
  return {
    id: asset.id,
    mapIds: [...new Set(asset.mapIds)].sort(),
    metadata: { ...asset.metadata },
    blob: asset.blob.slice(0, asset.blob.size, asset.blob.type),
  }
}

function assertPositiveLimit(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive number.`)
  }
}

export function resolveMindMapAssetLimits(
  limits: Partial<MindMapAssetLimits> = {},
): MindMapAssetLimits {
  const resolved = {
    maxAssetBytes:
      limits.maxAssetBytes ?? defaultMindMapAssetLimits.maxAssetBytes,
    maxMapBytes: limits.maxMapBytes ?? defaultMindMapAssetLimits.maxMapBytes,
  }
  assertPositiveLimit(resolved.maxAssetBytes, 'maxAssetBytes')
  assertPositiveLimit(resolved.maxMapBytes, 'maxMapBytes')
  return resolved
}

export async function getMindMapAssetByteSize(
  repository: MindMapAssetRepository,
  mapId: MindMapId,
): Promise<number> {
  return (await repository.listByMap(mapId)).reduce(
    (total, asset) => total + asset.metadata.byteSize,
    0,
  )
}

export async function assertMindMapAssetWithinLimits(
  repository: MindMapAssetRepository,
  mapId: MindMapId,
  metadata: MindMapAssetMetadata,
  limits: Partial<MindMapAssetLimits> = {},
): Promise<void> {
  const resolved = resolveMindMapAssetLimits(limits)
  if (metadata.byteSize > resolved.maxAssetBytes) {
    throw new MindMapAssetRepositoryError(
      'asset-too-large',
      'The selected image is larger than the configured per-image limit.',
    )
  }

  const existing = await repository.get(metadata.id)
  const alreadyOwned = existing?.mapIds.includes(mapId) ?? false
  const nextTotal =
    (await getMindMapAssetByteSize(repository, mapId)) +
    (alreadyOwned ? 0 : metadata.byteSize)
  if (nextTotal > resolved.maxMapBytes) {
    throw new MindMapAssetRepositoryError(
      'map-limit-exceeded',
      'This mind map has reached its configured image storage limit.',
    )
  }
}

export function getMindMapStoredAssetReferenceCount(
  asset: MindMapStoredAsset,
): number {
  return new Set(asset.mapIds).size
}
