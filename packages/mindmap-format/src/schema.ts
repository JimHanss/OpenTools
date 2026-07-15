import { z } from 'zod'

const nodeIdSchema = z.string().min(1)
const nodeStyleV1Schema = z.strictObject({
  backgroundColor: z.string(),
  borderColor: z.string(),
  textColor: z.string(),
})

const nodeStyleV2Schema = nodeStyleV1Schema.extend({
  fontSize: z.number().finite().positive().optional(),
  fontWeight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  shape: z.enum(['rounded-rectangle', 'rectangle', 'pill']).optional(),
})

const linkSchema = z.strictObject({
  label: z.string(),
  url: z.string(),
})

const markerSchema = z.strictObject({
  kind: z.enum(['priority', 'status', 'icon']),
  value: z.string().min(1),
})

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

const documentBaseSchema = {
  id: z.string().min(1),
  title: z.string(),
  rootNodeId: nodeIdSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}

const relationshipSchema = z.strictObject({
  id: z.string().min(1),
  fromNodeId: nodeIdSchema,
  toNodeId: nodeIdSchema,
  label: z.string(),
})

const groupingSchema = z.strictObject({
  id: z.string().min(1),
  nodeIds: z.array(nodeIdSchema).min(1),
  label: z.string(),
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
  relationships: z.array(relationshipSchema).default([]),
  boundaries: z.array(groupingSchema).default([]),
  summaries: z.array(groupingSchema).default([]),
})

export const mindMapDocumentSchema = z.discriminatedUnion('schemaVersion', [
  mindMapDocumentV1Schema,
  mindMapDocumentV2Schema,
])

export type MindMapDocumentV1Input = z.output<typeof mindMapDocumentV1Schema>
export type MindMapDocumentV2Input = z.output<typeof mindMapDocumentV2Schema>
