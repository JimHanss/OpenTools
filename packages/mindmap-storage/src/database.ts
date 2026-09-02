import Dexie, { type EntityTable } from 'dexie'

import type { MindMapDocument } from '@opentools/mindmap-core'

import type { MindMapStoredAsset } from './asset-repository'

/** Shared IndexedDB schema so map and Blob operations can use one transaction. */
export class MindMapDatabase extends Dexie {
  maps!: EntityTable<MindMapDocument, 'id'>
  assets!: EntityTable<MindMapStoredAsset, 'id'>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({ maps: 'id, updatedAt' })
    this.version(2).stores({ maps: 'id, updatedAt', assets: 'id,*mapIds' })
  }
}
