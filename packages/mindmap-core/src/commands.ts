import type {
  MindMapBoundary,
  MindMapDocument,
  MindMapLink,
  MindMapNode,
  MindMapNodeMarker,
  MindMapNodeId,
  MindMapNodeStyle,
  MindMapRelationship,
  MindMapSummary,
} from './model'

export const mindMapCommandTypes = {
  renameMap: 'map.rename',
  createNode: 'node.create',
  updateNodeText: 'node.update-text',
  updateNodeStyle: 'node.update-style',
  updateNodeMarkers: 'node.update-markers',
  updateNodeNotes: 'node.update-notes',
  updateNodeLinks: 'node.update-links',
  setNodeCollapse: 'node.set-collapse',
  updateRelationships: 'map.update-relationships',
  updateBoundaries: 'map.update-boundaries',
  updateSummaries: 'map.update-summaries',
  tidyLayout: 'map.tidy-layout',
  moveNode: 'node.move',
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

export interface UpdateNodeTextCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeText
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly text: string
  }
}

export interface UpdateNodeStyleCommand {
  readonly type: typeof mindMapCommandTypes.updateNodeStyle
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly style: Partial<MindMapNodeStyle>
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

export interface SetNodeCollapseCommand {
  readonly type: typeof mindMapCommandTypes.setNodeCollapse
  readonly label: string
  readonly payload: {
    readonly nodeId: MindMapNodeId
    readonly collapsed: boolean
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

export interface MindMapSubtreeSnapshot {
  readonly rootNodeId: MindMapNodeId
  readonly nodes: Readonly<Record<MindMapNodeId, MindMapNode>>
}

export interface DeletedSubtree {
  readonly parentId: MindMapNodeId
  readonly index: number
  readonly subtree: MindMapSubtreeSnapshot
}

export interface DeleteSubtreeCommand {
  readonly type: typeof mindMapCommandTypes.deleteSubtree
  readonly label: string
  readonly payload: {
    readonly nodeIds: readonly MindMapNodeId[]
  }
}

export interface RestoreSubtreeCommand {
  readonly type: typeof mindMapCommandTypes.restoreSubtree
  readonly label: string
  readonly payload: {
    readonly entries: readonly DeletedSubtree[]
  }
}

export interface MindMapClipboardPayload {
  readonly version: 1
  readonly roots: readonly MindMapSubtreeSnapshot[]
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
  | CreateNodeCommand
  | UpdateNodeTextCommand
  | UpdateNodeStyleCommand
  | UpdateNodeMarkersCommand
  | UpdateNodeNotesCommand
  | UpdateNodeLinksCommand
  | SetNodeCollapseCommand
  | UpdateRelationshipsCommand
  | UpdateBoundariesCommand
  | UpdateSummariesCommand
  | TidyLayoutCommand
  | MoveNodeCommand
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
  | 'invalid-marker'
  | 'invalid-enhancement'
  | 'invalid-subtree'
  | 'missing-node'
  | 'no-op-move'
  | 'node-id-collision'
  | 'root-protected'
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
