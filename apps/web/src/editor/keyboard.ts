export type EditorKeyboardShortcut =
  | 'copy'
  | 'create-child'
  | 'create-sibling'
  | 'cut'
  | 'delete'
  | 'duplicate'
  | 'paste'
  | 'redo'
  | 'select-all'
  | 'undo'

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
): EditorKeyboardShortcut | undefined {
  if (event.isComposing || isEditingText) return undefined

  const usesPrimaryModifier = event.metaKey || event.ctrlKey
  if (usesPrimaryModifier && !event.altKey) {
    switch (event.key.toLowerCase()) {
      case 'a':
        return 'select-all'
      case 'c':
        return 'copy'
      case 'd':
        return 'duplicate'
      case 'v':
        return 'paste'
      case 'x':
        return 'cut'
      case 'y':
        return 'redo'
      case 'z':
        return event.shiftKey ? 'redo' : 'undo'
    }
  }

  if (usesPrimaryModifier || event.altKey) return undefined

  switch (event.key) {
    case 'Enter':
      return 'create-sibling'
    case 'Tab':
      return 'create-child'
    case 'Backspace':
    case 'Delete':
      return 'delete'
    default:
      return undefined
  }
}
