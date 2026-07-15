import {
  assertMindMapDocument,
  MindMapValidationError,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import { MindMapFormatError, toMindMapFormatError } from './errors'
import { migrateV1Document, normalizeV2Document } from './migration'
import {
  mindMapDocumentSchema,
  mindMapDocumentV1Schema,
  mindMapDocumentV2Schema,
} from './schema'

export * from './errors'
export * from './migration'
export * from './schema'

function getSchemaVersion(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return undefined
  return Reflect.get(input, 'schemaVersion')
}

function validateTree(document: MindMapDocument): MindMapDocument {
  try {
    return assertMindMapDocument(document)
  } catch (error) {
    if (error instanceof MindMapValidationError) {
      throw new MindMapFormatError(
        'invalid-tree',
        'The mind map structure is invalid.',
        error,
      )
    }
    throw error
  }
}

function validateSerializableDocument(
  document: MindMapDocument,
): MindMapDocument {
  const parsed = mindMapDocumentV2Schema.safeParse(document)
  if (!parsed.success) {
    throw new MindMapFormatError(
      'invalid-document',
      'The current mind map contains invalid fields and cannot be exported.',
      parsed.error,
    )
  }

  return validateTree(normalizeV2Document(parsed.data))
}

/** Parses a v1 or v2 file and always returns the editable v2 domain format. */
export function parseMindMapDocument(input: unknown): MindMapDocument {
  const schemaVersion = getSchemaVersion(input)

  if (typeof schemaVersion !== 'number') {
    throw new MindMapFormatError(
      'invalid-document',
      'The mind map file is missing a valid schema version.',
    )
  }

  if (schemaVersion > 2) {
    throw new MindMapFormatError(
      'unsupported-schema-version',
      'This mind map file was created by a newer version of OpenTools.',
    )
  }

  const parsed = mindMapDocumentSchema.safeParse(input)
  if (!parsed.success) {
    throw new MindMapFormatError(
      'invalid-document',
      'The mind map file contains invalid fields.',
      parsed.error,
    )
  }

  try {
    const document =
      parsed.data.schemaVersion === 1
        ? migrateV1Document(mindMapDocumentV1Schema.parse(parsed.data))
        : normalizeV2Document(mindMapDocumentV2Schema.parse(parsed.data))

    return validateTree(document)
  } catch (error) {
    if (error instanceof MindMapFormatError) throw error
    throw toMindMapFormatError(
      error,
      'migration-failed',
      'The mind map file could not be migrated safely.',
    )
  }
}

export function parseMindMapDocumentJson(json: string): MindMapDocument {
  try {
    return parseMindMapDocument(JSON.parse(json) as unknown)
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

export function serializeMindMapDocument(document: MindMapDocument): string {
  try {
    return JSON.stringify(validateSerializableDocument(document), null, 2)
  } catch (error) {
    if (error instanceof MindMapFormatError) throw error
    throw toMindMapFormatError(
      error,
      'invalid-document',
      'The current mind map cannot be exported safely.',
    )
  }
}
