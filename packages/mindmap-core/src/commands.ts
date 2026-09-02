import type {
  FloatingTopicPlacement,
  MindMapAssetMetadata,
  MindMapBoundary,
  MindMapCallout,
  MindMapDocument,
  MindMapEquationContentBlock,
  MindMapImageContentBlock,
  MindMapLabel,
  MindMapLink,
  MindMapNode,
  MindMapNodeMarker,
  MindMapNodeId,
  MindMapNodeStyle,
  MindMapNodeStyleOverride,
  MindMapRelationship,
  MindMapSummary,
  MindMapTheme,
  MindMapStructure,
} from './model'

export const mindMapCommandTypes = {
  renameMap: 'map.rename',
  setDefaultStructure: 'map.set-default-structure',
  updateTheme: 'map.update-theme',
  createNode: 'node.create',
  insertParent: 'node.insert-parent',
  deleteNodeKeepChildren: 'node.delete-keep-children',
  restoreDeletedNode: 'node.restore-deleted',
  updateNodeText: 'node.update-text',
  setNodeWidth: 'node.set-width',
  updateNodeStyle: 'node.update-style',
  updateNodeMarkers: 'node.update-markers',
  updateNodeNotes: 'node.update-notes',
  updateNodeLinks: 'node.update-links',
  createImageContentBlock: 'node.image.create',
  updateImageContentBlock: 'node.image.update',
  deleteImageContentBlock: 'node.image.delete',
  createEquationContentBlock: 'node.equation.create',
  updateEquationContentBlock: 'node.equation.update',
  deleteEquationContentBlock: 'node.equation.delete',
  setNodeCollapse: 'node.set-collapse',
  setNodeStructure: 'node.set-structure',
  upsertLabel: 'label.upsert',
  deleteLabel: 'label.delete',
  restoreLabel: 'label.restore',
  setNodeLabels: 'node.set-labels',
  setNodeNumbering: 'node.set-numbering',
  updateRelationships: 'map.update-relationships',
  updateBoundaries: 'map.update-boundaries',
  updateSummaries: 'map.update-summaries',
  createRelationship: 'relationship.create',
  updateRelationship: 'relationship.update',
  deleteRelationship: 'relationship.delete',
  createBoundary: 'boundary.create',
  updateBoundary: 'boundary.update',
  deleteBoundary: 'boundary.delete',
  createSummary: 'summary.create',
  updateSummary: 'summary.update',
  deleteSummary: 'summary.delete',
  createCallout: 'callout.create',
  updateCallout: 'callout.update',
  deleteCallout: 'callout.delete',
  tidyLayout: 'map.tidy-layout',
  moveNode: 'node.move',
  createFloatingTopic: 'floating-topic.create',
  setFloatingTopicPlacement: 'floating-topic.set-placement',
  convertToFloatingTopic: 'floating-topic.convert-from-tree',
  attachFloatingTopic: 'floating-topic.attach-to-tree',
  deleteSubtree: 'node.delete-subtree',
  restoreSubtree: 'node.restore-subtree',
  pasteSubtree: 'node.paste-subtree',
  batch: 'batch',
} as const

export interface RenameMapCommand {
  readonly type: typeof mindMapCommandTypes.renameMap
  readonly label: string
  readonly payload: {
    readonly title: string
  }
}

export interface SetDefaultStructureCommand {
  readonly type: typeof mindMapCommandTypes.setDefaultStructure
  readonly label: string
  readonly payload: {
    readonly structure: MindMapStructure
  }
}

export interface UpdateThemeCommand {
  readonly type: typeof mindMapCommandTypes.updateTheme
  readonly label: string
  readonly payload: {
    readonly theme: MindMapTheme
  }
}

export interface CreateNodeCommand {
  readonly type: typeof mindMapCommandTypes.createNode
  readonly label: string
  readonly payload: {
    readonly node: MindMapNode
    readonly parentId: MindMapNodeId
    /** Index after the new node has been detached from every parent. */
    readonly index: number
  }
}

