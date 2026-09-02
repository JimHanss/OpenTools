import { mindMapCommandTypes, type MoveNodeCommand } from './commands'
import type { MindMapDocument, MindMapNodeId } from './model'

export type MindMapStructureEdit =
  'demote' | 'move-sibling-next' | 'move-sibling-previous' | 'promote'

export type MindMapStructureEditDisabledReason =
  | 'first-sibling'
  | 'last-sibling'
  | 'missing-node'
  | 'no-grandparent'
  | 'no-previous-sibling'
  | 'root-protected'

export type MindMapStructureEditResult =
  | { readonly command: MoveNodeCommand; readonly enabled: true }
  | {
      readonly disabledReason: MindMapStructureEditDisabledReason
      readonly enabled: false
    }

function disabled(
  disabledReason: MindMapStructureEditDisabledReason,
): MindMapStructureEditResult {
  return { disabledReason, enabled: false }
}

function moveCommand(
  nodeId: MindMapNodeId,
  parentId: MindMapNodeId,
  index: number,
  label: string,
): MindMapStructureEditResult {
  return {
    command: {
      type: mindMapCommandTypes.moveNode,
      label,
      payload: { nodeId, parentId, index },
    },
    enabled: true,
  }
}

/**
 * Resolves keyboard- and toolbar-friendly hierarchy edits without reading any
 * platform state. Disabled boundaries are explicit so callers do not need to
 * discover them by executing a failing command.
 */
export function buildMindMapStructureEdit(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
  edit: MindMapStructureEdit,
): MindMapStructureEditResult {
  const node = document.nodes[nodeId]
  if (!node) return disabled('missing-node')
  if (node.id === document.rootNodeId || !node.parentId) {
    return disabled('root-protected')
  }

  const parent = document.nodes[node.parentId]
  if (!parent) return disabled('missing-node')
  const sourceIndex = parent.childIds.indexOf(node.id)
  if (sourceIndex < 0) return disabled('missing-node')

  switch (edit) {
    case 'move-sibling-previous':
      return sourceIndex === 0
        ? disabled('first-sibling')
        : moveCommand(node.id, parent.id, sourceIndex - 1, 'Move topic up')
    case 'move-sibling-next':
      return sourceIndex === parent.childIds.length - 1
        ? disabled('last-sibling')
        : moveCommand(node.id, parent.id, sourceIndex + 1, 'Move topic down')
    case 'promote': {
      if (!parent.parentId) return disabled('no-grandparent')
      const grandparent = document.nodes[parent.parentId]
      if (!grandparent) return disabled('missing-node')
      const parentIndex = grandparent.childIds.indexOf(parent.id)
      if (parentIndex < 0) return disabled('missing-node')
      return moveCommand(
        node.id,
        grandparent.id,
        parentIndex + 1,
        'Promote topic',
      )
    }
    case 'demote': {
      if (sourceIndex === 0) return disabled('no-previous-sibling')
      const previousSiblingId = parent.childIds[sourceIndex - 1]
      const previousSibling = previousSiblingId
        ? document.nodes[previousSiblingId]
        : undefined
      if (!previousSibling) return disabled('missing-node')
      return moveCommand(
        node.id,
        previousSibling.id,
        previousSibling.childIds.length,
        'Demote topic',
      )
    }
  }
}
