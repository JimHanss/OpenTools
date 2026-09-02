import type { MindMapStructure } from '@opentools/mindmap-core'

import type { CanvasPoint, CanvasRect } from './viewport'

export type TopicDropPlacement = 'before' | 'after' | 'child'

/** Resolves sibling drop zones along the active layout's sibling axis. */
export function getTopicDropPlacement(
  structure: MindMapStructure | undefined,
  bounds: CanvasRect,
  point: CanvasPoint,
): TopicDropPlacement {
  const usesHorizontalSiblingAxis =
    structure === 'tree-top' || structure === 'org-top'
  const relativePosition = usesHorizontalSiblingAxis
    ? (point.x - bounds.x) / bounds.width
    : (point.y - bounds.y) / bounds.height
  return relativePosition < 0.28
    ? 'before'
    : relativePosition > 0.72
      ? 'after'
      : 'child'
}
