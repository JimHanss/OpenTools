import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  createMindMapNode,
} from '@opentools/mindmap-core'

import {
  MindMapFormatError,
  parseMindMapDocument,
  parseMindMapDocumentJson,
  serializeMindMapDocument,
} from './index'
import {
  legacyV1MindMapDocumentFixture,
  malformedMindMapImportFixtures,
} from './test-fixtures'

function expectFormatError(
  callback: () => unknown,
  code: MindMapFormatError['code'],
): void {
  expect(callback).toThrow(
    expect.objectContaining({ name: 'MindMapFormatError', code }),
  )
}

describe('mind map document format', () => {
  it('migrates v1 documents to normalized v2 without losing IDs or markers', () => {
    const legacyDocument = {
      ...legacyV1MindMapDocumentFixture,
      nodes: {
        ...legacyV1MindMapDocumentFixture.nodes,
        child: {
          ...legacyV1MindMapDocumentFixture.nodes.child,
          markers: ['icon:star', 'legacy-marker'],
        },
      },
    }

    const document = parseMindMapDocument(legacyDocument)

    expect(document.schemaVersion).toBe(2)
    expect(document.id).toBe(legacyDocument.id)
    expect(document.nodes.root?.markers).toEqual([
      { kind: 'priority', value: '1' },
    ])
    expect(document.nodes.child?.markers).toEqual([
      { kind: 'icon', value: 'star' },
      { kind: 'icon', value: 'legacy-marker' },
    ])
    expect(document.nodes.child?.style.fontWeight).toBe('semibold')
  })

  it('round-trips a valid v2 document through validated serialization', () => {
    const document = createMindMapDocument({
      id: 'v2-map',
      rootNodeId: 'root',
      title: 'V2 map',
      now: '2026-07-14T00:00:00.000Z',
    })
    document.nodes.root!.markers = [{ kind: 'priority', value: '1' }]
    document.nodes.root!.style = {
      ...document.nodes.root!.style,
      fontSize: 16,
      fontWeight: 'bold',
      fontStyle: 'italic',
      shape: 'pill',
    }
    document.nodes.root!.childIds.push('child')
    document.nodes.child = createMindMapNode({
      id: 'child',
      parentId: 'root',
      text: 'Child topic',
    })
    document.relationships = [
      {
        id: 'relationship-1',
        fromNodeId: 'root',
        toNodeId: 'child',
        label: 'supports',
      },
    ]
    document.boundaries = [
      { id: 'boundary-1', nodeIds: ['root', 'child'], label: 'Scope' },
    ]
    document.summaries = [
      { id: 'summary-1', nodeIds: ['root', 'child'], label: 'Summary' },
    ]
    const serialized = serializeMindMapDocument(document)

    expect(parseMindMapDocumentJson(serialized)).toEqual(document)

    const legacyV2Document = JSON.parse(serialized) as Record<string, unknown>
    delete legacyV2Document.relationships
    delete legacyV2Document.boundaries
    delete legacyV2Document.summaries
    expect(parseMindMapDocument(legacyV2Document)).toMatchObject({
      relationships: [],
      boundaries: [],
      summaries: [],
    })
  })

  it('returns stable errors for malformed JSON, fields, tree structures and future versions', () => {
    expectFormatError(() => parseMindMapDocumentJson('{'), 'invalid-json')
    expectFormatError(
      () => parseMindMapDocument({ schemaVersion: 2 }),
      'invalid-document',
    )
    expectFormatError(
      () =>
        parseMindMapDocument({
          ...legacyV1MindMapDocumentFixture,
          schemaVersion: 3,
        }),
      'unsupported-schema-version',
    )

    for (const malformedDocument of Object.values(
      malformedMindMapImportFixtures,
    )) {
      expectFormatError(
        () => parseMindMapDocument(malformedDocument),
        'invalid-tree',
      )
    }

    expectFormatError(
      () =>
        parseMindMapDocument({
          ...legacyV1MindMapDocumentFixture,
          nodes: {
            ...legacyV1MindMapDocumentFixture.nodes,
            root: {
              ...legacyV1MindMapDocumentFixture.nodes.root,
              childIds: ['missing-child'],
            },
          },
        }),
      'invalid-tree',
    )

    const invalidExport = createMindMapDocument({
      id: 'invalid-export',
      rootNodeId: 'root',
      title: 'Invalid export',
      now: '2026-07-14T00:00:00.000Z',
    })
    invalidExport.nodes.root!.style.fontSize = -1
    expectFormatError(
      () => serializeMindMapDocument(invalidExport),
      'invalid-document',
    )
  })
})
