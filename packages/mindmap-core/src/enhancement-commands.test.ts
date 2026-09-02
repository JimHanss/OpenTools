import { describe, expect, it } from 'vitest'

import {
  assertMindMapDocument,
  CommandHistory,
  createMindMapBoundary,
  createMindMapCallout,
  createMindMapRelationship,
  createMindMapSummary,
  createV3FeatureFixture,
  executeMindMapCommand,
  mindMapCommandTypes,
} from './index'

const context = { now: '2026-07-15T04:00:00.000Z' }

describe('callout lifecycle commands', () => {
  it('creates, partially updates, deletes and restores regular and floating callouts', () => {
    let document = createV3FeatureFixture()
    const floatingCallout = createMindMapCallout({
      id: 'floating-callout',
      ownerNodeId: 'floating-root',
      text: '',
      placement: 'top',
    })
    const created = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.createCallout,
        label: 'Create callout',
        payload: { callout: floatingCallout },
      },
      context,
    )
    document = created.document
    expect(document.callouts).toHaveLength(2)
    expect(document.nodes['floating-root']?.childIds).toEqual([
      'floating-child',
    ])

    const longText = '补充说明'.repeat(300)
    const updated = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateCallout,
        label: 'Update callout',
        payload: {
          calloutId: 'floating-callout',
          changes: {
            text: longText,
            placement: 'bottom',
            offset: { x: 40, y: 12 },
            style: { backgroundColor: '#fef3c7', borderWidth: 3 },
          },
        },
      },
      context,
    )
    expect(updated.document.callouts[1]).toMatchObject({
      text: longText,
      placement: 'bottom',
      offset: { x: 40, y: 12 },
      style: { backgroundColor: '#fef3c7', borderWidth: 3 },
    })
    expect(updated.document.callouts[1]?.style.textColor).toBe(
      floatingCallout.style.textColor,
    )
    document = executeMindMapCommand(
      updated.document,
      updated.inverse,
      context,
    ).document
    expect(document.callouts[1]).toEqual(floatingCallout)

    const deleted = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteCallout,
        label: 'Delete callout',
        payload: { calloutId: 'floating-callout' },
      },
      context,
    )
    expect(deleted.document.callouts).toHaveLength(1)
    expect(
      executeMindMapCommand(deleted.document, deleted.inverse, context).document
        .callouts[1],
    ).toEqual(floatingCallout)
    expect(
      executeMindMapCommand(created.document, created.inverse, context).document
        .callouts,
    ).toHaveLength(1)
  })

  it('enforces one callout per owner and follows owner delete/restore', () => {
    const document = createV3FeatureFixture()
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.createCallout,
          label: 'Duplicate owner callout',
          payload: {
            callout: createMindMapCallout({
              id: 'duplicate-owner',
              ownerNodeId: 'wide-1',
            }),
          },
        },
        context,
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-enhancement' }))

    const deleted = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.deleteSubtree,
        label: 'Delete owner',
        payload: { nodeIds: ['wide-1'] },
      },
      context,
    )
    expect(deleted.document.callouts).toEqual([])
    const restored = executeMindMapCommand(
      deleted.document,
      deleted.inverse,
      context,
    )
    expect(restored.document.callouts[0]?.ownerNodeId).toBe('wide-1')
    assertMindMapDocument(restored.document)
  })
})

describe('typed enhancement style and geometry commands', () => {
  it('preserves relative relationship geometry through layout-independent undo/redo', () => {
    let document = createV3FeatureFixture()
    const relationship = createMindMapRelationship({
      id: 'relation',
      fromNodeId: 'wide-1',
      toNodeId: 'floating-root',
      label: 'Related',
    })
    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.createRelationship,
        label: 'Create relationship',
        payload: { relationship },
      },
      context,
    ).document

    const history = new CommandHistory()
    const changed = history.execute(
      document,
      {
        type: mindMapCommandTypes.updateRelationship,
        label: 'Shape relationship',
        payload: {
          relationshipId: 'relation',
          changes: {
            controlPoints: [{ x: 24, y: -36 }],
            style: {
              color: '#ef4444',
              width: 4,
              pattern: 'dotted',
              startMarker: 'dot',
            },
          },
        },
      },
      context,
      executeMindMapCommand,
    )
    document = changed.document
    expect(document.relationships[0]).toMatchObject({
      controlPoints: [{ x: 24, y: -36 }],
      style: {
        color: '#ef4444',
        width: 4,
        pattern: 'dotted',
        startMarker: 'dot',
        endMarker: 'arrow',
      },
    })
    document = history.undo(document, context, executeMindMapCommand)!.document
    expect(document.relationships[0]).toEqual(relationship)
    document = history.redo(document, context, executeMindMapCommand)!.document
    expect(document.relationships[0]?.controlPoints).toEqual([
      { x: 24, y: -36 },
    ])

    const safeGeometry = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateRelationship,
        label: 'Reject invalid geometry',
        payload: {
          relationshipId: 'relation',
          changes: { controlPoints: [{ x: Number.NaN, y: 0 }] },
        },
      },
      context,
    )
    expect(safeGeometry.document.relationships[0]?.controlPoints).toEqual([])
  })

  it('updates only explicit boundary and summary style fields and restores deletion', () => {
    let document = createV3FeatureFixture()
    const boundary = createMindMapBoundary({
      id: 'boundary',
      nodeIds: ['wide-1', 'wide-2'],
      label: 'Scope',
    })
    const summary = createMindMapSummary({
      id: 'summary',
      nodeIds: ['wide-1', 'wide-2'],
      label: 'Result',
    })
    document = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.batch,
        label: 'Create group enhancements',
        payload: {
          commands: [
            {
              type: mindMapCommandTypes.createBoundary,
              label: 'Create boundary',
              payload: { boundary },
            },
            {
              type: mindMapCommandTypes.createSummary,
              label: 'Create summary',
              payload: { summary },
            },
          ],
        },
      },
      context,
    ).document

    const boundaryUpdate = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateBoundary,
        label: 'Style boundary',
        payload: {
          boundaryId: 'boundary',
          changes: { style: { fillOpacity: 0.7, shape: 'cloud' } },
        },
      },
      context,
    )
    expect(boundaryUpdate.document.boundaries[0]?.style).toMatchObject({
      fillOpacity: 0.7,
      shape: 'cloud',
      borderColor: boundary.style.borderColor,
    })
    expect(
      executeMindMapCommand(
        boundaryUpdate.document,
        boundaryUpdate.inverse,
        context,
      ).document.boundaries[0],
    ).toEqual(boundary)

    const summaryUpdate = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.updateSummary,
        label: 'Style summary',
        payload: {
          summaryId: 'summary',
          changes: { label: 'Updated', style: { pattern: 'dashed', width: 5 } },
        },
      },
      context,
    )
    expect(summaryUpdate.document.summaries[0]).toMatchObject({
      label: 'Updated',
      style: { pattern: 'dashed', width: 5, color: summary.style.color },
    })
    const deleted = executeMindMapCommand(
      summaryUpdate.document,
      {
        type: mindMapCommandTypes.deleteSummary,
        label: 'Delete summary',
        payload: { summaryId: 'summary' },
      },
      context,
    )
    expect(deleted.document.summaries).toEqual([])
    expect(
      executeMindMapCommand(deleted.document, deleted.inverse, context).document
        .summaries[0],
    ).toEqual(summaryUpdate.document.summaries[0])
  })
})
