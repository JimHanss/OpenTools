import Dexie, { type EntityTable } from 'dexie'

import {
  cloneMindMapDocument,
  type MindMapDocument,
  type MindMapId,
} from '@opentools/mindmap-core'

import { toMindMapRepositoryError } from './errors'
import type { MindMapRepository } from './repository'

class MindMapDatabase extends Dexie {
  maps!: EntityTable<MindMapDocument, 'id'>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({ maps: 'id, updatedAt' })
  }
}

export class DexieMindMapRepository implements MindMapRepository {
  readonly #database: MindMapDatabase

  constructor(databaseName = 'opentools-mindmaps') {
    this.#database = new MindMapDatabase(databaseName)
  }

  async get(id: MindMapId): Promise<MindMapDocument | undefined> {
    try {
      const document = await this.#database.maps.get(id)
      return document ? cloneMindMapDocument(document) : undefined
    } catch (error) {
      throw toMindMapRepositoryError(error, 'read-failed')
    }
  }

  async list(): Promise<MindMapDocument[]> {
    try {
      const documents = await this.#database.maps
        .orderBy('updatedAt')
        .reverse()
        .toArray()
      return documents.map(cloneMindMapDocument)
    } catch (error) {
      throw toMindMapRepositoryError(error, 'read-failed')
    }
  }

  async save(document: MindMapDocument): Promise<void> {
    try {
      await this.#database.maps.put(cloneMindMapDocument(document))
    } catch (error) {
      throw toMindMapRepositoryError(error, 'write-failed')
    }
  }

  async delete(id: MindMapId): Promise<void> {
    try {
      await this.#database.maps.delete(id)
    } catch (error) {
      throw toMindMapRepositoryError(error, 'delete-failed')
    }
  }
}
