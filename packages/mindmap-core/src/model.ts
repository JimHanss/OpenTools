export type MindMapId = string
export type MindMapNodeId = string

/** Documents in the editable domain model are always normalized to v2. */
export type MindMapSchemaVersion = 2

export type MindMapMarkerKind = 'priority' | 'status' | 'icon'

export interface MindMapMarker {
  kind: MindMapMarkerKind
  value: string
}

export type MindMapNodeMarker = MindMapMarker

export interface MindMapNodeStyle {
  backgroundColor: string
  borderColor: string
  textColor: string
  fontSize?: number
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
  fontStyle?: 'normal' | 'italic'
  shape?: 'rounded-rectangle' | 'rectangle' | 'pill'
}

export interface MindMapLink {
  label: string
  url: string
}

export interface MindMapRelationship {
  id: string
  fromNodeId: MindMapNodeId
  toNodeId: MindMapNodeId
  label: string
}

export interface MindMapBoundary {
  id: string
  nodeIds: MindMapNodeId[]
  label: string
}

export interface MindMapSummary {
  id: string
  nodeIds: MindMapNodeId[]
  label: string
}

export interface MindMapNode {
  id: MindMapNodeId
  parentId: MindMapNodeId | null
  childIds: MindMapNodeId[]
  text: string
  collapsed: boolean
  markers: MindMapNodeMarker[]
  notes: string
  links: MindMapLink[]
  style: MindMapNodeStyle
}

export interface MindMapDocument {
  schemaVersion: MindMapSchemaVersion
  id: MindMapId
  title: string
  rootNodeId: MindMapNodeId
  nodes: Record<MindMapNodeId, MindMapNode>
  relationships: MindMapRelationship[]
  boundaries: MindMapBoundary[]
  summaries: MindMapSummary[]
  createdAt: string
  updatedAt: string
}

export interface CreateMindMapDocumentInput {
  id: MindMapId
  rootNodeId: MindMapNodeId
  title: string
  now: string
}

export interface CreateMindMapNodeInput {
  id: MindMapNodeId
  parentId: MindMapNodeId | null
  text: string
  childIds?: MindMapNodeId[]
  collapsed?: boolean
  markers?: MindMapNodeMarker[]
  notes?: string
  links?: MindMapLink[]
  style?: Partial<MindMapNodeStyle>
}
