import { z } from 'zod'

import type { MindMapDocument } from '@opentools/mindmap-core'

const nodeStyleSchema = z.object({
  backgroundColor: z.string(),
  borderColor: z.string(),
  textColor: z.string(),
})

const mindMapNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  text: z.string(),
  collapsed: z.boolean(),
  markers: z.array(z.string()),
  notes: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  style: nodeStyleSchema,
})

export const mindMapDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  title: z.string(),
  rootNodeId: z.string(),
  nodes: z.record(z.string(), mindMapNodeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export function parseMindMapDocument(input: unknown): MindMapDocument {
  return mindMapDocumentSchema.parse(input)
}

export function serializeMindMapDocument(document: MindMapDocument): string {
  return JSON.stringify(document, null, 2)
}
