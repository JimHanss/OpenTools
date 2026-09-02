import { editorActionIds, type EditorActionId } from './action-registry'

export interface EditorKeyboardEventLike {
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly isComposing: boolean
  readonly key: string
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

export function getEditorKeyboardShortcut(
  event: EditorKeyboardEventLike,
  isEditingText: boolean,
): EditorActionId | undefined {
  if (event.isComposing || isEditingText) return undefined

  const usesPrimaryModifier = event.metaKey || event.ctrlKey
  if (usesPrimaryModifier && !event.altKey) {
    switch (event.key.toLowerCase()) {
      case 'a':
        return editorActionIds.selectAll
      case 'c':
        return editorActionIds.copy
      case 'd':
        return editorActionIds.duplicate
      case 'v':
        return editorActionIds.paste
      case 'x':
        return editorActionIds.cut
      case 'y':
        return editorActionIds.redo
      case 'z':
        return event.shiftKey ? editorActionIds.redo : editorActionIds.undo
    }
  }

  if (event.altKey && !usesPrimaryModifier && !event.shiftKey) {
    switch (event.key) {
      case 'ArrowUp':
        return editorActionIds.movePrevious
      case 'ArrowDown':
        return editorActionIds.moveNext
      case 'ArrowLeft':
        return editorActionIds.promote
      case 'ArrowRight':
        return editorActionIds.demote
    }
  }

  if (usesPrimaryModifier || event.altKey) return undefined

  switch (event.key) {
    case 'F2':
      return editorActionIds.edit
    case 'Enter':
      return editorActionIds.createSibling
    case 'Tab':
      return editorActionIds.createChild
    case 'Backspace':
    case 'Delete':
      return editorActionIds.delete
    default:
      return undefined
  }
}
