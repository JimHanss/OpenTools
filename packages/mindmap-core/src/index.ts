export type MindMapId = string
export type MindMapNodeId = string

export interface MindMapNodeStyle {
  backgroundColor: string
  borderColor: string
  textColor: string
}

export interface MindMapLink {
  label: string
  url: string
}

export interface MindMapNode {
  id: MindMapNodeId
  parentId: MindMapNodeId | null
  childIds: MindMapNodeId[]
  text: string
  collapsed: boolean
  markers: string[]
  notes: string
  links: MindMapLink[]
  style: MindMapNodeStyle
}

export interface MindMapDocument {
  schemaVersion: 1
  id: MindMapId
  title: string
  rootNodeId: MindMapNodeId
  nodes: Record<MindMapNodeId, MindMapNode>
  createdAt: string
  updatedAt: string
}

export interface CreateMindMapDocumentInput {
  id: MindMapId
  rootNodeId: MindMapNodeId
  title: string
  now: string
}

export interface MindMapCommand {
  readonly label: string
  apply(document: MindMapDocument): MindMapDocument
  revert(document: MindMapDocument): MindMapDocument
}

const defaultNodeStyle: MindMapNodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#7c6ff2',
  textColor: '#1e1b4b',
}

export function createMindMapDocument(
  input: CreateMindMapDocumentInput,
): MindMapDocument {
  const rootNode: MindMapNode = {
    id: input.rootNodeId,
    parentId: null,
    childIds: [],
    text: input.title,
    collapsed: false,
    markers: [],
    notes: '',
    links: [],
    style: { ...defaultNodeStyle },
  }

  return {
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    rootNodeId: rootNode.id,
    nodes: { [rootNode.id]: rootNode },
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function createMindMapNode(
  input: Pick<MindMapNode, 'id' | 'parentId' | 'text'> &
    Partial<Omit<MindMapNode, 'id' | 'parentId' | 'text'>>,
): MindMapNode {
  return {
    id: input.id,
    parentId: input.parentId,
    childIds: input.childIds ?? [],
    text: input.text,
    collapsed: input.collapsed ?? false,
    markers: input.markers ?? [],
    notes: input.notes ?? '',
    links: input.links ?? [],
    style: input.style ?? { ...defaultNodeStyle },
  }
}

export class CommandHistory {
  readonly #undoStack: MindMapCommand[] = []
  readonly #redoStack: MindMapCommand[] = []

  execute(document: MindMapDocument, command: MindMapCommand): MindMapDocument {
    const nextDocument = command.apply(document)
    this.#undoStack.push(command)
    this.#redoStack.length = 0
    return nextDocument
  }

  undo(document: MindMapDocument): MindMapDocument {
    const command = this.#undoStack.pop()
    if (!command) return document

    this.#redoStack.push(command)
    return command.revert(document)
  }

  redo(document: MindMapDocument): MindMapDocument {
    const command = this.#redoStack.pop()
    if (!command) return document

    this.#undoStack.push(command)
    return command.apply(document)
  }

  get canUndo(): boolean {
    return this.#undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0
  }
}
