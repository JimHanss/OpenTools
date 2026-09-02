import { z } from 'zod'

import {
  createMindMapAssetId,
  getReferencedMindMapAssetIds,
  isMindMapImageMimeType,
  type MindMapAssetMetadata,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import { MindMapFormatError } from './errors'
import { parseMindMapDocument, serializeMindMapDocument } from './index'

export const mindMapBundleKind = 'opentools-mindmap-bundle'
export const mindMapBundleVersion = 1

export interface MindMapBundleLimits {
  readonly maxAssetBytes: number
  readonly maxTotalAssetBytes: number
}

export interface MindMapBundleAssetData {
  readonly metadata: MindMapAssetMetadata
  readonly bytes: Uint8Array
}

export interface ParsedMindMapBundle {
  readonly document: MindMapDocument
  readonly assets: readonly MindMapBundleAssetData[]
}

const defaultBundleLimits: MindMapBundleLimits = {
  maxAssetBytes: 5 * 1024 * 1024,
  maxTotalAssetBytes: 25 * 1024 * 1024,
}

const bundleAssetSchema = z.strictObject({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  intrinsicWidth: z.number().finite().positive(),
  intrinsicHeight: z.number().finite().positive(),
  createdAt: z.string().min(1),
  data: z.string(),
})

export const mindMapBundleSchema = z.strictObject({
  kind: z.literal(mindMapBundleKind),
  bundleVersion: z.literal(mindMapBundleVersion),
  document: z.unknown(),
  assets: z.array(bundleAssetSchema),
})

function resolveLimits(
  limits: Partial<MindMapBundleLimits> = {},
): MindMapBundleLimits {
  const resolved = {
    maxAssetBytes: limits.maxAssetBytes ?? defaultBundleLimits.maxAssetBytes,
    maxTotalAssetBytes:
      limits.maxTotalAssetBytes ?? defaultBundleLimits.maxTotalAssetBytes,
  }
  if (
    !Number.isFinite(resolved.maxAssetBytes) ||
    resolved.maxAssetBytes <= 0 ||
    !Number.isFinite(resolved.maxTotalAssetBytes) ||
    resolved.maxTotalAssetBytes <= 0
  ) {
    throw new TypeError('Mind map bundle limits must be positive numbers.')
  }
  return resolved
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

function decodeBase64(value: string): Uint8Array {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new MindMapFormatError(
      'invalid-bundle',
      'A mind map bundle contains invalid Base64 image data.',
    )
  }
  const outputLength =
    (value.length / 4) * 3 -
    (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
  const output = new Uint8Array(outputLength)
  let outputIndex = 0
  for (let index = 0; index < value.length; index += 4) {
    const first = base64Alphabet.indexOf(value[index]!)
    const second = base64Alphabet.indexOf(value[index + 1]!)
    const third =
      value[index + 2] === '=' ? 0 : base64Alphabet.indexOf(value[index + 2]!)
    const fourth =
      value[index + 3] === '=' ? 0 : base64Alphabet.indexOf(value[index + 3]!)
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth
    if (outputIndex < output.length)
      output[outputIndex++] = (combined >> 16) & 255
    if (outputIndex < output.length)
      output[outputIndex++] = (combined >> 8) & 255
    if (outputIndex < output.length) output[outputIndex++] = combined & 255
  }
  return output
}

async function checksumBytes(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new MindMapFormatError(
      'invalid-bundle',
      'Secure bundle checksums are unavailable in this environment.',
    )
  }
  const source = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', source.buffer)
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function assertAssetMetadataMatches(
  document: MindMapDocument,
  metadata: MindMapAssetMetadata,
): void {
  const expected = document.assets[metadata.id]
  if (
    !expected ||
    !isMindMapImageMimeType(metadata.mimeType) ||
    createMindMapAssetId(metadata.checksum) !== metadata.id ||
    JSON.stringify(expected) !== JSON.stringify(metadata)
  ) {
    throw new MindMapFormatError(
      'invalid-bundle',
      'A bundle asset does not match the document asset manifest.',
    )
  }
}

export function isMindMapBundle(input: unknown): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    Reflect.get(input, 'kind') === mindMapBundleKind
  )
}

