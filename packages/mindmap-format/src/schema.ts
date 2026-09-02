import { z } from 'zod'

const nodeIdSchema = z.string().min(1)
const recordIdSchema = z.string().min(1)
const finitePositiveSchema = z.number().finite().positive()
const finiteNonNegativeSchema = z.number().finite().nonnegative()
const pointSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
})

const linePatternSchema = z.enum(['solid', 'dashed', 'dotted'])
const connectorShapeSchema = z.enum(['curve', 'straight', 'elbow'])

const nodeStyleV1Schema = z.strictObject({
  backgroundColor: z.string(),
  borderColor: z.string(),
  textColor: z.string(),
})

const nodeStyleV2Schema = nodeStyleV1Schema.extend({
  fontSize: finitePositiveSchema.optional(),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  shape: z.enum(['rounded-rectangle', 'rectangle', 'pill']).optional(),
})

export const mindMapNodeStyleV3Schema = z.strictObject({
  backgroundColor: z.string(),
  borderColor: z.string(),
  textColor: z.string(),
  fontFamily: z.string().min(1),
  fontSize: finitePositiveSchema,
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']),
  fontStyle: z.enum(['normal', 'italic']),
  textDecoration: z.enum(['none', 'line-through']),
  textAlign: z.enum(['left', 'center', 'right']),
  shape: z.enum([
    'rounded-rectangle',
    'rectangle',
    'pill',
    'underline',
    'borderless',
  ]),
  borderWidth: finiteNonNegativeSchema,
  borderStyle: linePatternSchema,
  branchColor: z.string(),
  branchWidth: finiteNonNegativeSchema,
  branchStyle: linePatternSchema,
  branchShape: connectorShapeSchema,
  fixedWidth: z.number().finite().min(80).max(800).optional(),
})

const linkSchema = z.strictObject({
  label: z.string(),
  url: z.string(),
})

const markerSchema = z.strictObject({
  kind: z.enum(['priority', 'status', 'icon']),
  value: z.string().min(1),
})

const numberingPolicySchema = z.strictObject({
  style: z.enum(['decimal', 'alpha', 'roman']),
  mode: z.enum(['siblings', 'hierarchical']),
  startAt: z.number().int().positive(),
  restartAtNodeId: nodeIdSchema.optional(),
})

const imageContentBlockSchema = z.strictObject({
  id: recordIdSchema,
  type: z.literal('image'),
  assetId: recordIdSchema,
  width: finitePositiveSchema,
  height: finitePositiveSchema.optional(),
  altText: z.string(),
  preserveAspectRatio: z.boolean(),
})

const equationContentBlockSchema = z.strictObject({
  id: recordIdSchema,
  type: z.literal('equation'),
  source: z.string(),
  displayMode: z.literal('block'),
  width: finitePositiveSchema.optional(),
  height: finitePositiveSchema.optional(),
})

const contentBlockSchema = z.discriminatedUnion('type', [
  imageContentBlockSchema,
  equationContentBlockSchema,
])

const nodeBaseSchema = {
  id: nodeIdSchema,
  parentId: nodeIdSchema.nullable(),
  childIds: z.array(nodeIdSchema),
  text: z.string(),
  collapsed: z.boolean(),
  notes: z.string(),
  links: z.array(linkSchema),
}

export const mindMapNodeV1Schema = z.strictObject({
  ...nodeBaseSchema,
  markers: z.array(z.string()),
  style: nodeStyleV1Schema,
})

export const mindMapNodeV2Schema = z.strictObject({
  ...nodeBaseSchema,
  markers: z.array(markerSchema),
  style: nodeStyleV2Schema,
})

export const mindMapNodeV3Schema = z.strictObject({
  ...nodeBaseSchema,
  markers: z.array(markerSchema),
  labelIds: z.array(recordIdSchema),
  labelSortMode: z.enum(['manual', 'alphabetical']),
  numbering: numberingPolicySchema.optional(),
  contentBlocks: z.array(contentBlockSchema),
  styleOverrides: mindMapNodeStyleV3Schema.partial().optional(),
  style: mindMapNodeStyleV3Schema,
})

const documentBaseSchema = {
  id: z.string().min(1),
  title: z.string(),
  rootNodeId: nodeIdSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}

const relationshipV2Schema = z.strictObject({
  id: recordIdSchema,
  fromNodeId: nodeIdSchema,
  toNodeId: nodeIdSchema,
  label: z.string(),
})

const groupingV2Schema = z.strictObject({
  id: recordIdSchema,
  nodeIds: z.array(nodeIdSchema).min(1),
  label: z.string(),
})

const relationshipStyleSchema = z.strictObject({
  color: z.string(),
  width: finiteNonNegativeSchema,
  pattern: linePatternSchema,
  shape: connectorShapeSchema,
  startMarker: z.enum(['none', 'arrow', 'dot']),
  endMarker: z.enum(['none', 'arrow', 'dot']),
  labelColor: z.string(),
  labelFontSize: finitePositiveSchema,
})

