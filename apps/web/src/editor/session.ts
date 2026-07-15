import {
  assertMindMapDocument,
  CommandHistory,
  executeMindMapCommand,
  mindMapCommandTypes,
  type CommandResult,
  type MindMapCommand,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import type { MindMapRepository } from '@opentools/mindmap-storage'

import { AutosaveController, type AutosaveStatus } from './autosave'

export interface EditorSessionSnapshot {
  readonly document: MindMapDocument
  readonly revision: number
  readonly canRedo: boolean
  readonly canUndo: boolean
  readonly saveStatus: AutosaveStatus
}

export interface EditorSessionOptions {
  readonly debounceMs?: number
  readonly now?: () => string
}

export type EditorSessionListener = (snapshot: EditorSessionSnapshot) => void

/**
 * Coordinates command history and autosave for one open document. It does not
 * own selection, viewport, dialogs, or any other UI-only state.
 */
export class EditorSession {
  readonly #autosave: AutosaveController
  readonly #history = new CommandHistory()
  readonly #listeners = new Set<EditorSessionListener>()
  readonly #now: () => string
  #disposed = false
  #document: MindMapDocument
  #revision = 0

  constructor(
    document: MindMapDocument,
    repository: MindMapRepository,
    options: EditorSessionOptions = {},
  ) {
    assertMindMapDocument(document)
    this.#document = document
    this.#now = options.now ?? (() => new Date().toISOString())
    this.#autosave = new AutosaveController(
      repository,
      options.debounceMs === undefined
        ? { onStatusChange: () => this.#emit() }
        : {
            debounceMs: options.debounceMs,
            onStatusChange: () => this.#emit(),
          },
    )
  }

  getSnapshot(): EditorSessionSnapshot {
    return {
      document: this.#document,
      revision: this.#revision,
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
      saveStatus: this.#autosave.getStatus(),
    }
  }

  subscribe(listener: EditorSessionListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  execute(command: MindMapCommand): CommandResult {
    this.#assertActive()
    const result = this.#history.execute(
      this.#document,
      command,
      { now: this.#now() },
      executeMindMapCommand,
    )
    this.#commit(result)
    return result
  }

  renameMap(title: string): CommandResult {
    return this.execute({
      type: mindMapCommandTypes.renameMap,
      label: 'Rename mind map',
      payload: { title },
    })
  }

  undo(): CommandResult | undefined {
    this.#assertActive()
    const result = this.#history.undo(
      this.#document,
      { now: this.#now() },
      executeMindMapCommand,
    )
    if (result) this.#commit(result)
    return result
  }

  redo(): CommandResult | undefined {
    this.#assertActive()
    const result = this.#history.redo(
      this.#document,
      { now: this.#now() },
      executeMindMapCommand,
    )
    if (result) this.#commit(result)
    return result
  }

  flush(): Promise<void> {
    return this.#autosave.flush()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#autosave.dispose()
    this.#listeners.clear()
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The editor session has been disposed.')
  }

  #commit(result: CommandResult): void {
    this.#document = result.document
    this.#revision += 1
    this.#autosave.schedule(this.#document, this.#revision)
    this.#emit()
  }

  #emit(): void {
    if (this.#disposed) return
    const snapshot = this.getSnapshot()
    for (const listener of this.#listeners) listener(snapshot)
  }
}
