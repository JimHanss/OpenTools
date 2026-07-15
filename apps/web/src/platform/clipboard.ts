import type { MindMapClipboardPayload } from '@opentools/mindmap-core'

const clipboardPrefix = 'opentools-mindmap:v1:'

export class ClipboardUnavailableError extends Error {
  constructor(message = 'Clipboard access is unavailable in this browser.') {
    super(message)
    this.name = 'ClipboardUnavailableError'
  }
}

export function serializeMindMapClipboard(
  payload: MindMapClipboardPayload,
): string {
  return `${clipboardPrefix}${JSON.stringify(payload)}`
}

export function parseMindMapClipboard(
  value: string,
): MindMapClipboardPayload | undefined {
  if (!value.startsWith(clipboardPrefix)) return undefined

  try {
    const payload = JSON.parse(value.slice(clipboardPrefix.length)) as unknown
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('version' in payload) ||
      !('roots' in payload) ||
      payload.version !== 1 ||
      !Array.isArray(payload.roots)
    ) {
      return undefined
    }

    return payload as MindMapClipboardPayload
  } catch {
    return undefined
  }
}

export interface MindMapClipboardAdapter {
  read(): Promise<MindMapClipboardPayload | undefined>
  write(payload: MindMapClipboardPayload): Promise<void>
}

export function createBrowserMindMapClipboardAdapter(): MindMapClipboardAdapter {
  return {
    async read() {
      if (!navigator.clipboard?.readText) throw new ClipboardUnavailableError()
      return parseMindMapClipboard(await navigator.clipboard.readText())
    },
    async write(payload) {
      if (!navigator.clipboard?.writeText) throw new ClipboardUnavailableError()
      await navigator.clipboard.writeText(serializeMindMapClipboard(payload))
    },
  }
}
