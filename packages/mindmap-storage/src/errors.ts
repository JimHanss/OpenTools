export type MindMapRepositoryErrorCode =
  'delete-failed' | 'read-failed' | 'write-failed'

export type MindMapAssetRepositoryErrorCode =
  | 'asset-too-large'
  | 'delete-failed'
  | 'integrity-failed'
  | 'map-limit-exceeded'
  | 'quota-exceeded'
  | 'read-failed'
  | 'storage-unavailable'
  | 'transaction-failed'
  | 'write-failed'

/** A recoverable error for Blob storage, quotas, and transactional imports. */
export class MindMapAssetRepositoryError extends Error {
  readonly code: MindMapAssetRepositoryErrorCode
  readonly cause: unknown

  constructor(
    code: MindMapAssetRepositoryErrorCode,
    message: string,
    cause: unknown = undefined,
  ) {
    super(message)
    this.name = 'MindMapAssetRepositoryError'
    this.code = code
    this.cause = cause
  }
}

function isDomExceptionNamed(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'name') === name
  )
}

export function toMindMapAssetRepositoryError(
  error: unknown,
  fallbackCode: MindMapAssetRepositoryErrorCode,
): MindMapAssetRepositoryError {
  if (error instanceof MindMapAssetRepositoryError) return error
  if (isDomExceptionNamed(error, 'QuotaExceededError')) {
    return new MindMapAssetRepositoryError(
      'quota-exceeded',
      'The browser does not have enough storage space for this image.',
      error,
    )
  }
  if (
    isDomExceptionNamed(error, 'InvalidStateError') ||
    isDomExceptionNamed(error, 'NotSupportedError') ||
    isDomExceptionNamed(error, 'SecurityError')
  ) {
    return new MindMapAssetRepositoryError(
      'storage-unavailable',
      'Browser image storage is unavailable.',
      error,
    )
  }

  const messages: Record<MindMapAssetRepositoryErrorCode, string> = {
    'asset-too-large': 'The selected image is too large.',
    'delete-failed': 'The stored image could not be deleted.',
    'integrity-failed': 'The stored image failed an integrity check.',
    'map-limit-exceeded': 'This mind map has reached its image storage limit.',
    'quota-exceeded': 'The browser does not have enough storage space.',
    'read-failed': 'Stored images could not be read.',
    'storage-unavailable': 'Browser image storage is unavailable.',
    'transaction-failed': 'The map and its images could not be saved together.',
    'write-failed': 'The image could not be saved.',
  }
  return new MindMapAssetRepositoryError(
    fallbackCode,
    messages[fallbackCode],
    error,
  )
}

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
