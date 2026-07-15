import { describe, expect, it } from 'vitest'

import { getEditorKeyboardShortcut } from './keyboard'

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
      'create-sibling',
    )
    expect(getEditorKeyboardShortcut(keyEvent('Tab'), false)).toBe(
      'create-child',
    )
    expect(getEditorKeyboardShortcut(keyEvent('Delete'), false)).toBe('delete')
    expect(
      getEditorKeyboardShortcut(keyEvent('z', { ctrlKey: true }), false),
    ).toBe('undo')
    expect(
      getEditorKeyboardShortcut(
        keyEvent('z', { metaKey: true, shiftKey: true }),
        false,
      ),
    ).toBe('redo')
    expect(
      getEditorKeyboardShortcut(keyEvent('c', { ctrlKey: true }), false),
    ).toBe('copy')
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
