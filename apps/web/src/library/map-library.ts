import {
  assertMindMapDocument,
  cloneMindMapDocument,
  createMindMapDocument,
  executeMindMapCommand,
  getReferencedMindMapAssetIds,
  mindMapCommandTypes,
  type MindMapAssetMetadata,
  type MindMapDocument,
  type MindMapId,
  type MindMapNode,
  type MindMapNodeId,
} from '@opentools/mindmap-core'
import {
  isMindMapRepositoryWithAssets,
  type MindMapRepository,
  type MindMapStoredAsset,
} from '@opentools/mindmap-storage'

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

export type MindMapLibraryErrorCode =
  'invalid-map' | 'map-not-found' | 'missing-assets'

export interface MindMapImportAsset {
  readonly metadata: MindMapAssetMetadata
  readonly blob: Blob
}

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

function requireImportedNodeId(
  nodeIdMap: ReadonlyMap<MindMapNodeId, MindMapNodeId>,
  sourceNodeId: MindMapNodeId,
): MindMapNodeId {
  const nodeId = nodeIdMap.get(sourceNodeId)
  if (!nodeId)
    throw new Error(`Missing local topic ID for import: ${sourceNodeId}`)
  return nodeId
}

function cloneImportedNode(
  node: MindMapNode,
  nodeIdMap: ReadonlyMap<MindMapNodeId, MindMapNodeId>,
): MindMapNode {
  return {
    ...node,
    childIds: [...node.childIds],
    markers: node.markers.map((marker) => ({ ...marker })),
    links: node.links.map((link) => ({ ...link })),
    labelIds: [...node.labelIds],
    ...(node.numbering
      ? {
          numbering: {
            ...node.numbering,
            ...(node.numbering.restartAtNodeId
              ? {
                  restartAtNodeId: requireImportedNodeId(
                    nodeIdMap,
                    node.numbering.restartAtNodeId,
                  ),
                }
              : {}),
          },
        }
      : {}),
    contentBlocks: node.contentBlocks.map((block) => ({ ...block })),
    styleOverrides: { ...node.styleOverrides },
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

  #prepareImport(document: MindMapDocument): MindMapDocument {
    assertMindMapDocument(document)
    const now = this.#now()
    const nodeIdMap = new Map<MindMapNodeId, MindMapNodeId>()
    for (const nodeId of Object.keys(document.nodes)) {
      nodeIdMap.set(nodeId, this.#createId())
    }

    const rootNodeId = requireImportedNodeId(nodeIdMap, document.rootNodeId)

    const nodes = Object.fromEntries(
      Object.entries(document.nodes).map(([nodeId, node]) => {
        const id = requireImportedNodeId(nodeIdMap, nodeId)
        return [
          id,
          {
            ...cloneImportedNode(node, nodeIdMap),
            id,
            parentId: node.parentId
              ? requireImportedNodeId(nodeIdMap, node.parentId)
              : null,
            childIds: node.childIds.map((childId) =>
              requireImportedNodeId(nodeIdMap, childId),
            ),
          },
        ]
      }),
    ) as Record<MindMapNodeId, MindMapNode>
    const imported: MindMapDocument = {
      ...document,
      id: this.#createId(),
      rootNodeId,
      nodes,
      floatingTopics: Object.fromEntries(
        Object.entries(document.floatingTopics).map(([nodeId, placement]) => [
          requireImportedNodeId(nodeIdMap, nodeId),
          { ...placement },
        ]),
      ),
      structureOverrides: Object.fromEntries(
        Object.entries(document.structureOverrides).map(
          ([nodeId, structure]) => [
            requireImportedNodeId(nodeIdMap, nodeId),
            structure,
          ],
        ),
      ),
      relationships: document.relationships.map((relationship) => ({
        ...relationship,
        fromNodeId: requireImportedNodeId(nodeIdMap, relationship.fromNodeId),
        toNodeId: requireImportedNodeId(nodeIdMap, relationship.toNodeId),
        controlPoints: relationship.controlPoints.map((point) => ({
          ...point,
        })),
      })),
      boundaries: document.boundaries.map((boundary) => ({
        ...boundary,
        nodeIds: boundary.nodeIds.map((nodeId) =>
          requireImportedNodeId(nodeIdMap, nodeId),
        ),
      })),
      summaries: document.summaries.map((summary) => ({
        ...summary,
        nodeIds: summary.nodeIds.map((nodeId) =>
          requireImportedNodeId(nodeIdMap, nodeId),
        ),
      })),
      callouts: document.callouts.map((callout) => ({
        ...callout,
        ownerNodeId: requireImportedNodeId(nodeIdMap, callout.ownerNodeId),
        offset: { ...callout.offset },
        style: { ...callout.style },
      })),
      createdAt: now,
      updatedAt: now,
    }

    assertMindMapDocument(imported)
    return imported
  }

  /** Saves a parsed external map as a separate map with fresh local IDs. */
  async import(document: MindMapDocument): Promise<MindMapDocument> {
    if (getReferencedMindMapAssetIds(document).size > 0) {
      throw new MindMapLibraryError(
        'missing-assets',
        'A document with images must be imported from a complete bundle.',
      )
    }
    const imported = this.#prepareImport(document)
    await this.#repository.save(imported)
    return imported
  }

  /** Validates and atomically imports a document together with its Blob assets. */
  async importWithAssets(
    document: MindMapDocument,
    assets: readonly MindMapImportAsset[],
  ): Promise<MindMapDocument> {
    if (!isMindMapRepositoryWithAssets(this.#repository)) {
      throw new MindMapLibraryError(
        'missing-assets',
        'The active storage adapter cannot import image assets.',
      )
    }
    const referencedAssetIds = getReferencedMindMapAssetIds(document)
    const assetsById = new Map(
      assets.map((asset) => [asset.metadata.id, asset] as const),
    )
    if (
      assetsById.size !== assets.length ||
      assetsById.size !== referencedAssetIds.size ||
      [...referencedAssetIds].some((assetId) => !assetsById.has(assetId))
    ) {
      throw new MindMapLibraryError(
        'missing-assets',
        'Every referenced image must be present exactly once.',
      )
    }

    const imported = this.#prepareImport(document)
    const storedAssets: MindMapStoredAsset[] = [...assetsById.values()].map(
      (asset) => ({
        id: asset.metadata.id,
        mapIds: [imported.id],
        metadata: { ...asset.metadata },
        blob: asset.blob,
      }),
    )
    await this.#repository.saveWithAssets(imported, storedAssets)
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

    const referencedAssetIds = getReferencedMindMapAssetIds(sourceDocument)
    if (referencedAssetIds.size === 0) {
      await this.#repository.save(document)
      return document
    }
    if (!isMindMapRepositoryWithAssets(this.#repository)) {
      throw new MindMapLibraryError(
        'missing-assets',
        'The active storage adapter cannot duplicate image assets.',
      )
    }
    const sourceAssets = await this.#repository.assetRepository.listByMap(id)
    const assetsById = new Map(sourceAssets.map((asset) => [asset.id, asset]))
    if ([...referencedAssetIds].some((assetId) => !assetsById.has(assetId))) {
      throw new MindMapLibraryError(
        'missing-assets',
        'A referenced image is missing from local storage.',
      )
    }
    await this.#repository.saveWithAssets(
      document,
      [...referencedAssetIds].map((assetId) => ({
        ...assetsById.get(assetId)!,
        mapIds: [document.id],
      })),
    )
    return document
  }

  async delete(id: MindMapId): Promise<void> {
    await this.open(id)
    await this.#repository.delete(id)
  }
}
