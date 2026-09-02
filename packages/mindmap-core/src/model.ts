export type MindMapId = string
export type MindMapNodeId = string
export type MindMapLabelId = string
export type MindMapAssetId = string
export type MindMapContentBlockId = string
export type MindMapCalloutId = string

/** Documents in the editable domain model are always normalized to v3. */
export type MindMapSchemaVersion = 3

export const mindMapStructures = [
  'logic-right',
  'logic-left',
  'mind-map-balanced',
  'tree-top',
  'org-top',
] as const

export type MindMapStructure = (typeof mindMapStructures)[number]
export type MindMapLogicalSide = 'left' | 'right'

export interface MindMapPoint {
  x: number
  y: number
}

export interface FloatingTopicPlacement extends MindMapPoint {
  structure?: MindMapStructure | undefined
}

export type MindMapMarkerKind = 'priority' | 'status' | 'icon'

export interface MindMapMarker {
  kind: MindMapMarkerKind
  value: string
}

export type MindMapNodeMarker = MindMapMarker

export type MindMapTopicShape =
  'rounded-rectangle' | 'rectangle' | 'pill' | 'underline' | 'borderless'

export type MindMapLinePattern = 'solid' | 'dashed' | 'dotted'
export type MindMapConnectorShape = 'curve' | 'straight' | 'elbow'

export interface MindMapNodeStyle {
  backgroundColor: string
  borderColor: string
  textColor: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'medium' | 'semibold' | 'bold'
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'line-through'
  textAlign: 'left' | 'center' | 'right'
  shape: MindMapTopicShape
  borderWidth: number
  borderStyle: MindMapLinePattern
  branchColor: string
  branchWidth: number
  branchStyle: MindMapLinePattern
  branchShape: MindMapConnectorShape
  /** Undefined means the topic width follows its measured content. */
  fixedWidth?: number | undefined
}

export type MindMapNodeStyleOverride = {
  [Key in keyof MindMapNodeStyle]?: MindMapNodeStyle[Key] | undefined
}

export interface MindMapLink {
  label: string
  url: string
}

export interface MindMapRelationshipStyle {
  color: string
  width: number
  pattern: MindMapLinePattern
  shape: MindMapConnectorShape
  startMarker: 'none' | 'arrow' | 'dot'
  endMarker: 'none' | 'arrow' | 'dot'
  labelColor: string
  labelFontSize: number
}

export interface MindMapBoundaryStyle {
  shape: 'rounded-rectangle' | 'rectangle' | 'cloud'
  fillColor: string
  fillOpacity: number
  borderColor: string
  borderWidth: number
  borderStyle: MindMapLinePattern
  textColor: string
}

export interface MindMapSummaryStyle {
  shape: 'bracket' | 'line'
  color: string
  width: number
  pattern: MindMapLinePattern
  textColor: string
}

export interface MindMapCalloutStyle {
  shape: 'rounded-rectangle' | 'rectangle' | 'pill'
  backgroundColor: string
  borderColor: string
  borderWidth: number
  textColor: string
  fontSize: number
}

export interface MindMapRelationship {
  id: string
  fromNodeId: MindMapNodeId
  toNodeId: MindMapNodeId
  label: string
  style: MindMapRelationshipStyle
  controlPoints: MindMapPoint[]
}

export interface MindMapBoundary {
  id: string
  nodeIds: MindMapNodeId[]
  label: string
  style: MindMapBoundaryStyle
}

export interface MindMapSummary {
  id: string
  nodeIds: MindMapNodeId[]
  label: string
  style: MindMapSummaryStyle
}

export interface MindMapCallout {
  id: MindMapCalloutId
  ownerNodeId: MindMapNodeId
  text: string
  placement: 'top' | 'right' | 'bottom' | 'left'
  offset: MindMapPoint
  style: MindMapCalloutStyle
}