export interface InsertParentNodeCommand {
  readonly type: typeof mindMapCommandTypes.insertParent
  readonly label: string
  readonly payload: {
    readonly targetNodeId: MindMapNodeId
    readonly node: MindMapNode
  }
}

export interface DeleteNodeKeepChildrenCommand {
  readonly type: typeof mindMapCommandTypes.deleteNodeKeepChildren
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
  }
}

export interface MindMapDetachedNodeSnapshot {
  readonly node: MindMapNode
  readonly relationships: readonly MindMapRelationship[]
  readonly boundaries: readonly MindMapBoundary[]
  readonly summaries: readonly MindMapSummary[]
  readonly callouts: readonly MindMapCallout[]
  readonly structureOverride?: MindMapStructure | undefined
}

export interface RestoreDeletedNodeCommand {
  readonly type: typeof mindMapCommandTypes.restoreDeletedNode
  readonly label: string
  readonly payload: {
    readonly snapshot: MindMapDetachedNodeSnapshot
    readonly parentId: MindMapNodeId
    readonly index: number
  }
}

export interface UpdateNodeTextCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeText
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly text: string
  }
}

export interface SetNodeWidthCommand {
  readonly type: typeof mindMapCommandTypes.setNodeWidth
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly width: number | null
  }
}

export interface UpdateNodeStyleCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeStyle
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly style: Partial<MindMapNodeStyle>
    readonly resetKeys?: readonly (keyof MindMapNodeStyle)[] | undefined
    /** Internal inverse path that restores the exact authored override set. */
    readonly replaceOverrides?: MindMapNodeStyleOverride | undefined
    /** Internal inverse path that restores the exact legacy materialized style. */
    readonly replaceStyle?: MindMapNodeStyle | undefined
  }
}

export interface UpdateNodeMarkersCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeMarkers
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly markers: readonly MindMapNodeMarker[]
    /** Internal inverse commands may temporarily preserve v1 marker strings. */
    readonly allowLegacyMarkers?: boolean
  }
}

export interface UpdateNodeNotesCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeNotes
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly notes: string
  }
}

export interface UpdateNodeLinksCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeLinks
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly links: readonly MindMapLink[]
  }
}

export interface CreateImageContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.createImageContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly block: MindMapImageContentBlock
    readonly asset: MindMapAssetMetadata
    readonly index?: number | undefined
  }
}

export interface UpdateImageContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.updateImageContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly blockId: string
    readonly changes: Partial<
      Pick<
        MindMapImageContentBlock,
        'width' | 'height' | 'altText' | 'preserveAspectRatio'
      >
    >
  }
}

export interface DeleteImageContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.deleteImageContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly blockId: string
  }
}

export interface CreateEquationContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.createEquationContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly block: MindMapEquationContentBlock
    readonly index?: number | undefined
  }
}

export interface UpdateEquationContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.updateEquationContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly blockId: string
    readonly changes: Partial<
      Pick<
        MindMapEquationContentBlock,
        'source' | 'displayMode' | 'width' | 'height'
      >
    >
  }
}

export interface DeleteEquationContentBlockCommand {
  readonly type: typeof mindMapCommandTypes.deleteEquationContentBlock
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly blockId: string
  }
}

export interface SetNodeCollapseCommand {
  readonly type: typeof mindMapCommandTypes.setNodeCollapse
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly collapsed: boolean
  }
}

export interface SetNodeStructureCommand {
  readonly type: typeof mindMapCommandTypes.setNodeStructure
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    /** Null removes the explicit override and resumes inherited structure. */
    readonly structure: MindMapStructure | null
  }
}

export interface UpsertLabelCommand {
  readonly type: typeof mindMapCommandTypes.upsertLabel
  readonly label: string
  readonly payload: { readonly value: MindMapLabel }
}

export interface DeletedLabelSnapshot {
  readonly label: MindMapLabel
  readonly nodeLabelIds: Readonly<Record<MindMapNodeId, readonly string[]>>
}

