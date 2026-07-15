export type MindMapRepositoryErrorCode =
  'delete-failed' | 'read-failed' | 'write-failed'

/** A recoverable storage error that callers can present without exposing DB internals. */
export class MindMapRepositoryError extends Error {
  readonly code: MindMapRepositoryErrorCode
  readonly cause: unknown

  constructor(
    code: MindMapRepositoryErrorCode,
    message: string,
    cause: unknown = undefined,
  ) {
    super(message)
    this.name = 'MindMapRepositoryError'
    this.code = code
    this.cause = cause
  }
}

export function toMindMapRepositoryError(
  error: unknown,
  code: MindMapRepositoryErrorCode,
): MindMapRepositoryError {
  if (error instanceof MindMapRepositoryError) return error

  const messages: Record<MindMapRepositoryErrorCode, string> = {
    'read-failed': 'Mind maps could not be read from local storage.',
    'write-failed': 'The mind map could not be saved to local storage.',
    'delete-failed': 'The mind map could not be deleted from local storage.',
  }

  return new MindMapRepositoryError(code, messages[code], error)
}
