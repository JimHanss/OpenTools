export type MindMapExportErrorCode =
  | 'invalid-bounds'
  | 'memory-exhausted'
  | 'png-encoding-failed'
  | 'png-too-large'
  | 'png-unavailable'
  | 'render-failed'
  | 'resource-unavailable'

/** A recoverable export failure that the UI can translate without parsing text. */
export class MindMapExportError extends Error {
  readonly code: MindMapExportErrorCode
  readonly cause: unknown
  readonly resourceIds: readonly string[]

  constructor(
    code: MindMapExportErrorCode,
    message: string,
    options: {
      readonly cause?: unknown
      readonly resourceIds?: readonly string[]
    } = {},
  ) {
    super(message)
    this.name = 'MindMapExportError'
    this.code = code
    this.cause = options.cause
    this.resourceIds = options.resourceIds ?? []
  }
}

export const maxPngExportDimension = 16_384
export const maxPngExportPixels = 16_000_000

export function assertPngExportCapacity(
  width: number,
  height: number,
  limits: {
    readonly maxDimension?: number
    readonly maxPixels?: number
  } = {},
): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new MindMapExportError(
      'invalid-bounds',
      'The export has no usable dimensions.',
    )
  }

  const maxDimension = limits.maxDimension ?? maxPngExportDimension
  const maxPixels = limits.maxPixels ?? maxPngExportPixels
  if (
    width > maxDimension ||
    height > maxDimension ||
    width * height > maxPixels
  ) {
    throw new MindMapExportError(
      'png-too-large',
      'The map is too large to export safely as PNG. Export SVG instead.',
    )
  }
}