export interface DeleteLabelCommand {
  readonly type: typeof mindMapCommandTypes.deleteLabel
  readonly label: string
  readonly payload: { readonly labelId: string }
}

export interface RestoreLabelCommand {
  readonly type: typeof mindMapCommandTypes.restoreLabel
  readonly label: string
  readonly payload: { readonly snapshot: DeletedLabelSnapshot }
}

export interface SetNodeLabelsCommand {
  readonly type: typeof mindMapCommandTypes.setNodeLabels
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly labelIds: readonly string[]
    readonly sortMode?: 'manual' | 'alphabetical' | undefined
  }
}

export interface SetNodeNumberingCommand {
  readonly type: typeof mindMapCommandTypes.setNodeNumbering
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly numbering: MindMapNode['numbering'] | null
  }
}

/**
 * Replaces document-level relationship records atomically. The same reversible
 * command backs creation, label edits and deletion in every platform adapter.
 */
export interface UpdateRelationshipsCommand {
  readonly type: typeof mindMapCommandTypes.updateRelationships
  readonly label: string
  readonly payload: {
    readonly relationships: readonly MindMapRelationship[]
  }
}

/** Replaces layout-aware boundary records atomically. */
export interface UpdateBoundariesCommand {
  readonly type: typeof mindMapCommandTypes.updateBoundaries
  readonly label: string
  readonly payload: {
    readonly boundaries: readonly MindMapBoundary[]
  }
}

/** Replaces layout-aware summary records atomically. */
export interface UpdateSummariesCommand {
  readonly type: typeof mindMapCommandTypes.updateSummaries
  readonly label: string
  readonly payload: {
    readonly summaries: readonly MindMapSummary[]
  }
}

export interface CreateRelationshipCommand {
  readonly type: typeof mindMapCommandTypes.createRelationship
  readonly label: string
  readonly payload: { readonly relationship: MindMapRelationship }
}

export interface UpdateRelationshipCommand {
  readonly type: typeof mindMapCommandTypes.updateRelationship
  readonly label: string
  readonly payload: {
    readonly relationshipId: string
    readonly changes: {
      readonly label?: string | undefined
      readonly style?: Partial<MindMapRelationship['style']> | undefined
      /** Control points are offsets from the current endpoint midpoint. */
      readonly controlPoints?:
        readonly MindMapRelationship['controlPoints'][number][] | undefined
    }
  }
}

export interface DeleteRelationshipCommand {
  readonly type: typeof mindMapCommandTypes.deleteRelationship
  readonly label: string
  readonly payload: { readonly relationshipId: string }
}

export interface CreateBoundaryCommand {
  readonly type: typeof mindMapCommandTypes.createBoundary
  readonly label: string
  readonly payload: { readonly boundary: MindMapBoundary }
}

export interface UpdateBoundaryCommand {
  readonly type: typeof mindMapCommandTypes.updateBoundary
  readonly label: string
  readonly payload: {
    readonly boundaryId: string
    readonly changes: {
      readonly label?: string | undefined
      readonly style?: Partial<MindMapBoundary['style']> | undefined
    }
  }
}

export interface DeleteBoundaryCommand {
  readonly type: typeof mindMapCommandTypes.deleteBoundary
  readonly label: string
  readonly payload: { readonly boundaryId: string }
}

export interface CreateSummaryCommand {
  readonly type: typeof mindMapCommandTypes.createSummary
  readonly label: string
  readonly payload: { readonly summary: MindMapSummary }
}

export interface UpdateSummaryCommand {
  readonly type: typeof mindMapCommandTypes.updateSummary
  readonly label: string
  readonly payload: {
    readonly summaryId: string
    readonly changes: {
      readonly label?: string | undefined
      readonly style?: Partial<MindMapSummary['style']> | undefined
    }
  }
}

export interface DeleteSummaryCommand {
  readonly type: typeof mindMapCommandTypes.deleteSummary
  readonly label: string
  readonly payload: { readonly summaryId: string }
}

