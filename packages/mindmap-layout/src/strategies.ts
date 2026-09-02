import type {
  MindMapLogicalSide,
  MindMapNodeId,
  MindMapStructure,
} from '@opentools/mindmap-core'

import type {
  LayoutBounds,
  LayoutEdge,
  LayoutNode,
  LayoutPort,
  LayoutPortSide,
  LayoutStrategy,
  LayoutStrategyRegistry,
  LayoutSubtreeRequest,
  LayoutSubtreeResult,
} from './types'

function createLayoutBounds(nodes: readonly LayoutNode[]): LayoutBounds {
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function port(node: LayoutNode, side: LayoutPortSide): LayoutPort {
  switch (side) {
    case 'north':
      return { side, x: node.x + node.width / 2, y: node.y }
    case 'east':
      return { side, x: node.x + node.width, y: node.y + node.height / 2 }
    case 'south':
      return { side, x: node.x + node.width / 2, y: node.y + node.height }
    case 'west':
      return { side, x: node.x, y: node.y + node.height / 2 }
  }
}

function translate(
  result: LayoutSubtreeResult,
  x: number,
  y: number,
  logicalSide?: MindMapLogicalSide,
): LayoutSubtreeResult {
  const nodes = result.nodes.map((node) => ({
    ...node,
    ...(node.id === result.rootNodeId && logicalSide ? { logicalSide } : {}),
    x: node.x + x,
    y: node.y + y,
  }))
  return {
    ...result,
    nodes,
    edges: result.edges.map((edge) => ({
      ...edge,
      sourcePort: {
        ...edge.sourcePort,
        x: edge.sourcePort.x + x,
        y: edge.sourcePort.y + y,
      },
      targetPort: {
        ...edge.targetPort,
        x: edge.targetPort.x + x,
        y: edge.targetPort.y + y,
      },
      sourceX: edge.sourceX + x,
      sourceY: edge.sourceY + y,
      targetX: edge.targetX + x,
      targetY: edge.targetY + y,
    })),
    bounds: createLayoutBounds(nodes),
  }
}

function rootNode(request: LayoutSubtreeRequest): LayoutNode {
  return {
    id: request.rootNodeId,
    rootId: request.ownerRootNodeId,
    structure: request.structure,
    x: 0,
    y: 0,
    ...request.nodeSize,
  }
}

function childRoot(result: LayoutSubtreeResult): LayoutNode {
  const root = result.nodes.find((node) => node.id === result.rootNodeId)
  if (!root) throw new Error('Child layout is missing its root topic')
  return root
}

function edge(
  parent: LayoutNode,
  child: LayoutNode,
  structure: MindMapStructure,
  connectorShape: LayoutEdge['connectorShape'],
  sourceSide: LayoutPortSide,
  targetSide: LayoutPortSide,
): LayoutEdge {
  const sourcePort = port(parent, sourceSide)
  const targetPort = port(child, targetSide)
  return {
    id: `${parent.id}->${child.id}`,
    sourceId: parent.id,
    targetId: child.id,
    structure,
    connectorShape,
    sourcePort,
    targetPort,
    sourceX: sourcePort.x,
    sourceY: sourcePort.y,
    targetX: targetPort.x,
    targetY: targetPort.y,
  }
}

function result(
  request: LayoutSubtreeRequest,
  root: LayoutNode,
  children: readonly LayoutSubtreeResult[],
  edges: readonly LayoutEdge[],
): LayoutSubtreeResult {
  const nodes = [root, ...children.flatMap((child) => child.nodes)]
  return {
    rootNodeId: request.rootNodeId,
    ownerRootNodeId: request.ownerRootNodeId,
    structure: request.structure,
    nodes,
    edges: [...children.flatMap((child) => child.edges), ...edges],
    bounds: createLayoutBounds(nodes),
  }
}

function stackHeight(
  children: readonly LayoutSubtreeResult[],
  gap: number,
): number {
  return children.reduce(
    (height, child, index) =>
      height + child.bounds.height + (index === 0 ? 0 : gap),
    0,
  )
}

function horizontalStrategy(id: 'logic-right' | 'logic-left'): LayoutStrategy {
  const direction = id === 'logic-right' ? 'right' : 'left'
  return {
    id,
    direction,
    connectorShape: 'curve',
    layout(request) {
      const initialRoot = rootNode(request)
      const totalHeight = stackHeight(
        request.childResults,
        request.config.verticalGap,
      )
      const contentHeight = Math.max(initialRoot.height, totalHeight)
      const root = {
        ...initialRoot,
        y: (contentHeight - initialRoot.height) / 2,
      }
      let childTop = (contentHeight - totalHeight) / 2
      const children = request.childResults.map((child) => {
        const x =
          direction === 'right'
            ? root.x +
              root.width +
              request.config.horizontalGap -
              child.bounds.minX
            : root.x - request.config.horizontalGap - child.bounds.maxX
        const placed = translate(child, x, childTop - child.bounds.minY)
        childTop += child.bounds.height + request.config.verticalGap
        return placed
      })
      const connectors = children.map((child) =>
        edge(
          root,
          childRoot(child),
          request.structure,
          'curve',
          direction === 'right' ? 'east' : 'west',
          direction === 'right' ? 'west' : 'east',
        ),
      )
      return result(request, root, children, connectors)
    },
  }
}

function stableBalancedSides(
  childResults: readonly LayoutSubtreeResult[],
): ReadonlyMap<MindMapNodeId, MindMapLogicalSide> {
  const sortedIds = childResults
    .map(({ rootNodeId }) => rootNodeId)
    .sort((left, right) => left.localeCompare(right))
  return new Map(
    sortedIds.map((nodeId, index) => [
      nodeId,
      index % 2 === 0 ? 'right' : 'left',
    ]),
  )
}

const balancedStrategy: LayoutStrategy = {
  id: 'mind-map-balanced',
  direction: 'balanced',
  connectorShape: 'curve',
  layout(request) {
    const initialRoot = rootNode(request)
    const sides = stableBalancedSides(request.childResults)
    const right = request.childResults.filter(
      (child) => sides.get(child.rootNodeId) === 'right',
    )
    const left = request.childResults.filter(
      (child) => sides.get(child.rootNodeId) === 'left',
    )
    const rightHeight = stackHeight(right, request.config.verticalGap)
    const leftHeight = stackHeight(left, request.config.verticalGap)
    const contentHeight = Math.max(initialRoot.height, rightHeight, leftHeight)
    const root = {
      ...initialRoot,
      y: (contentHeight - initialRoot.height) / 2,
    }

    const placeSide = (
      children: readonly LayoutSubtreeResult[],
      logicalSide: MindMapLogicalSide,
    ): LayoutSubtreeResult[] => {
      let childTop =
        (contentHeight - stackHeight(children, request.config.verticalGap)) / 2
      return children.map((child) => {
        const x =
          logicalSide === 'right'
            ? root.x +
              root.width +
              request.config.horizontalGap -
              child.bounds.minX
            : root.x - request.config.horizontalGap - child.bounds.maxX
        const placed = translate(
          child,
          x,
          childTop - child.bounds.minY,
          logicalSide,
        )
        childTop += child.bounds.height + request.config.verticalGap
        return placed
      })
    }
    const placedChildren = [
      ...placeSide(right, 'right'),
      ...placeSide(left, 'left'),
    ]
    const placedById = new Map(
      placedChildren.map((child) => [child.rootNodeId, child]),
    )
    const children = request.childResults.map((child) => {
      const placed = placedById.get(child.rootNodeId)
      if (!placed) throw new Error('Balanced layout lost a child subtree')
      return placed
    })
    const connectors = children.map((child) => {
      const logicalSide = childRoot(child).logicalSide ?? 'right'
      return edge(
        root,
        childRoot(child),
        request.structure,
        'curve',
        logicalSide === 'right' ? 'east' : 'west',
        logicalSide === 'right' ? 'west' : 'east',
      )
    })
    return result(request, root, children, connectors)
  },
}

function verticalStrategy(id: 'tree-top' | 'org-top'): LayoutStrategy {
  const connectorShape = id === 'org-top' ? 'elbow' : 'curve'
  return {
    id,
    direction: 'down',
    connectorShape,
    layout(request) {
      const initialRoot = rootNode(request)
      const horizontalGap =
        id === 'org-top'
          ? Math.max(18, request.config.horizontalGap * 0.55)
          : request.config.horizontalGap
      const levelGap =
        id === 'org-top'
          ? Math.max(42, request.config.verticalGap * 1.8)
          : Math.max(42, request.config.verticalGap * 1.45)
      const totalWidth = request.childResults.reduce(
        (width, child, index) =>
          width + child.bounds.width + (index === 0 ? 0 : horizontalGap),
        0,
      )
      const contentWidth = Math.max(initialRoot.width, totalWidth)
      const root = {
        ...initialRoot,
        x: (contentWidth - initialRoot.width) / 2,
      }
      let childLeft = (contentWidth - totalWidth) / 2
      const children = request.childResults.map((child) => {
        const placed = translate(
          child,
          childLeft - child.bounds.minX,
          root.y + root.height + levelGap - child.bounds.minY,
        )
        childLeft += child.bounds.width + horizontalGap
        return placed
      })
      const connectors = children.map((child) =>
        edge(
          root,
          childRoot(child),
          request.structure,
          connectorShape,
          'south',
          'north',
        ),
      )
      return result(request, root, children, connectors)
    },
  }
}

export const defaultLayoutStrategyRegistry: LayoutStrategyRegistry = {
  'logic-right': horizontalStrategy('logic-right'),
  'logic-left': horizontalStrategy('logic-left'),
  'mind-map-balanced': balancedStrategy,
  'tree-top': verticalStrategy('tree-top'),
  'org-top': verticalStrategy('org-top'),
}
