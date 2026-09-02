import type { LayoutEdge } from '@opentools/mindmap-layout'

export function createCubicConnectorPath(edge: LayoutEdge): string {
  const { sourcePort, targetPort } = edge
  if (edge.connectorShape === 'straight') {
    return `M ${sourcePort.x} ${sourcePort.y} L ${targetPort.x} ${targetPort.y}`
  }

  const isVertical = sourcePort.side === 'north' || sourcePort.side === 'south'
  if (edge.connectorShape === 'elbow') {
    if (isVertical) {
      const middleY = (sourcePort.y + targetPort.y) / 2
      return [
        `M ${sourcePort.x} ${sourcePort.y}`,
        `L ${sourcePort.x} ${middleY}`,
        `L ${targetPort.x} ${middleY}`,
        `L ${targetPort.x} ${targetPort.y}`,
      ].join(' ')
    }
    const middleX = (sourcePort.x + targetPort.x) / 2
    return [
      `M ${sourcePort.x} ${sourcePort.y}`,
      `L ${middleX} ${sourcePort.y}`,
      `L ${middleX} ${targetPort.y}`,
      `L ${targetPort.x} ${targetPort.y}`,
    ].join(' ')
  }

  const distance = isVertical
    ? Math.abs(targetPort.y - sourcePort.y)
    : Math.abs(targetPort.x - sourcePort.x)
  const controlOffset = Math.max(42, distance * 0.45)
  const direction = (
    side: typeof sourcePort.side,
  ): { x: number; y: number } => {
    switch (side) {
      case 'north':
        return { x: 0, y: -1 }
      case 'east':
        return { x: 1, y: 0 }
      case 'south':
        return { x: 0, y: 1 }
      case 'west':
        return { x: -1, y: 0 }
    }
  }
  const sourceDirection = direction(sourcePort.side)
  const targetDirection = direction(targetPort.side)
  const sourceControl = {
    x: sourcePort.x + sourceDirection.x * controlOffset,
    y: sourcePort.y + sourceDirection.y * controlOffset,
  }
  const targetControl = {
    x: targetPort.x + targetDirection.x * controlOffset,
    y: targetPort.y + targetDirection.y * controlOffset,
  }

  return [
    `M ${sourcePort.x} ${sourcePort.y}`,
    `C ${sourceControl.x} ${sourceControl.y}`,
    `${targetControl.x} ${targetControl.y}`,
    `${targetPort.x} ${targetPort.y}`,
  ].join(' ')
}