export interface CreateCalloutCommand {
  readonly type: typeof mindMapCommandTypes.createCallout
  readonly label: string
  readonly payload: { readonly callout: MindMapCallout }
}

export interface UpdateCalloutCommand {
  readonly type: typeof mindMapCommandTypes.updateCallout
  readonly label: string
  readonly payload: {
    readonly calloutId: string
    readonly changes: {
      readonly text?: string | undefined
      readonly placement?: MindMapCallout['placement'] | undefined
      readonly offset?: MindMapCallout['offset'] | undefined
      readonly style?: Partial<MindMapCallout['style']> | undefined
    }
  }
}

export interface DeleteCalloutCommand {
  readonly type: typeof mindMapCommandTypes.deleteCallout
  readonly label: string
  readonly payload: { readonly calloutId: string }
}

/** Applies an explicit, previewable sibling-order change without reparenting. */
export interface TidyLayoutCommand {
  readonly type: typeof mindMapCommandTypes.tidyLayout
  readonly label: string
  readonly payload: {
    readonly childIdsByParent: Readonly<
      Record<MindMapNodeId, readonly MindMapNodeId[]>
    >
  }
}

export interface MoveNodeCommand {
  readonly type: typeof mindMapCommandTypes.moveNode
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly parentId: MindMapNodeId
    /** Index after the moving node has been removed from its old parent. */
    readonly index: number
  }
}

export interface CreateFloatingTopicCommand {
  readonly type: typeof mindMapCommandTypes.createFloatingTopic
  readonly label: string
  readonly payload: {
    readonly node: MindMapNode
    readonly placement: FloatingTopicPlacement
  }
}

export interface SetFloatingTopicPlacementCommand {
  readonly type: typeof mindMapCommandTypes.setFloatingTopicPlacement
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly placement: FloatingTopicPlacement
  }
}

export interface ConvertToFloatingTopicCommand {
  readonly type: typeof mindMapCommandTypes.convertToFloatingTopic
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly placement: FloatingTopicPlacement
  }
}

export interface AttachFloatingTopicCommand {
  readonly type: typeof mindMapCommandTypes.attachFloatingTopic
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly parentId: MindMapNodeId
    readonly index: number
  }
}

export interface MindMapSubtreeSnapshot {
  readonly rootNodeId: MindMapNodeId
  readonly nodes: Readonly<Record<MindMapNodeId, MindMapNode>>
  readonly relationships: readonly MindMapRelationship[]
  readonly boundaries: readonly MindMapBoundary[]
  readonly summaries: readonly MindMapSummary[]
  readonly callouts: readonly MindMapCallout[]
  readonly structureOverrides: Readonly<Record<MindMapNodeId, MindMapStructure>>
}

export interface DeletedSubtree {
  readonly parentId: MindMapNodeId | null
  readonly index: number
  readonly floatingPlacement?: FloatingTopicPlacement | undefined
  readonly subtree: MindMapSubtreeSnapshot
}

export interface DeleteSubtreeCommand {
  readonly type: typeof mindMapCommandTypes.deleteSubtree
  readonly label: string
  readonly payload: {
    readonly nodeIds: readonly MindMapNodeId[]
    /** Catalog entries introduced with these roots and removable on undo. */
    readonly removeLabelIds?: readonly string[] | undefined
    readonly removeAssetIds?: readonly string[] | undefined
  }
}

export interface RestoreSubtreeCommand {
  readonly type: typeof mindMapCommandTypes.restoreSubtree
  readonly label: string
  readonly payload: {
    readonly entries: readonly DeletedSubtree[]
    readonly labels?: Readonly<Record<string, MindMapLabel>> | undefined
    readonly assets?: Readonly<Record<string, MindMapAssetMetadata>> | undefined
  }
}

export interface MindMapClipboardPayload {
  readonly version: 1
  readonly roots: readonly MindMapSubtreeSnapshot[]
  readonly labels?: Readonly<Record<string, MindMapLabel>> | undefined
  readonly assets?: Readonly<Record<string, MindMapAssetMetadata>> | undefined
}

