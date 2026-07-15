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
  MindMapRepositoryError,
  type MindMapRepositoryErrorCode,
} from '@opentools/mindmap-storage'

import {
  MindMapLibraryError,
  type MindMapLibraryErrorCode,
} from '../library/map-library'
import {
  localizedMessage,
  type LocalizedMessage,
  type TranslationKey,
} from './messages'

const formatErrorKeys: Record<MindMapFormatErrorCode, TranslationKey> = {
  'invalid-document': 'errors.format.invalidDocument',
  'invalid-json': 'errors.format.invalidJson',
  'invalid-tree': 'errors.format.invalidTree',
  'migration-failed': 'errors.format.migrationFailed',
  'unsupported-schema-version': 'errors.format.unsupportedSchemaVersion',
}

const repositoryErrorKeys: Record<MindMapRepositoryErrorCode, TranslationKey> =
  {
    'read-failed': 'errors.repository.readFailed',
    'write-failed': 'errors.repository.writeFailed',
    'delete-failed': 'errors.repository.deleteFailed',
  }

const libraryErrorKeys: Record<MindMapLibraryErrorCode, TranslationKey> = {
  'invalid-map': 'errors.library.invalidMap',
  'map-not-found': 'errors.library.mapNotFound',
}

const commandErrorKeys: Record<MindMapCommandErrorCode, TranslationKey> = {
  'empty-batch': 'errors.command.emptyBatch',
  'invalid-command': 'errors.command.invalidCommand',
  'invalid-index': 'errors.command.invalidIndex',
  'invalid-link': 'errors.command.invalidLink',
  'invalid-marker': 'errors.command.invalidMarker',
  'invalid-enhancement': 'errors.command.invalidEnhancement',
  'invalid-subtree': 'errors.command.invalidSubtree',
  'missing-node': 'errors.command.missingNode',
  'no-op-move': 'errors.command.noOpMove',
  'node-id-collision': 'errors.command.nodeIdCollision',
  'root-protected': 'errors.command.rootProtected',
  'target-is-descendant': 'errors.command.targetIsDescendant',
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
  if (error instanceof MindMapLibraryError) {
    return localizedMessage(libraryErrorKeys[error.code])
  }
  if (error instanceof MindMapCommandError) {
    return localizedMessage(commandErrorKeys[error.code])
  }
  if (error instanceof MindMapValidationError) {
    return localizedMessage('errors.validation.invalidTree')
  }
  return localizedMessage(fallbackKey)
}
