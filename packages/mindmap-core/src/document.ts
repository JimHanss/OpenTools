import type {
  CreateMindMapDocumentInput,
  CreateMindMapNodeInput,
  MindMapDocument,
  MindMapLink,
  MindMapNode,
  MindMapNodeMarker,
  MindMapNodeStyle,
} from './model'

export const defaultMindMapNodeStyle: Required<MindMapNodeStyle> = {
  backgroundColor: '#ffffff',
  borderColor: '#7c6ff2',
  textColor: '#1e1b4b',
  fontSize: 14,
  fontWeight: 'semibold',
  fontStyle: 'normal',
  shape: 'rounded-rectangle',
}

function cloneMarker(marker: MindMapNodeMarker): MindMapNodeMarker {
  return typeof marker === 'string' ? marker : { ...marker }
}

function cloneLink(link: MindMapLink): MindMapLink {
  return { ...link }
}

export function createMindMapDocument(
  input: CreateMindMapDocumentInput,
): MindMapDocument {
  const rootNode = createMindMapNode({
    id: input.rootNodeId,
    parentId: null,
    text: input.title,
  })

  return {
    schemaVersion: 2,
    id: input.id,
    title: input.title,
    rootNodeId: rootNode.id,
    nodes: { [rootNode.id]: rootNode },
    relationships: [],
    boundaries: [],
    summaries: [],
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function createMindMapNode(input: CreateMindMapNodeInput): MindMapNode {
  return {
    id: input.id,
    parentId: input.parentId,
    childIds: [...(input.childIds ?? [])],
    text: input.text,
    collapsed: input.collapsed ?? false,
    markers: (input.markers ?? []).map(cloneMarker),
    notes: input.notes ?? '',
    links: (input.links ?? []).map(cloneLink),
    style: { ...defaultMindMapNodeStyle, ...input.style },
  }
}

export function cloneMindMapDocument(
  document: MindMapDocument,
): MindMapDocument {
  return {
    ...document,
    nodes: Object.fromEntries(
      Object.entries(document.nodes).map(([nodeId, node]) => [
        nodeId,
        {
          ...node,
          childIds: [...node.childIds],
          markers: node.markers.map(cloneMarker),
          links: node.links.map(cloneLink),
          style: { ...node.style },
        },
      ]),
    ),
    relationships: document.relationships.map((relationship) => ({
      ...relationship,
    })),
    boundaries: document.boundaries.map((boundary) => ({
      ...boundary,
      nodeIds: [...boundary.nodeIds],
    })),
    summaries: document.summaries.map((summary) => ({
      ...summary,
      nodeIds: [...summary.nodeIds],
    })),
  }
}
