import {
  cloneMindMapDocument,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import type { MindMapRepository } from '@opentools/mindmap-storage'

export type AutosaveStatus =
  | { readonly state: 'idle' | 'saving' | 'saved'; readonly revision: number }
  | {
      readonly state: 'error'
      readonly revision: number
      readonly error: unknown
    }

export interface AutosaveControllerOptions {
  readonly debounceMs?: number
  readonly onStatusChange?: (status: AutosaveStatus) => void
}

interface PendingAutosave {
  readonly document: MindMapDocument
  readonly generation: number
  readonly revision: number
}

/** Serializes debounced local writes and never reports an older write as saved. */
export class AutosaveController {
  readonly #debounceMs: number
  readonly #onStatusChange: ((status: AutosaveStatus) => void) | undefined
  readonly #repository: MindMapRepository
  #disposed = false
  #generation = 0
  #latestRevision = Number.NEGATIVE_INFINITY
  #pending: PendingAutosave | undefined
  #status: AutosaveStatus = { state: 'idle', revision: 0 }
  #timer: ReturnType<typeof setTimeout> | undefined
  #writePromise: Promise<void> | undefined

  constructor(
    repository: MindMapRepository,
    options: AutosaveControllerOptions = {},
  ) {
    this.#repository = repository
    this.#debounceMs = Math.max(0, options.debounceMs ?? 350)
    this.#onStatusChange = options.onStatusChange
  }

  getStatus(): AutosaveStatus {
    return this.#status
  }

  schedule(document: MindMapDocument, revision: number): void {
    if (this.#disposed || revision < this.#latestRevision) return

    this.#latestRevision = revision
    this.#generation += 1
    this.#pending = {
      document: cloneMindMapDocument(document),
      generation: this.#generation,
      revision,
    }
    this.#clearTimer()
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.flush().catch(() => undefined)
    }, this.#debounceMs)
  }

  async flush(): Promise<void> {
    if (this.#disposed) return
    this.#clearTimer()

    while (this.#pending || this.#writePromise) {
      if (this.#writePromise) {
        await this.#writePromise
        continue
      }

      const writePromise = this.#writePendingDocument()
      this.#writePromise = writePromise
      try {
        await writePromise
      } finally {
        if (this.#writePromise === writePromise) {
          this.#writePromise = undefined
        }
      }
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#pending = undefined
    this.#clearTimer()
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #setStatus(status: AutosaveStatus): void {
    if (this.#disposed) return
    this.#status = status
    this.#onStatusChange?.(status)
  }

  async #writePendingDocument(): Promise<void> {
    while (this.#pending) {
      const pending = this.#pending
      this.#pending = undefined
      this.#setStatus({ state: 'saving', revision: pending.revision })

      try {
        await this.#repository.save(pending.document)
      } catch (error) {
        if (this.#hasNewerPendingDocument(pending.generation)) {
          continue
        }

        this.#setStatus({
          state: 'error',
          revision: pending.revision,
          error,
        })
        throw error
      }

      if (pending.generation === this.#generation) {
        this.#setStatus({ state: 'saved', revision: pending.revision })
      }
    }
  }

  #hasNewerPendingDocument(generation: number): boolean {
    return (
      this.#pending?.generation !== undefined &&
      this.#pending.generation > generation
    )
  }
}
