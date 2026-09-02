import type {
  MindMapDocument,
  MindMapLogicalSide,
  MindMapNodeId,
  MindMapStructure,
} from '@opentools/mindmap-core'

export interface MindMapNodeSize {
  readonly width: number
  readonly height: number
}

export interface MindMapTopicTextMetrics {
  readonly characterWidth: number
  readonly charactersPerLine: number
  readonly lineHeight: number
  readonly lines: readonly string[]
  readonly naturalTextWidth: number
}

export interface MindMapTopicTextMeasureStyle {
  readonly fontFamily: string
  readonly fontSize: number
  readonly fontStyle: 'normal' | 'italic'
  readonly fontWeight: 'normal' | 'medium' | 'semibold' | 'bold'
}

export type MindMapTopicTextMeasure = (
  text: string,
  style: MindMapTopicTextMeasureStyle,
) => number

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
  readonly strategyRegistry?: LayoutStrategyRegistry
  /** Optional non-persistent visibility projection for filter/focus UIs. */
  readonly visibleNodeIds?: ReadonlySet<MindMapNodeId>
}

export type LayoutPortSide = 'north' | 'east' | 'south' | 'west'

export interface LayoutPort {
  readonly side: LayoutPortSide
  readonly x: number
  readonly y: number
}

export interface LayoutNode extends MindMapNodeSize {
  readonly id: MindMapNodeId
  readonly rootId: MindMapNodeId
  /** Structure responsible for placing this topic's direct children. */
  readonly structure: MindMapStructure
  readonly logicalSide?: MindMapLogicalSide | undefined
  readonly x: number
  readonly y: number
}

export interface LayoutEdge {
  readonly id: string
  readonly sourceId: MindMapNodeId
  readonly targetId: MindMapNodeId
  readonly structure: MindMapStructure
  readonly connectorShape: 'curve' | 'straight' | 'elbow'
  readonly sourcePort: LayoutPort
  readonly targetPort: LayoutPort
  /** @deprecated Prefer `sourcePort.x`. */
  readonly sourceX: number
  /** @deprecated Prefer `sourcePort.y`. */
  readonly sourceY: number
  /** @deprecated Prefer `targetPort.x`. */
  readonly targetX: number
  /** @deprecated Prefer `targetPort.y`. */
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
  readonly roots: readonly LayoutSubtreeResult[]
  /** @deprecated Prefer `bounds.width`. */
  readonly width: number
  /** @deprecated Prefer `bounds.height`. */
  readonly height: number
}

export interface LayoutSubtreeRequest {
  readonly document: MindMapDocument
  readonly rootNodeId: MindMapNodeId
  readonly ownerRootNodeId: MindMapNodeId
  readonly structure: MindMapStructure
  readonly nodeSize: MindMapNodeSize
  readonly childResults: readonly LayoutSubtreeResult[]
  readonly config: MindMapLayoutConfig
}

export interface LayoutSubtreeResult {
  readonly rootNodeId: MindMapNodeId
  readonly ownerRootNodeId: MindMapNodeId
  readonly structure: MindMapStructure
  readonly nodes: readonly LayoutNode[]
  readonly edges: readonly LayoutEdge[]
  readonly bounds: LayoutBounds
}

export interface LayoutStrategy {
  readonly id: MindMapStructure
  readonly direction: 'right' | 'left' | 'balanced' | 'down'
  readonly connectorShape: 'curve' | 'straight' | 'elbow'
  layout(request: LayoutSubtreeRequest): LayoutSubtreeResult
}

export type LayoutStrategyRegistry = Readonly<
  Record<MindMapStructure, LayoutStrategy>
>
