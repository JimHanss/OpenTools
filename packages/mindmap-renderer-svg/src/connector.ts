import type { LayoutEdge } from '@opentools/mindmap-layout'

export function createCubicConnectorPath(edge: LayoutEdge): string {
  const horizontalDistance = Math.abs(edge.targetX - edge.sourceX)
  const controlOffset = Math.max(42, horizontalDistance * 0.45)

  return [
    `M ${edge.sourceX} ${edge.sourceY}`,
    `C ${edge.sourceX + controlOffset} ${edge.sourceY}`,
    `${edge.targetX - controlOffset} ${edge.targetY}`,
    `${edge.targetX} ${edge.targetY}`,
  ].join(' ')
}
