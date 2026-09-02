import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  createMindMapBoundary,
  createMindMapCallout,
  createMindMapDocument,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  createV3FeatureFixture,
  getMindMapThemePreset,
} from '@opentools/mindmap-core'

import {
  MindMapFormatError,
  parseMindMapDocument,
  parseMindMapDocumentJson,
  serializeMindMapDocument,
} from './index'
import {
  legacyV1MindMapDocumentFixture,
  legacyV2MindMapDocumentFixture,
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

function cloneFixture<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value
}

describe('mind map document format', () => {
  it('migrates v1 documents to normalized v3 without losing IDs or markers', () => {
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

    expect(document.schemaVersion).toBe(3)
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

  it('round-trips a valid v3 document through validated serialization', () => {
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
      fixedWidth: 240,
    }
    document.nodes.root!.styleOverrides = {
      fontSize: 16,
      fontWeight: 'bold',
      fontStyle: 'italic',
      shape: 'pill',
      fixedWidth: 240,
    }
    document.theme = getMindMapThemePreset('sunset')!
    document.nodes.root!.childIds.push('child')
    document.nodes.child = createMindMapNode({
      id: 'child',
      parentId: 'root',
      text: 'Child topic',
    })
    document.relationships = [
      createMindMapRelationship({
        id: 'relationship-1',
        fromNodeId: 'root',
        toNodeId: 'child',
        label: 'supports',
        controlPoints: [{ x: 24, y: -32 }],
        style: {
          color: '#ef4444',
          width: 4,
          pattern: 'dotted',
          startMarker: 'dot',
        },
      }),
    ]
    document.boundaries = [
      createMindMapBoundary({
        id: 'boundary-1',
        nodeIds: ['root', 'child'],
        label: 'Scope',
        style: { shape: 'cloud', fillOpacity: 0.65 },
      }),
    ]
    document.summaries = [
      createMindMapSummary({
        id: 'summary-1',
        nodeIds: ['root', 'child'],
        label: 'Summary',
        style: { shape: 'line', width: 3, pattern: 'dashed' },
      }),
    ]
    document.callouts = [
      createMindMapCallout({
        id: 'callout-1',
        ownerNodeId: 'child',
        text: 'More detail',
        placement: 'bottom',
        offset: { x: 18, y: 8 },
        style: { shape: 'pill', backgroundColor: '#fef3c7' },
      }),
    ]
    const serialized = serializeMindMapDocument(document)

    expect(parseMindMapDocumentJson(serialized)).toEqual(document)
    expect(
      parseMindMapDocumentJson(serialized).nodes.root?.style.fixedWidth,
    ).toBe(240)
    expect(
      parseMindMapDocumentJson(serialized).nodes.root?.styleOverrides,
    ).toEqual(document.nodes.root!.styleOverrides)
    expect(parseMindMapDocumentJson(serialized).theme).toEqual(document.theme)
    expect(parseMindMapDocumentJson(serialized)).toMatchObject({
      relationships: [
        { controlPoints: [{ x: 24, y: -32 }], style: { pattern: 'dotted' } },
      ],
      boundaries: [{ style: { shape: 'cloud', fillOpacity: 0.65 } }],
      summaries: [{ style: { shape: 'line', width: 3 } }],
      callouts: [{ placement: 'bottom', style: { shape: 'pill' } }],
    })

    const invalidWidth = cloneFixture(document)
    invalidWidth.nodes.root!.style.fixedWidth = 79
    expectFormatError(
      () => parseMindMapDocument(invalidWidth),
      'invalid-document',
    )

    const migratedV2Document = parseMindMapDocument(
      legacyV2MindMapDocumentFixture,
    )
    expect(migratedV2Document).toMatchObject({
      schemaVersion: 3,
      floatingTopics: {},
      defaultStructure: 'logic-right',
    })
    expect(migratedV2Document.relationships).toHaveLength(1)
    expect(migratedV2Document.boundaries).toHaveLength(1)
    expect(migratedV2Document.summaries).toHaveLength(1)
    expect(migratedV2Document.nodes.root?.style.fontSize).toBe(18)

    const minimalLegacyV2 = JSON.parse(
      JSON.stringify(legacyV2MindMapDocumentFixture),
    ) as Record<string, unknown>
    delete minimalLegacyV2.relationships
    delete minimalLegacyV2.boundaries
    delete minimalLegacyV2.summaries
    expect(parseMindMapDocument(minimalLegacyV2)).toMatchObject({
      schemaVersion: 3,
      relationships: [],
      boundaries: [],
      summaries: [],
    })
  })

  it('round-trips the complete v3 forest and rejects invalid ownership or references', () => {
    const document = createV3FeatureFixture()
    const serialized = serializeMindMapDocument(document)
    const parsed = parseMindMapDocumentJson(serialized)

    expect(parsed).toEqual(document)
    expect(assertMindMapDocument(parsed)).toBe(parsed)

    const unregisteredRoot = cloneFixture(document)
    delete unregisteredRoot.floatingTopics['floating-root']
    expectFormatError(
      () => parseMindMapDocument(unregisteredRoot),
      'invalid-tree',
    )

    const missingAsset = cloneFixture(document)
    const imageBlock = missingAsset.nodes['wide-1']?.contentBlocks.find(
      (block) => block.type === 'image',
    )
    if (!imageBlock || imageBlock.type !== 'image') {
      throw new Error('Missing image fixture block')
    }
    imageBlock.assetId = 'missing-asset'
    expectFormatError(() => parseMindMapDocument(missingAsset), 'invalid-tree')

    const duplicateCallout = cloneFixture(document)
    duplicateCallout.callouts.push({
      ...duplicateCallout.callouts[0]!,
      id: 'callout-duplicate',
    })
    expectFormatError(
      () => parseMindMapDocument(duplicateCallout),
      'invalid-tree',
    )

    const unknownStructure = JSON.parse(serialized) as Record<string, unknown>
    unknownStructure.defaultStructure = 'future-structure'
    expectFormatError(
      () => parseMindMapDocument(unknownStructure),
      'invalid-document',
    )

    const unknownField = JSON.parse(serialized) as Record<string, unknown>
    unknownField.futureField = true
    expectFormatError(
      () => parseMindMapDocument(unknownField),
      'invalid-document',
    )
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
          schemaVersion: 4,
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
