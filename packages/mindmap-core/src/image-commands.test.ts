import { describe, expect, it } from 'vitest'

import {
  CommandHistory,
  createMindMapDocument,
  executeMindMapCommand,
  mindMapCommandTypes,
  type MindMapAssetMetadata,
  type MindMapImageContentBlock,
} from './index'

const context = { now: '2026-07-15T05:00:00.000Z' }
const asset: MindMapAssetMetadata = {
  id: `asset-${'a'.repeat(64)}`,
  kind: 'image',
  mimeType: 'image/png',
  byteSize: 120,
  checksum: `sha256:${'a'.repeat(64)}`,
  intrinsicWidth: 400,
  intrinsicHeight: 200,
  createdAt: context.now,
}
const block: MindMapImageContentBlock = {
  id: 'image-block',
  type: 'image',
  assetId: asset.id,
  width: 240,
  height: 120,
  altText: 'Architecture diagram',
  preserveAspectRatio: true,
}

function createDocument() {
  return createMindMapDocument({
    id: 'image-map',
    rootNodeId: 'root',
    title: 'Image map',
    now: context.now,
  })
}

describe('image content block commands', () => {
  it('creates, partially updates, restores ratio, deletes and restores', () => {
    const created = executeMindMapCommand(
      createDocument(),
      {
        type: mindMapCommandTypes.createImageContentBlock,
        label: 'Add image',
        payload: { nodeId: 'root', block, asset },
      },
      context,
    )
    expect(created.document.assets[asset.id]).toEqual(asset)
    expect(created.document.nodes.root?.contentBlocks).toEqual([block])

    const updated = executeMindMapCommand(
      created.document,
      {
        type: mindMapCommandTypes.updateImageContentBlock,
        label: 'Resize image',
        payload: {
          nodeId: 'root',
          blockId: block.id,
          changes: {
            width: 300,
            height: 150,
            altText: 'Updated description',
          },
        },
      },
      context,
    )
    expect(updated.document.nodes.root?.contentBlocks[0]).toMatchObject({
      width: 300,
      height: 150,
      altText: 'Updated description',
      preserveAspectRatio: true,
    })
    expect(
      executeMindMapCommand(updated.document, updated.inverse, context).document
        .nodes.root?.contentBlocks[0],
    ).toEqual(block)

    const deleted = executeMindMapCommand(
      updated.document,
      {
        type: mindMapCommandTypes.deleteImageContentBlock,
        label: 'Delete image',
        payload: { nodeId: 'root', blockId: block.id },
      },
      context,
    )
    expect(deleted.document.nodes.root?.contentBlocks).toEqual([])
    expect(deleted.document.assets[asset.id]).toEqual(asset)
    expect(
      executeMindMapCommand(deleted.document, deleted.inverse, context).document
        .nodes.root?.contentBlocks[0],
    ).toMatchObject({ width: 300, height: 150 })
  })

  it('keeps binary data out of commands and history while undo/redo stays exact', () => {
    const history = new CommandHistory()
    const command = {
      type: mindMapCommandTypes.createImageContentBlock,
      label: 'Add image',
      payload: { nodeId: 'root', block, asset },
    } as const
    const created = history.execute(
      createDocument(),
      command,
      context,
      executeMindMapCommand,
    )
    expect(JSON.stringify(command)).not.toContain('data:image')
    expect(JSON.stringify(command)).not.toContain('Blob')

    const undone = history.undo(
      created.document,
      context,
      executeMindMapCommand,
    )
    expect(undone?.document.nodes.root?.contentBlocks).toEqual([])
    const redone = history.redo(
      undone!.document,
      context,
      executeMindMapCommand,
    )
    expect(redone?.document.nodes.root?.contentBlocks).toEqual([block])
  })

  it('leaves the source document unchanged when a command is rejected', () => {
    const document = createDocument()
    expect(() =>
      executeMindMapCommand(
        document,
        {
          type: mindMapCommandTypes.createImageContentBlock,
          label: 'Add invalid image',
          payload: {
            nodeId: 'root',
            block: { ...block, width: 0 },
            asset,
          },
        },
        context,
      ),
    ).toThrowError('The image content block is invalid.')
    expect(document.nodes.root?.contentBlocks).toEqual([])
    expect(document.assets).toEqual({})
  })
})