export interface PasteSubtreeCommand {
  readonly type: typeof mindMapCommandTypes.pasteSubtree
  readonly label: string
  readonly payload: {
    readonly parentId: MindMapNodeId
    readonly index: number
    readonly clipboard: MindMapClipboardPayload
  }
}

export type SingleMindMapCommand =
  | RenameMapCommand
  | SetDefaultStructureCommand
  | UpdateThemeCommand
  | CreateNodeCommand
  | InsertParentNodeCommand
  | DeleteNodeKeepChildrenCommand
  | RestoreDeletedNodeCommand
  | UpdateNodeTextCommand
  | SetNodeWidthCommand
  | UpdateNodeStyleCommand
  | UpdateNodeMarkersCommand
  | UpdateNodeNotesCommand
  | UpdateNodeLinksCommand
  | CreateImageContentBlockCommand
  | UpdateImageContentBlockCommand
  | DeleteImageContentBlockCommand
  | CreateEquationContentBlockCommand
  | UpdateEquationContentBlockCommand
  | DeleteEquationContentBlockCommand
  | SetNodeCollapseCommand
  | SetNodeStructureCommand
  | UpsertLabelCommand
  | DeleteLabelCommand
  | RestoreLabelCommand
  | SetNodeLabelsCommand
  | SetNodeNumberingCommand
  | UpdateRelationshipsCommand
  | UpdateBoundariesCommand
  | UpdateSummariesCommand
  | CreateRelationshipCommand
  | UpdateRelationshipCommand
  | DeleteRelationshipCommand
  | CreateBoundaryCommand
  | UpdateBoundaryCommand
  | DeleteBoundaryCommand
  | CreateSummaryCommand
  | UpdateSummaryCommand
  | DeleteSummaryCommand
  | CreateCalloutCommand
  | UpdateCalloutCommand
  | DeleteCalloutCommand
  | TidyLayoutCommand
  | MoveNodeCommand
  | CreateFloatingTopicCommand
  | SetFloatingTopicPlacementCommand
  | ConvertToFloatingTopicCommand
  | AttachFloatingTopicCommand
  | DeleteSubtreeCommand
  | RestoreSubtreeCommand
  | PasteSubtreeCommand

export interface BatchMindMapCommand {
  readonly type: typeof mindMapCommandTypes.batch
  readonly label: string
  readonly payload: {
    readonly commands: readonly SingleMindMapCommand[]
  }
}

export type MindMapCommand = SingleMindMapCommand | BatchMindMapCommand

export interface CommandExecutionContext {
  readonly now: string
}

export interface CommandResult {
  readonly document: MindMapDocument
  readonly inverse: MindMapCommand
  readonly affectedNodeIds: readonly MindMapNodeId[]
}

export type MindMapCommandExecutor = (
  document: MindMapDocument,
  command: MindMapCommand,
  context: CommandExecutionContext,
) => CommandResult

export type MindMapCommandErrorCode =
  | 'empty-batch'
  | 'invalid-command'
  | 'invalid-index'
  | 'invalid-link'
  | 'invalid-content-block'
  | 'invalid-asset'
  | 'invalid-label'
  | 'invalid-marker'
  | 'invalid-numbering'
  | 'invalid-enhancement'
  | 'invalid-placement'
  | 'invalid-width'
  | 'invalid-subtree'
  | 'invalid-structure'
  | 'invalid-style'
  | 'missing-node'
  | 'missing-content-block'
  | 'no-op-move'
  | 'node-id-collision'
  | 'root-protected'
  | 'not-floating-topic'
  | 'already-floating-topic'
  | 'target-is-descendant'

export class MindMapCommandError extends Error {
  readonly code: MindMapCommandErrorCode
  readonly details: Readonly<Record<string, string>>

  constructor(
    code: MindMapCommandErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message)
    this.name = 'MindMapCommandError'
    this.code = code
    this.details = details
  }
}
