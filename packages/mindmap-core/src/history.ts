import type {
  CommandExecutionContext,
  CommandResult,
  MindMapCommand,
  MindMapCommandExecutor,
} from './commands'
import type { MindMapDocument } from './model'
import { assertMindMapDocument } from './validation'

interface HistoryEntry {
  command: MindMapCommand
  inverse: MindMapCommand
}

export class CommandHistory {
  readonly #undoStack: HistoryEntry[] = []
  readonly #redoStack: MindMapCommand[] = []

  execute(
    document: MindMapDocument,
    command: MindMapCommand,
    context: CommandExecutionContext,
    executor: MindMapCommandExecutor,
  ): CommandResult {
    const result = this.executeValidated(document, command, context, executor)

    this.#undoStack.push({ command, inverse: result.inverse })
    this.#redoStack.length = 0
    return result
  }

  undo(
    document: MindMapDocument,
    context: CommandExecutionContext,
    executor: MindMapCommandExecutor,
  ): CommandResult | undefined {
    const entry = this.#undoStack.at(-1)
    if (!entry) return undefined

    const result = this.executeValidated(
      document,
      entry.inverse,
      context,
      executor,
    )

    this.#undoStack.pop()
    this.#redoStack.push(entry.command)
    return result
  }

  redo(
    document: MindMapDocument,
    context: CommandExecutionContext,
    executor: MindMapCommandExecutor,
  ): CommandResult | undefined {
    const command = this.#redoStack.at(-1)
    if (!command) return undefined

    const result = this.executeValidated(document, command, context, executor)

    this.#redoStack.pop()
    this.#undoStack.push({ command, inverse: result.inverse })
    return result
  }

  clear(): void {
    this.#undoStack.length = 0
    this.#redoStack.length = 0
  }

  get canUndo(): boolean {
    return this.#undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0
  }

  get undoDepth(): number {
    return this.#undoStack.length
  }

  get redoDepth(): number {
    return this.#redoStack.length
  }

  private executeValidated(
    document: MindMapDocument,
    command: MindMapCommand,
    context: CommandExecutionContext,
    executor: MindMapCommandExecutor,
  ): CommandResult {
    assertMindMapDocument(document)
    const result = executor(document, command, context)
    assertMindMapDocument(result.document)
    return result
  }
}
