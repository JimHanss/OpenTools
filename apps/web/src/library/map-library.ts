import {
  assertMindMapDocument,
  cloneMindMapDocument,
  createMindMapDocument,
  executeMindMapCommand,
  mindMapCommandTypes,
  type MindMapDocument,
  type MindMapId,
  type MindMapNode,
  type MindMapNodeId,
} from '@opentools/mindmap-core'
import type { MindMapRepository } from '@opentools/mindmap-storage'

const untitledMindMap = 'Untitled mind map'
const starterMindMap = 'My first mind map'

export interface MindMapSummary {
  readonly id: MindMapId
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MindMapLibraryOptions {
  readonly createId?: () => string
  readonly duplicateTitle?: (title: string) => string
  readonly now?: () => string
  readonly starterTitle?: () => string
  readonly untitledTitle?: () => string
}

export type MindMapLibraryErrorCode = 'invalid-map' | 'map-not-found'

export class MindMapLibraryError extends Error {
  readonly code: MindMapLibraryErrorCode
  readonly cause: unknown

  constructor(
    code: MindMapLibraryErrorCode,
    message: string,
    cause: unknown = undefined,
  ) {
    super(message)
    this.name = 'MindMapLibraryError'
    this.code = code
    this.cause = cause
  }
}

function createDefaultId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `mindmap-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function normalizeTitle(title: string, fallbackTitle: string): string {
  return title.trim().length === 0 ? fallbackTitle : title
}

function sortDocuments(
  documents: readonly MindMapDocument[],
): MindMapDocument[] {
  return [...documents].sort((left, right) => {
    const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
    return updatedOrder === 0 ? left.id.localeCompare(right.id) : updatedOrder
  })
}

function isValidDocument(document: MindMapDocument): boolean {
  try {
    assertMindMapDocument(document)
    return true
  } catch {
    return false
  }
}

function cloneImportedNode(node: MindMapNode): MindMapNode {
  return {
    ...node,
    childIds: [...node.childIds],
    markers: node.markers.map((marker) => ({ ...marker })),
    links: node.links.map((link) => ({ ...link })),
    style: { ...node.style },
  }
}

export function toMindMapSummary(document: MindMapDocument): MindMapSummary {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

/**
 * Owns repository-backed map lifecycle operations. Editor commands and UI-only
 * state intentionally remain outside this service.
 */
export class MindMapLibraryService {
  readonly #createId: () => string
  readonly #duplicateTitle: (title: string) => string
  readonly #now: () => string
  readonly #repository: MindMapRepository
  readonly #starterTitle: () => string
  readonly #untitledTitle: () => string
  #hydrationPromise: Promise<MindMapDocument[]> | null = null

  constructor(
    repository: MindMapRepository,
    options: MindMapLibraryOptions = {},
  ) {
    this.#repository = repository
    this.#createId = options.createId ?? createDefaultId
    this.#duplicateTitle =
      options.duplicateTitle ?? ((title) => `${title} copy`)
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#starterTitle = options.starterTitle ?? (() => starterMindMap)
    this.#untitledTitle = options.untitledTitle ?? (() => untitledMindMap)
  }

  async hydrate(): Promise<MindMapDocument[]> {
    if (this.#hydrationPromise) return this.#hydrationPromise

    this.#hydrationPromise = this.#hydrateOnce()
    try {
      return await this.#hydrationPromise
    } finally {
      this.#hydrationPromise = null
    }
  }

  async #hydrateOnce(): Promise<MindMapDocument[]> {
    const documents = (await this.#repository.list()).filter(isValidDocument)
    if (documents.length > 0) return sortDocuments(documents)

    const starterDocument = await this.create(this.#starterTitle())
    return [starterDocument]
  }

  async list(): Promise<MindMapDocument[]> {
    return sortDocuments(
      (await this.#repository.list()).filter(isValidDocument),
    )
  }

  async create(title = this.#untitledTitle()): Promise<MindMapDocument> {
    const now = this.#now()
    const document = createMindMapDocument({
      id: this.#createId(),
      rootNodeId: this.#createId(),
      title: normalizeTitle(title, this.#untitledTitle()),
      now,
    })

    await this.#repository.save(document)
    return document
  }

  /** Saves a parsed external map as a separate map with fresh local IDs. */
  async import(document: MindMapDocument): Promise<MindMapDocument> {
    assertMindMapDocument(document)
    const now = this.#now()
    const nodeIdMap = new Map<MindMapNodeId, MindMapNodeId>()
    for (const nodeId of Object.keys(document.nodes)) {
      nodeIdMap.set(nodeId, this.#createId())
    }

    const rootNodeId = nodeIdMap.get(document.rootNodeId)
    if (!rootNodeId) {
      throw new MindMapLibraryError(
        'invalid-map',
        'The imported map is missing its root topic.',
      )
    }

    const nodes = Object.fromEntries(
      Object.entries(document.nodes).map(([nodeId, node]) => {
        const id = nodeIdMap.get(nodeId)
        if (!id) throw new Error(`Missing local topic ID for import: ${nodeId}`)
        return [
          id,
          {
            ...cloneImportedNode(node),
            id,
            parentId: node.parentId
              ? (nodeIdMap.get(node.parentId) ?? null)
              : null,
            childIds: node.childIds.map((childId) => {
              const child = nodeIdMap.get(childId)
              if (!child)
                throw new Error(`Missing local child ID for import: ${childId}`)
              return child
            }),
          },
        ]
      }),
    ) as Record<MindMapNodeId, MindMapNode>
    const imported: MindMapDocument = {
      ...document,
      id: this.#createId(),
      rootNodeId,
      nodes,
      relationships: document.relationships.map((relationship) => ({
        ...relationship,
        fromNodeId:
          nodeIdMap.get(relationship.fromNodeId) ?? relationship.fromNodeId,
        toNodeId: nodeIdMap.get(relationship.toNodeId) ?? relationship.toNodeId,
      })),
      boundaries: document.boundaries.map((boundary) => ({
        ...boundary,
        nodeIds: boundary.nodeIds.map(
          (nodeId) => nodeIdMap.get(nodeId) ?? nodeId,
        ),
      })),
      summaries: document.summaries.map((summary) => ({
        ...summary,
        nodeIds: summary.nodeIds.map(
          (nodeId) => nodeIdMap.get(nodeId) ?? nodeId,
        ),
      })),
      createdAt: now,
      updatedAt: now,
    }

    assertMindMapDocument(imported)
    await this.#repository.save(imported)
    return imported
  }

  async open(id: MindMapId): Promise<MindMapDocument> {
    const document = await this.#repository.get(id)
    if (!document) {
      throw new MindMapLibraryError(
        'map-not-found',
        'The requested mind map no longer exists.',
      )
    }
    if (!isValidDocument(document)) {
      throw new MindMapLibraryError(
        'invalid-map',
        'The requested mind map is invalid and cannot be opened.',
      )
    }

    return document
  }

  async rename(id: MindMapId, title: string): Promise<MindMapDocument> {
    const document = await this.open(id)
    const result = executeMindMapCommand(
      document,
      {
        type: mindMapCommandTypes.renameMap,
        label: 'Rename mind map',
        payload: { title: normalizeTitle(title, this.#untitledTitle()) },
      },
      { now: this.#now() },
    )

    await this.#repository.save(result.document)
    return result.document
  }

  async duplicate(id: MindMapId): Promise<MindMapDocument> {
    const sourceDocument = await this.open(id)
    const now = this.#now()
    const duplicate = cloneMindMapDocument(sourceDocument)
    const document: MindMapDocument = {
      ...duplicate,
      id: this.#createId(),
      title: this.#duplicateTitle(sourceDocument.title),
      createdAt: now,
      updatedAt: now,
    }

    await this.#repository.save(document)
    return document
  }

  async delete(id: MindMapId): Promise<void> {
    await this.open(id)
    await this.#repository.delete(id)
  }
}
