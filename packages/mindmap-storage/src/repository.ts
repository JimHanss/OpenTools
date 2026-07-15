import type { MindMapDocument, MindMapId } from '@opentools/mindmap-core'

export interface MindMapRepository {
  get(id: MindMapId): Promise<MindMapDocument | undefined>
  list(): Promise<MindMapDocument[]>
  save(document: MindMapDocument): Promise<void>
  delete(id: MindMapId): Promise<void>
}
