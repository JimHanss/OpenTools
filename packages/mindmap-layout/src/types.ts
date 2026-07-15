import type { MindMapNodeId } from '@opentools/mindmap-core'

export interface MindMapNodeSize {
  readonly width: number
  readonly height: number
}

export interface MindMapLayoutConfig {
  readonly nodeWidth: number
  readonly nodeHeight: number
  readonly horizontalGap: number
  readonly verticalGap: number
  readonly horizontalPadding: number
  readonly verticalPadding: number
  readonly textCharacterWidth: number
  readonly maxNodeWidth: number
}

export interface MindMapLayoutOptions extends Partial<MindMapLayoutConfig> {
  readonly nodeSizes?: Readonly<
    Record<MindMapNodeId, Readonly<Partial<MindMapNodeSize>>>
  >
}

export interface LayoutNode extends MindMapNodeSize {
  readonly id: MindMapNodeId
  readonly x: number
  readonly y: number
}

export interface LayoutEdge {
  readonly id: string
  readonly sourceId: MindMapNodeId
  readonly targetId: MindMapNodeId
  readonly sourceX: number
  readonly sourceY: number
  readonly targetX: number
  readonly targetY: number
}

export interface LayoutBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  readonly width: number
  readonly height: number
}

export interface MindMapLayoutResult {
  readonly nodes: readonly LayoutNode[]
  readonly edges: readonly LayoutEdge[]
  readonly bounds: LayoutBounds
  /** @deprecated Prefer `bounds.width`. */
  readonly width: number
  /** @deprecated Prefer `bounds.height`. */
  readonly height: number
}
