import { describe, expect, it } from 'vitest'

import {
  createMindMapClipboardPayload,
  createMindMapDocument,
} from '@opentools/mindmap-core'

import { parseMindMapClipboard, serializeMindMapClipboard } from './clipboard'

describe('browser clipboard format adapter', () => {
  it('round-trips only recognized internal mind-map clipboard text', () => {
    const document = createMindMapDocument({
      id: 'clipboard-map',
      rootNodeId: 'root',
      title: 'Root',
      now: '2026-07-15T00:00:00.000Z',
    })
    const payload = createMindMapClipboardPayload(document, ['root'])

    expect(parseMindMapClipboard(serializeMindMapClipboard(payload))).toEqual(
      payload,
    )
    expect(parseMindMapClipboard('Plain text')).toBeUndefined()
    expect(parseMindMapClipboard('opentools-mindmap:v1:{')).toBeUndefined()
  })
})
