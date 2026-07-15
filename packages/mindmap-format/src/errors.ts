export type MindMapFormatErrorCode =
  | 'invalid-document'
  | 'invalid-json'
  | 'invalid-tree'
  | 'migration-failed'
  | 'unsupported-schema-version'

/**
 * A stable, user-safe error intended for import and export UI. The original
 * error remains available as the cause for diagnostics without being shown to
 * users directly.
 */
export class MindMapFormatError extends Error {
  readonly code: MindMapFormatErrorCode
  readonly cause: unknown

  constructor(
    code: MindMapFormatErrorCode,
    message: string,
    cause: unknown = undefined,
  ) {
    super(message)
    this.name = 'MindMapFormatError'
    this.code = code
    this.cause = cause
  }
}

export function toMindMapFormatError(
  error: unknown,
  code: MindMapFormatErrorCode,
  message: string,
): MindMapFormatError {
  if (error instanceof MindMapFormatError) return error
  return new MindMapFormatError(code, message, error)
}
