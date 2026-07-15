import { describe, expect, it } from 'vitest'

import {
  MindMapCommandError,
  MindMapValidationError,
} from '@opentools/mindmap-core'
import { MindMapFormatError } from '@opentools/mindmap-format'
import { MindMapRepositoryError } from '@opentools/mindmap-storage'

import { MindMapLibraryError } from '../library/map-library'
import { toLocalizedError } from './errors'

describe('localized error mapping', () => {
  it('maps stable domain and adapter error codes to translation keys', () => {
    expect(
      toLocalizedError(new MindMapFormatError('invalid-json', 'raw')),
    ).toEqual({ key: 'errors.format.invalidJson' })
    expect(
      toLocalizedError(new MindMapRepositoryError('write-failed', 'raw')),
    ).toEqual({ key: 'errors.repository.writeFailed' })
    expect(
      toLocalizedError(new MindMapLibraryError('map-not-found', 'raw')),
    ).toEqual({ key: 'errors.library.mapNotFound' })
    expect(
      toLocalizedError(new MindMapCommandError('root-protected', 'raw')),
    ).toEqual({ key: 'errors.command.rootProtected' })
    expect(
      toLocalizedError(new MindMapValidationError('tree-cycle', 'raw')),
    ).toEqual({ key: 'errors.validation.invalidTree' })
  })

  it('uses the requested safe fallback instead of an unknown error message', () => {
    expect(
      toLocalizedError(
        new Error('sensitive details'),
        'errors.topicUpdateFailed',
      ),
    ).toEqual({
      key: 'errors.topicUpdateFailed',
    })
  })
})
