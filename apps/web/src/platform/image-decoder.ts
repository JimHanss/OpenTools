import {
  createMindMapAssetId,
  isMindMapImageMimeType,
  type MindMapAssetMetadata,
  type MindMapImageMimeType,
} from '@opentools/mindmap-core'
import {
  assertMindMapAssetWithinLimits,
  type MindMapAssetLimits,
  type MindMapAssetRepository,
  type MindMapStoredAsset,
} from '@opentools/mindmap-storage'

export type BrowserImageErrorCode =
  | 'clipboard-unavailable'
  | 'decode-failed'
  | 'invalid-dimensions'
  | 'invalid-signature'
  | 'mime-mismatch'
  | 'unsafe-svg'
  | 'unsupported-type'

export class BrowserImageError extends Error {
  readonly code: BrowserImageErrorCode
  readonly cause: unknown

  constructor(
    code: BrowserImageErrorCode,
    message: string,
    cause: unknown = undefined,
  ) {
    super(message)
    this.name = 'BrowserImageError'
    this.code = code
    this.cause = cause
  }
}

export interface BrowserImageDimensions {
  readonly width: number
  readonly height: number
}

export interface PrepareBrowserImageOptions {
  readonly limits?: Partial<MindMapAssetLimits>
  readonly now?: () => string
  readonly decodeDimensions?: (blob: Blob) => Promise<BrowserImageDimensions>
}

const allowedSvgElements = new Set([
  'circle',
  'clippath',
  'defs',
  'desc',
  'ellipse',
  'g',
  'line',
  'lineargradient',
  'mask',
  'metadata',
  'path',
  'polygon',
  'polyline',
  'radialgradient',
  'rect',
  'stop',
  'svg',
  'text',
  'title',
  'tspan',
])

const allowedSvgAttributes = new Set([
  'aria-label',
  'class',
  'clip-path',
  'cx',
  'cy',
  'd',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'id',
  'mask',
  'offset',
  'opacity',
  'points',
  'preserveaspectratio',
  'r',
  'role',
  'rx',
  'ry',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'transform',
  'viewbox',
  'width',
  'x',
  'x1',
  'x2',
  'xmlns',
  'y',
  'y1',
  'y2',
])

