import {
  cloneMindMapDocument,
  type MindMapDocument,
  type MindMapId,
} from '@opentools/mindmap-core'

import type { MindMapRepository } from './repository'

/** A deterministic repository for tests and non-persistent fallback scenarios. */
export class MemoryMindMapRepository implements MindMapRepository {
  readonly #documents = new Map<MindMapId, MindMapDocument>()

  async get(id: MindMapId): Promise<MindMapDocument | undefined> {
    const document = this.#documents.get(id)
    return document ? cloneMindMapDocument(document) : undefined
  }

  async list(): Promise<MindMapDocument[]> {
    return [...this.#documents.values()]
      .sort((left, right) => {
        const timestampOrder = right.updatedAt.localeCompare(left.updatedAt)
        return timestampOrder === 0
          ? left.id.localeCompare(right.id)
          : timestampOrder
      })
      .map(cloneMindMapDocument)
  }

  async save(document: MindMapDocument): Promise<void> {
    this.#documents.set(document.id, cloneMindMapDocument(document))
  }

  async delete(id: MindMapId): Promise<void> {
    this.#documents.delete(id)
  }
}
