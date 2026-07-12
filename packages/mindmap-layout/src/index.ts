import { hierarchy, tree } from 'd3-hierarchy'

import type {
  MindMapDocument,
  MindMapNode,
  MindMapNodeId,
} from '@opentools/mindmap-core'

export interface MindMapLayoutConfig {
  nodeWidth: number
  nodeHeight: number
  horizontalGap: number
  verticalGap: number
}

export interface LayoutNode {
  id: MindMapNodeId
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  id: string
  sourceId: MindMapNodeId
  targetId: MindMapNodeId
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export interface MindMapLayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

interface LayoutDatum {
  node: MindMapNode
  children: LayoutDatum[]
}

export const defaultLayoutConfig: MindMapLayoutConfig = {
  nodeWidth: 176,
  nodeHeight: 52,
  horizontalGap: 88,
  verticalGap: 34,
}

function buildLayoutDatum(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): LayoutDatum {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Mind map node not found: ${nodeId}`)

  return {
    node,
    children: node.collapsed
      ? []
      : node.childIds.map((childId) => buildLayoutDatum(document, childId)),
  }
}

export function layoutMindMap(
  document: MindMapDocument,
  config: MindMapLayoutConfig = defaultLayoutConfig,
): MindMapLayoutResult {
  const rootDatum = buildLayoutDatum(document, document.rootNodeId)
  const root = hierarchy(rootDatum, (datum) => datum.children)
  const layoutRoot = tree<LayoutDatum>().nodeSize([
    config.nodeHeight + config.verticalGap,
    config.nodeWidth + config.horizontalGap,
  ])(root)
  const descendants = layoutRoot.descendants()
  const minimumVerticalPosition = Math.min(...descendants.map((node) => node.x))

  const nodes = descendants.map<LayoutNode>((node) => ({
    id: node.data.node.id,
    x: node.y,
    y: node.x - minimumVerticalPosition,
    width: config.nodeWidth,
    height: config.nodeHeight,
  }))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const edges = layoutRoot.links().map<LayoutEdge>((link) => {
    const source = nodesById.get(link.source.data.node.id)
    const target = nodesById.get(link.target.data.node.id)
    if (!source || !target)
      throw new Error('Layout edge references a missing node')

    return {
      id: `${source.id}->${target.id}`,
      sourceId: source.id,
      targetId: target.id,
      sourceX: source.x + source.width,
      sourceY: source.y + source.height / 2,
      targetX: target.x,
      targetY: target.y + target.height / 2,
    }
  })

  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((node) => node.x + node.width)),
    height: Math.max(...nodes.map((node) => node.y + node.height)),
  }
}
