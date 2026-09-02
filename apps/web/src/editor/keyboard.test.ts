import { describe, expect, it } from 'vitest'

import { getEditorKeyboardShortcut } from './keyboard'
import { editorActionIds } from './action-registry'

function keyEvent(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe('editor keyboard shortcuts', () => {
  it('maps structural and platform-primary shortcuts outside text editing', () => {
    expect(getEditorKeyboardShortcut(keyEvent('Enter'), false)).toBe(
      editorActionIds.createSibling,
    )
    expect(getEditorKeyboardShortcut(keyEvent('Tab'), false)).toBe(
      editorActionIds.createChild,
    )
    expect(getEditorKeyboardShortcut(keyEvent('Delete'), false)).toBe(
      editorActionIds.delete,
    )
    expect(getEditorKeyboardShortcut(keyEvent('F2'), false)).toBe(
      editorActionIds.edit,
    )
    expect(
      getEditorKeyboardShortcut(keyEvent('ArrowUp', { altKey: true }), false),
    ).toBe(editorActionIds.movePrevious)
    expect(
      getEditorKeyboardShortcut(keyEvent('ArrowDown', { altKey: true }), false),
    ).toBe(editorActionIds.moveNext)
    expect(
      getEditorKeyboardShortcut(keyEvent('ArrowLeft', { altKey: true }), false),
    ).toBe(editorActionIds.promote)
    expect(
      getEditorKeyboardShortcut(
        keyEvent('ArrowRight', { altKey: true }),
        false,
      ),
    ).toBe(editorActionIds.demote)
    expect(
      getEditorKeyboardShortcut(keyEvent('z', { ctrlKey: true }), false),
    ).toBe(editorActionIds.undo)
    expect(
      getEditorKeyboardShortcut(
        keyEvent('z', { metaKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(editorActionIds.redo)
    expect(
      getEditorKeyboardShortcut(keyEvent('c', { ctrlKey: true }), false),
    ).toBe(editorActionIds.copy)
  })

  it('suppresses global commands during composition and editable text entry', () => {
    expect(getEditorKeyboardShortcut(keyEvent('Enter'), true)).toBeUndefined()
    expect(
      getEditorKeyboardShortcut(
        keyEvent('Enter', { isComposing: true }),
        false,
      ),
    ).toBeUndefined()
  })
})