export interface MindMapLabel {
  id: MindMapLabelId
  name: string
  color: string
  order?: number | undefined
}

export type MindMapNumberingStyle = 'decimal' | 'alpha' | 'roman'

export interface MindMapNumberingPolicy {
  style: MindMapNumberingStyle
  mode: 'siblings' | 'hierarchical'
  startAt: number
  restartAtNodeId?: MindMapNodeId | undefined
}

export interface MindMapImageContentBlock {
  id: MindMapContentBlockId
  type: 'image'
  assetId: MindMapAssetId
  width: number
  height?: number | undefined
  altText: string
  preserveAspectRatio: boolean
}

export interface MindMapEquationContentBlock {
  id: MindMapContentBlockId
  type: 'equation'
  source: string
  displayMode: 'block'
  width?: number | undefined
  height?: number | undefined
}

export type MindMapContentBlock =
  MindMapImageContentBlock | MindMapEquationContentBlock

export interface MindMapAssetMetadata {
  id: MindMapAssetId
  kind: 'image'
  mimeType: string
  byteSize: number
  checksum: string
  intrinsicWidth: number
  intrinsicHeight: number
  createdAt: string
}

export interface MindMapTheme {
  id: string
  backgroundColor: string
  defaultFontFamily: string
  rootTopicStyle: MindMapNodeStyleOverride
  mainTopicStyle: MindMapNodeStyleOverride
  subtopicStyle: MindMapNodeStyleOverride
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
  labelIds: MindMapLabelId[]
  labelSortMode: 'manual' | 'alphabetical'
  numbering?: MindMapNumberingPolicy | undefined
  contentBlocks: MindMapContentBlock[]
  /** User-authored values only; omitted keys continue to follow the theme. */
  styleOverrides: MindMapNodeStyleOverride
  /** Legacy materialized fallback retained for v1/v2/v3 compatibility. */
  style: MindMapNodeStyle
}

export interface MindMapDocument {
  schemaVersion: MindMapSchemaVersion
  id: MindMapId
  title: string
  rootNodeId: MindMapNodeId
  nodes: Record<MindMapNodeId, MindMapNode>
  floatingTopics: Record<MindMapNodeId, FloatingTopicPlacement>
  defaultStructure: MindMapStructure
  structureOverrides: Record<MindMapNodeId, MindMapStructure>
  labels: Record<MindMapLabelId, MindMapLabel>
  assets: Record<MindMapAssetId, MindMapAssetMetadata>
  theme: MindMapTheme
  relationships: MindMapRelationship[]
  boundaries: MindMapBoundary[]
  summaries: MindMapSummary[]
  callouts: MindMapCallout[]
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
  labelIds?: MindMapLabelId[]
  labelSortMode?: 'manual' | 'alphabetical'
  numbering?: MindMapNumberingPolicy
  contentBlocks?: MindMapContentBlock[]
  style?: MindMapNodeStyleOverride | undefined
}

export interface CreateMindMapRelationshipInput {
  id: string
  fromNodeId: MindMapNodeId
  toNodeId: MindMapNodeId
  label?: string | undefined
  style?: Partial<MindMapRelationshipStyle> | undefined
  controlPoints?: MindMapPoint[] | undefined
}

export interface CreateMindMapBoundaryInput {
  id: string
  nodeIds: MindMapNodeId[]
  label?: string | undefined
  style?: Partial<MindMapBoundaryStyle> | undefined
}

export interface CreateMindMapSummaryInput {
  id: string
  nodeIds: MindMapNodeId[]
  label?: string | undefined
  style?: Partial<MindMapSummaryStyle> | undefined
}

export interface CreateMindMapCalloutInput {
  id: MindMapCalloutId
  ownerNodeId: MindMapNodeId
  text?: string | undefined
  placement?: MindMapCallout['placement'] | undefined
  offset?: MindMapPoint | undefined
  style?: Partial<MindMapCalloutStyle> | undefined
}