export async function serializeMindMapBundle(
  document: MindMapDocument,
  assets: readonly MindMapBundleAssetData[],
  limits: Partial<MindMapBundleLimits> = {},
): Promise<string> {
  const resolvedLimits = resolveLimits(limits)
  const normalizedDocument = JSON.parse(
    serializeMindMapDocument(document),
  ) as unknown
  const referencedAssetIds = getReferencedMindMapAssetIds(document)
  const assetsById = new Map(assets.map((asset) => [asset.metadata.id, asset]))
  if (
    assetsById.size !== assets.length ||
    [...referencedAssetIds].some((assetId) => !assetsById.has(assetId))
  ) {
    throw new MindMapFormatError(
      'missing-asset',
      'Every referenced image must be present before exporting a bundle.',
    )
  }

  let totalBytes = 0
  const serializedAssets = []
  for (const assetId of [...referencedAssetIds].sort()) {
    const asset = assetsById.get(assetId)!
    assertAssetMetadataMatches(document, asset.metadata)
    const bytes = new Uint8Array(asset.bytes)
    totalBytes += bytes.byteLength
    if (
      bytes.byteLength !== asset.metadata.byteSize ||
      bytes.byteLength > resolvedLimits.maxAssetBytes ||
      totalBytes > resolvedLimits.maxTotalAssetBytes
    ) {
      throw new MindMapFormatError(
        'asset-limit-exceeded',
        'The bundle exceeds the configured image size limits.',
      )
    }
    if ((await checksumBytes(bytes)) !== asset.metadata.checksum) {
      throw new MindMapFormatError(
        'asset-checksum-mismatch',
        'An image checksum does not match its bundle payload.',
      )
    }
    serializedAssets.push({
      id: asset.metadata.id,
      mimeType: asset.metadata.mimeType,
      byteSize: asset.metadata.byteSize,
      checksum: asset.metadata.checksum,
      intrinsicWidth: asset.metadata.intrinsicWidth,
      intrinsicHeight: asset.metadata.intrinsicHeight,
      createdAt: asset.metadata.createdAt,
      data: encodeBase64(bytes),
    })
  }

  return JSON.stringify(
    {
      kind: mindMapBundleKind,
      bundleVersion: mindMapBundleVersion,
      document: normalizedDocument,
      assets: serializedAssets,
    },
    null,
    2,
  )
}

export async function parseMindMapBundle(
  input: unknown,
  limits: Partial<MindMapBundleLimits> = {},
): Promise<ParsedMindMapBundle> {
  const parsed = mindMapBundleSchema.safeParse(input)
  if (!parsed.success) {
    throw new MindMapFormatError(
      'invalid-bundle',
      'The selected file is not a valid OpenTools mind map bundle.',
      parsed.error,
    )
  }
  const resolvedLimits = resolveLimits(limits)
  const document = parseMindMapDocument(parsed.data.document)
  const referencedAssetIds = getReferencedMindMapAssetIds(document)
  const seenAssetIds = new Set<string>()
  const assets: MindMapBundleAssetData[] = []
  let totalBytes = 0

  for (const serialized of parsed.data.assets) {
    if (seenAssetIds.has(serialized.id)) {
      throw new MindMapFormatError(
        'invalid-bundle',
        'A bundle cannot contain duplicate image IDs.',
      )
    }
    seenAssetIds.add(serialized.id)
    const metadata: MindMapAssetMetadata = {
      id: serialized.id,
      kind: 'image',
      mimeType: serialized.mimeType,
      byteSize: serialized.byteSize,
      checksum: serialized.checksum,
      intrinsicWidth: serialized.intrinsicWidth,
      intrinsicHeight: serialized.intrinsicHeight,
      createdAt: serialized.createdAt,
    }
    assertAssetMetadataMatches(document, metadata)
    const bytes = decodeBase64(serialized.data)
    totalBytes += bytes.byteLength
    if (
      bytes.byteLength !== metadata.byteSize ||
      bytes.byteLength > resolvedLimits.maxAssetBytes ||
      totalBytes > resolvedLimits.maxTotalAssetBytes
    ) {
      throw new MindMapFormatError(
        'asset-limit-exceeded',
        'The bundle exceeds the configured image size limits.',
      )
    }
    if ((await checksumBytes(bytes)) !== metadata.checksum) {
      throw new MindMapFormatError(
        'asset-checksum-mismatch',
        'An image checksum does not match its bundle payload.',
      )
    }
    assets.push({ metadata, bytes })
  }

  if (
    assets.length !== referencedAssetIds.size ||
    [...referencedAssetIds].some((assetId) => !seenAssetIds.has(assetId))
  ) {
    throw new MindMapFormatError(
      'missing-asset',
      'The bundle is missing a referenced image payload.',
    )
  }
  return { document, assets }
}

export async function parseMindMapBundleJson(
  json: string,
  limits: Partial<MindMapBundleLimits> = {},
): Promise<ParsedMindMapBundle> {
  try {
    return await parseMindMapBundle(JSON.parse(json) as unknown, limits)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new MindMapFormatError(
        'invalid-json',
        'The selected file is not valid JSON.',
        error,
      )
    }
    throw error
  }
}
