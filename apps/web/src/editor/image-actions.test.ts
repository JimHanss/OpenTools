import { describe, expect, it } from 'vitest'

import {
  createMindMapDocument,
  executeMindMapCommand,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import {
  MemoryMindMapAssetRepository,
  MindMapAssetRepositoryError,
} from '@opentools/mindmap-storage'

import { insertBrowserImage } from './image-actions'

const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
  type: 'image/png',
})

function createDocument(): MindMapDocument {
  return createMindMapDocument({
    id: 'image-actions',
    rootNodeId: 'root',
    title: 'Image actions',
    now: '2026-07-15T00:00:00.000Z',
  })
}

describe('browser image insertion transaction', () => {
  it('writes the Blob before applying the reversible document command', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const document = createDocument()
    const order: string[] = []
    const result = await insertBrowserImage({
      document,
      nodeId: 'root',
      source: png,
      repository: {
        ...repository,
        get: repository.get.bind(repository),
        put: async (asset) => {
          order.push('put')
          await repository.put(asset)
        },
        listByMap: repository.listByMap.bind(repository),
        delete: repository.delete.bind(repository),
        release: repository.release.bind(repository),
        deleteByMap: repository.deleteByMap.bind(repository),
      },
      execute: (command) => {
        order.push('command')
        return executeMindMapCommand(document, command, {
          now: '2026-07-15T00:00:01.000Z',
        })
      },
      createId: () => 'image-block',
      decodeDimensions: async () => ({ width: 640, height: 320 }),
    })

    expect(order).toEqual(['put', 'command'])
    expect(result.document.nodes.root?.contentBlocks[0]).toMatchObject({
      width: 360,
      height: 180,
    })
    expect(await repository.listByMap(document.id)).toHaveLength(1)
  })

  it('releases a newly owned Blob when the command fails', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const document = createDocument()
    await expect(
      insertBrowserImage({
        document,
        nodeId: 'missing',
        source: png,
        repository,
        execute: (command) =>
          executeMindMapCommand(document, command, {
            now: '2026-07-15T00:00:01.000Z',
          }),
        createId: () => 'image-block',
        decodeDimensions: async () => ({ width: 640, height: 320 }),
      }),
    ).rejects.toThrow()
    expect(await repository.listByMap(document.id)).toEqual([])
    expect(document.nodes.root?.contentBlocks).toEqual([])
  })

  it('preserves the editable document when quota prevents the Blob transaction', async () => {
    const repository = new MemoryMindMapAssetRepository()
    const document = createDocument()
    let commandExecuted = false

    await expect(
      insertBrowserImage({
        document,
        nodeId: 'root',
        source: png,
        repository: {
          get: repository.get.bind(repository),
          put: async () => {
            throw new MindMapAssetRepositoryError(
              'quota-exceeded',
              'Simulated quota exhaustion',
            )
          },
          listByMap: repository.listByMap.bind(repository),
          delete: repository.delete.bind(repository),
          release: repository.release.bind(repository),
          deleteByMap: repository.deleteByMap.bind(repository),
        },
        execute: () => {
          commandExecuted = true
          throw new Error('Document command must not run')
        },
        createId: () => 'image-block',
        decodeDimensions: async () => ({ width: 640, height: 320 }),
      }),
    ).rejects.toMatchObject({ code: 'quota-exceeded' })

    expect(commandExecuted).toBe(false)
    expect(document.nodes.root?.contentBlocks).toEqual([])
    expect(await repository.listByMap(document.id)).toEqual([])
  })
})