function hasBytes(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function normalizeDeclaredMimeType(blob: Blob): string {
  return blob.type.split(';', 1)[0]!.trim().toLowerCase()
}

async function detectImageMimeType(blob: Blob): Promise<MindMapImageMimeType> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  if (hasBytes(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return 'image/png'
  }
  if (hasBytes(bytes, 0, [255, 216, 255])) return 'image/jpeg'
  const signature = readAscii(bytes, 0, 6)
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif'
  if (readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp'
  }

  const prefix = (await blob.slice(0, 1024).text())
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (/^(?:<\?xml[\s\S]*?\?>\s*)?<svg(?:\s|>)/i.test(prefix)) {
    return 'image/svg+xml'
  }
  throw new BrowserImageError(
    'invalid-signature',
    'The selected file does not contain a supported image signature.',
  )
}

function validateSvgTagAttributes(source: string, attributes: string): void {
  const withoutAttributes = attributes.replace(
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    (_match, rawName: string, doubleValue: string, singleValue: string) => {
      const name = rawName.toLowerCase()
      const value = doubleValue ?? singleValue ?? ''
      if (name.startsWith('on') || !allowedSvgAttributes.has(name)) {
        throw new BrowserImageError(
          'unsafe-svg',
          `The SVG contains a disallowed attribute: ${rawName}.`,
        )
      }
      if (name === 'xmlns' && value === 'http://www.w3.org/2000/svg') {
        return ''
      }
      if (
        /(?:javascript|vbscript|data|file|https?):/i.test(value) ||
        /(^|[^:])\/\//.test(value) ||
        (/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/i.test(value.trim()))
      ) {
        throw new BrowserImageError(
          'unsafe-svg',
          'The SVG contains an unsafe or external URL.',
        )
      }
      return ''
    },
  )
  if (!/^\s*\/?\s*$/.test(withoutAttributes)) {
    throw new BrowserImageError(
      'unsafe-svg',
      `The SVG contains an unquoted or malformed attribute near ${source}.`,
    )
  }
}

/** Rejects active content and unknown SVG surface area instead of executing it. */
export function validateSafeSvgText(source: string): string {
  const normalized = source.replace(/^\uFEFF/, '').trim()
  if (
    /<!DOCTYPE|<!ENTITY|<\?[^x]|<script\b|<style\b|<foreignObject\b/i.test(
      normalized,
    )
  ) {
    throw new BrowserImageError(
      'unsafe-svg',
      'The SVG contains active or unsupported content.',
    )
  }

  const withoutComments = normalized.replace(/<!--[\s\S]*?-->/g, '')
  let rootCount = 0
  const matched = withoutComments.replace(
    /<\/?([A-Za-z][\w:-]*)([^<>]*)>/g,
    (tag, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase()
      if (!allowedSvgElements.has(name)) {
        throw new BrowserImageError(
          'unsafe-svg',
          `The SVG contains a disallowed element: ${rawName}.`,
        )
      }
      if (name === 'svg' && !tag.startsWith('</')) rootCount += 1
      validateSvgTagAttributes(tag, attributes)
      return ''
    },
  )
  const remainingMarkup = matched.replace(/<\?xml[\s\S]*?\?>/i, '')
  if (rootCount !== 1 || /<|>/.test(remainingMarkup)) {
    throw new BrowserImageError(
      'unsafe-svg',
      'The SVG markup is malformed or has an invalid root.',
    )
  }
  return withoutComments
}

export async function decodeBrowserImageDimensions(
  blob: Blob,
): Promise<BrowserImageDimensions> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const result = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return result
    } catch (error) {
      throw new BrowserImageError(
        'decode-failed',
        'The browser could not decode the selected image.',
        error,
      )
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new BrowserImageError(
      'decode-failed',
      'Image decoding is unavailable in this environment.',
    )
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    }
  } catch (error) {
    throw new BrowserImageError(
      'decode-failed',
      'The browser could not decode the selected image.',
      error,
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function sha256Checksum(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new BrowserImageError(
      'decode-failed',
      'Secure image checksums are unavailable in this environment.',
    )
  }
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

export async function prepareBrowserImageAsset(
  mapId: string,
  source: Blob,
  repository: MindMapAssetRepository,
  options: PrepareBrowserImageOptions = {},
): Promise<MindMapStoredAsset> {
  const declaredMimeType = normalizeDeclaredMimeType(source)
  if (declaredMimeType && !isMindMapImageMimeType(declaredMimeType)) {
    throw new BrowserImageError(
      'unsupported-type',
      'The selected file type is not supported.',
    )
  }
  const detectedMimeType = await detectImageMimeType(source)
  if (declaredMimeType && declaredMimeType !== detectedMimeType) {
    throw new BrowserImageError(
      'mime-mismatch',
      'The selected file content does not match its declared image type.',
    )
  }

  const blob =
    detectedMimeType === 'image/svg+xml'
      ? new Blob([validateSafeSvgText(await source.text())], {
          type: detectedMimeType,
        })
      : source.slice(0, source.size, detectedMimeType)
  const dimensions = await (
    options.decodeDimensions ?? decodeBrowserImageDimensions
  )(blob)
  if (
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > 100_000 ||
    dimensions.height > 100_000
  ) {
    throw new BrowserImageError(
      'invalid-dimensions',
      'The selected image has invalid or unsafe intrinsic dimensions.',
    )
  }

  const checksum = await sha256Checksum(blob)
  const id = createMindMapAssetId(checksum)
  const metadata: MindMapAssetMetadata = {
    id,
    kind: 'image',
    mimeType: detectedMimeType,
    byteSize: blob.size,
    checksum,
    intrinsicWidth: dimensions.width,
    intrinsicHeight: dimensions.height,
    createdAt: options.now?.() ?? new Date().toISOString(),
  }
  await assertMindMapAssetWithinLimits(
    repository,
    mapId,
    metadata,
    options.limits,
  )
  return { id, mapIds: [mapId], metadata, blob }
}

export function getClipboardImageBlob(
  data: Pick<DataTransfer, 'files' | 'items'> | null | undefined,
): Blob | undefined {
  if (!data) return undefined
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return Array.from(data.files).find((file) => file.type.startsWith('image/'))
}