const relationshipV3Schema = relationshipV2Schema.extend({
  style: relationshipStyleSchema,
  controlPoints: z.array(pointSchema),
})

const boundaryStyleSchema = z.strictObject({
  shape: z.enum(['rounded-rectangle', 'rectangle', 'cloud']),
  fillColor: z.string(),
  fillOpacity: z.number().finite().min(0).max(1),
  borderColor: z.string(),
  borderWidth: finiteNonNegativeSchema,
  borderStyle: linePatternSchema,
  textColor: z.string(),
})

const summaryStyleSchema = z.strictObject({
  shape: z.enum(['bracket', 'line']),
  color: z.string(),
  width: finiteNonNegativeSchema,
  pattern: linePatternSchema,
  textColor: z.string(),
})

const boundaryV3Schema = groupingV2Schema.extend({
  style: boundaryStyleSchema,
})

const summaryV3Schema = groupingV2Schema.extend({
  style: summaryStyleSchema,
})

const calloutStyleSchema = z.strictObject({
  shape: z.enum(['rounded-rectangle', 'rectangle', 'pill']),
  backgroundColor: z.string(),
  borderColor: z.string(),
  borderWidth: finiteNonNegativeSchema,
  textColor: z.string(),
  fontSize: finitePositiveSchema,
})

const calloutSchema = z.strictObject({
  id: recordIdSchema,
  ownerNodeId: nodeIdSchema,
  text: z.string(),
  placement: z.enum(['top', 'right', 'bottom', 'left']),
  offset: pointSchema,
  style: calloutStyleSchema,
})

const floatingTopicPlacementSchema = pointSchema.extend({
  structure: z
    .enum([
      'logic-right',
      'logic-left',
      'mind-map-balanced',
      'tree-top',
      'org-top',
    ])
    .optional(),
})

const structureSchema = z.enum([
  'logic-right',
  'logic-left',
  'mind-map-balanced',
  'tree-top',
  'org-top',
])

const labelSchema = z.strictObject({
  id: recordIdSchema,
  name: z.string().min(1),
  color: z.string().min(1),
  order: z.number().finite().optional(),
})

const assetMetadataSchema = z.strictObject({
  id: recordIdSchema,
  kind: z.literal('image'),
  mimeType: z.string().min(1),
  byteSize: finiteNonNegativeSchema,
  checksum: z.string().min(1),
  intrinsicWidth: finitePositiveSchema,
  intrinsicHeight: finitePositiveSchema,
  createdAt: z.string().min(1),
})

const themeSchema = z.strictObject({
  id: recordIdSchema,
  backgroundColor: z.string(),
  defaultFontFamily: z.string().min(1),
  rootTopicStyle: mindMapNodeStyleV3Schema.partial(),
  mainTopicStyle: mindMapNodeStyleV3Schema.partial(),
  subtopicStyle: mindMapNodeStyleV3Schema.partial(),
})

export const mindMapDocumentV1Schema = z.strictObject({
  ...documentBaseSchema,
  schemaVersion: z.literal(1),
  nodes: z.record(nodeIdSchema, mindMapNodeV1Schema),
})

export const mindMapDocumentV2Schema = z.strictObject({
  ...documentBaseSchema,
  schemaVersion: z.literal(2),
  nodes: z.record(nodeIdSchema, mindMapNodeV2Schema),
  relationships: z.array(relationshipV2Schema).default([]),
  boundaries: z.array(groupingV2Schema).default([]),
  summaries: z.array(groupingV2Schema).default([]),
})

export const mindMapDocumentV3Schema = z.strictObject({
  ...documentBaseSchema,
  schemaVersion: z.literal(3),
  nodes: z.record(nodeIdSchema, mindMapNodeV3Schema),
  floatingTopics: z.record(nodeIdSchema, floatingTopicPlacementSchema),
  defaultStructure: structureSchema,
  structureOverrides: z.record(nodeIdSchema, structureSchema),
  labels: z.record(recordIdSchema, labelSchema),
  assets: z.record(recordIdSchema, assetMetadataSchema),
  theme: themeSchema,
  relationships: z.array(relationshipV3Schema),
  boundaries: z.array(boundaryV3Schema),
  summaries: z.array(summaryV3Schema),
  callouts: z.array(calloutSchema),
})

export const mindMapDocumentSchema = z.discriminatedUnion('schemaVersion', [
  mindMapDocumentV1Schema,
  mindMapDocumentV2Schema,
  mindMapDocumentV3Schema,
])

export type MindMapDocumentV1Input = z.output<typeof mindMapDocumentV1Schema>
export type MindMapDocumentV2Input = z.output<typeof mindMapDocumentV2Schema>
export type MindMapDocumentV3Input = z.output<typeof mindMapDocumentV3Schema>
