import type {
  MindMapAssetId,
  MindMapDocument,
  MindMapImageContentBlock,
} from './model'

export const supportedMindMapImageMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const

export type MindMapImageMimeType =
  (typeof supportedMindMapImageMimeTypes)[number]

export function isMindMapImageMimeType(
  value: string,
): value is MindMapImageMimeType {
  return supportedMindMapImageMimeTypes.includes(
    value.toLowerCase() as MindMapImageMimeType,
  )
}

/** Uses a normalized SHA-256 digest as the stable, content-addressed asset ID. */
export function createMindMapAssetId(checksum: string): MindMapAssetId {
  const normalized = checksum.trim().toLowerCase()
  const digest = normalized.startsWith('sha256:')
    ? normalized.slice('sha256:'.length)
    : normalized
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError('A mind map asset requires a SHA-256 checksum.')
  }
  return `asset-${digest}`
}

export function getMindMapAssetReferenceCounts(
  document: Pick<MindMapDocument, 'nodes'>,
): ReadonlyMap<MindMapAssetId, number> {
  const counts = new Map<MindMapAssetId, number>()
  for (const node of Object.values(document.nodes)) {
    for (const block of node.contentBlocks) {
      if (block.type !== 'image') continue
      counts.set(block.assetId, (counts.get(block.assetId) ?? 0) + 1)
    }
  }
  return counts
}

export function getReferencedMindMapAssetIds(
  document: Pick<MindMapDocument, 'nodes'>,
): ReadonlySet<MindMapAssetId> {
  return new Set(getMindMapAssetReferenceCounts(document).keys())
}

export function getMindMapImageBlocks(
  document: Pick<MindMapDocument, 'nodes'>,
  assetId?: MindMapAssetId,
): readonly MindMapImageContentBlock[] {
  return Object.values(document.nodes).flatMap((node) =>
    node.contentBlocks.flatMap((block) =>
      block.type === 'image' && (!assetId || block.assetId === assetId)
        ? [block]
        : [],
    ),
  )
}
