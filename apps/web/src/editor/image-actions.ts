import {
  mindMapCommandTypes,
  type CommandResult,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapNodeId,
} from '@opentools/mindmap-core'
import type {
  MindMapAssetLimits,
  MindMapAssetRepository,
} from '@opentools/mindmap-storage'

import { prepareBrowserImageAsset } from '../platform/image-decoder'

export interface InsertBrowserImageOptions {
  readonly document: MindMapDocument
  readonly nodeId: MindMapNodeId
  readonly source: Blob
  readonly repository: MindMapAssetRepository
  readonly execute: (command: MindMapCommand) => CommandResult | undefined
  readonly createId: () => string
  readonly limits?: Partial<MindMapAssetLimits>
  readonly now?: () => string
  readonly decodeDimensions?: (blob: Blob) => Promise<{
    readonly width: number
    readonly height: number
  }>
}

export async function insertBrowserImage(
  options: InsertBrowserImageOptions,
): Promise<CommandResult> {
  const stored = await prepareBrowserImageAsset(
    options.document.id,
    options.source,
    options.repository,
    {
      ...(options.limits ? { limits: options.limits } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.decodeDimensions
        ? { decodeDimensions: options.decodeDimensions }
        : {}),
    },
  )
  const existing = await options.repository.get(stored.id)
  const alreadyOwned = existing?.mapIds.includes(options.document.id) ?? false
  await options.repository.put(stored)

  const width = Math.min(360, Math.max(80, stored.metadata.intrinsicWidth))
  const height =
    width * (stored.metadata.intrinsicHeight / stored.metadata.intrinsicWidth)
  try {
    const result = options.execute({
      type: mindMapCommandTypes.createImageContentBlock,
      label: 'Add topic image',
      payload: {
        nodeId: options.nodeId,
        block: {
          id: options.createId(),
          type: 'image',
          assetId: stored.id,
          width,
          height,
          altText: '',
          preserveAspectRatio: true,
        },
        asset: stored.metadata,
      },
    })
    if (!result) throw new Error('The image command was not applied.')
    return result
  } catch (error) {
    if (!alreadyOwned) {
      await options.repository
        .release(stored.id, options.document.id)
        .catch(() => undefined)
    }
    throw error
  }
}
