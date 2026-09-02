import {
  MindMapCommandError,
  MindMapValidationError,
  type MindMapCommandErrorCode,
} from '@opentools/mindmap-core'
import {
  MindMapFormatError,
  type MindMapFormatErrorCode,
} from '@opentools/mindmap-format'
import {
  MindMapAssetRepositoryError,
  MindMapRepositoryError,
  type MindMapAssetRepositoryErrorCode,
  type MindMapRepositoryErrorCode,
} from '@opentools/mindmap-storage'

import {
  MindMapLibraryError,
  type MindMapLibraryErrorCode,
} from '../library/map-library'
import {
  MindMapExportError,
  type MindMapExportErrorCode,
} from '../platform/export-error'
import {
  localizedMessage,
  type LocalizedMessage,
  type TranslationKey,
} from './messages'

const formatErrorKeys: Record<MindMapFormatErrorCode, TranslationKey> = {
  'asset-checksum-mismatch': 'errors.format.assetChecksumMismatch',
  'asset-limit-exceeded': 'errors.format.assetLimitExceeded',
  'invalid-bundle': 'errors.format.invalidBundle',
  'invalid-document': 'errors.format.invalidDocument',
  'invalid-json': 'errors.format.invalidJson',
  'invalid-tree': 'errors.format.invalidTree',
  'migration-failed': 'errors.format.migrationFailed',
  'missing-asset': 'errors.format.missingAsset',
  'unsupported-schema-version': 'errors.format.unsupportedSchemaVersion',
}

const repositoryErrorKeys: Record<MindMapRepositoryErrorCode, TranslationKey> =
  {
    'read-failed': 'errors.repository.readFailed',
    'write-failed': 'errors.repository.writeFailed',
    'delete-failed': 'errors.repository.deleteFailed',
  }

const assetRepositoryErrorKeys: Record<
  MindMapAssetRepositoryErrorCode,
  TranslationKey
> = {
  'asset-too-large': 'errors.image.assetTooLarge',
  'delete-failed': 'errors.image.deleteFailed',
  'integrity-failed': 'errors.image.integrityFailed',
  'map-limit-exceeded': 'errors.image.mapLimitExceeded',
  'quota-exceeded': 'errors.image.quotaExceeded',
  'read-failed': 'errors.image.readFailed',
  'storage-unavailable': 'errors.image.storageUnavailable',
  'transaction-failed': 'errors.image.transactionFailed',
  'write-failed': 'errors.image.writeFailed',
}

const libraryErrorKeys: Record<MindMapLibraryErrorCode, TranslationKey> = {
  'invalid-map': 'errors.library.invalidMap',
  'map-not-found': 'errors.library.mapNotFound',
  'missing-assets': 'errors.library.missingAssets',
}

const commandErrorKeys: Record<MindMapCommandErrorCode, TranslationKey> = {
  'empty-batch': 'errors.command.emptyBatch',
  'invalid-command': 'errors.command.invalidCommand',
  'invalid-index': 'errors.command.invalidIndex',
  'invalid-link': 'errors.command.invalidLink',
  'invalid-content-block': 'errors.command.invalidContentBlock',
  'invalid-asset': 'errors.command.invalidAsset',
  'invalid-label': 'errors.command.invalidLabel',
  'invalid-marker': 'errors.command.invalidMarker',
  'invalid-numbering': 'errors.command.invalidNumbering',
  'invalid-enhancement': 'errors.command.invalidEnhancement',
  'invalid-placement': 'errors.command.invalidPlacement',
  'invalid-subtree': 'errors.command.invalidSubtree',
  'invalid-structure': 'errors.command.invalidStructure',
  'invalid-style': 'errors.command.invalidStyle',
  'invalid-width': 'errors.command.invalidWidth',
  'missing-node': 'errors.command.missingNode',
  'missing-content-block': 'errors.command.missingContentBlock',
  'no-op-move': 'errors.command.noOpMove',
  'not-floating-topic': 'errors.command.notFloatingTopic',
  'already-floating-topic': 'errors.command.alreadyFloatingTopic',
  'node-id-collision': 'errors.command.nodeIdCollision',
  'root-protected': 'errors.command.rootProtected',
  'target-is-descendant': 'errors.command.targetIsDescendant',
}

const exportErrorKeys: Record<MindMapExportErrorCode, TranslationKey> = {
  'invalid-bounds': 'errors.export.invalidBounds',
  'memory-exhausted': 'errors.export.memoryExhausted',
  'png-encoding-failed': 'errors.export.pngEncodingFailed',
  'png-too-large': 'errors.export.pngTooLarge',
  'png-unavailable': 'errors.export.pngUnavailable',
  'render-failed': 'errors.export.renderFailed',
  'resource-unavailable': 'errors.export.resourceUnavailable',
}

export function toLocalizedError(
  error: unknown,
  fallbackKey: TranslationKey = 'errors.unexpected',
): LocalizedMessage {
  if (error instanceof MindMapFormatError) {
    return localizedMessage(formatErrorKeys[error.code])
  }
  if (error instanceof MindMapRepositoryError) {
    return localizedMessage(repositoryErrorKeys[error.code])
  }
  if (error instanceof MindMapAssetRepositoryError) {
    return localizedMessage(assetRepositoryErrorKeys[error.code])
  }
  if (error instanceof MindMapLibraryError) {
    return localizedMessage(libraryErrorKeys[error.code])
  }
  if (error instanceof MindMapCommandError) {
    return localizedMessage(commandErrorKeys[error.code])
  }
  if (error instanceof MindMapExportError) {
    return localizedMessage(exportErrorKeys[error.code])
  }
  if (error instanceof MindMapValidationError) {
    return localizedMessage('errors.validation.invalidTree')
  }
  return localizedMessage(fallbackKey)
}
