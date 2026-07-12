import Dexie, { type EntityTable } from 'dexie'

import type { MindMapDocument, MindMapId } from '@opentools/mindmap-core'

export interface MindMapRepository {
  get(id: MindMapId): Promise<MindMapDocument | undefined>
  list(): Promise<MindMapDocument[]>
  save(document: MindMapDocument): Promise<void>
  delete(id: MindMapId): Promise<void>
}

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

  get(id: MindMapId): Promise<MindMapDocument | undefined> {
    return this.#database.maps.get(id)
  }

  list(): Promise<MindMapDocument[]> {
    return this.#database.maps.orderBy('updatedAt').reverse().toArray()
  }

  async save(document: MindMapDocument): Promise<void> {
    await this.#database.maps.put(document)
  }

  async delete(id: MindMapId): Promise<void> {
    await this.#database.maps.delete(id)
  }
}
