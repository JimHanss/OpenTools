import { createMindMapDocument, createMindMapNode } from './document'
import type { MindMapDocument, MindMapNode } from './model'

const fixtureTime = '2026-07-12T00:00:00.000Z'

function appendFixtureNode(
  document: MindMapDocument,
  parentId: string,
  node: MindMapNode,
): void {
  const parent = document.nodes[parentId]
  if (!parent) throw new Error(`Fixture parent not found: ${parentId}`)

  parent.childIds.push(node.id)
  document.nodes[node.id] = node
}

export function createRootOnlyFixture(): MindMapDocument {
  return createMindMapDocument({
    id: 'fixture-root-only',
    rootNodeId: 'root',
    title: 'Root topic',
    now: fixtureTime,
  })
}

export function createDeepTreeFixture(depth = 5): MindMapDocument {
  const document = createRootOnlyFixture()
  let parentId = document.rootNodeId

  for (let level = 1; level <= depth; level += 1) {
    const nodeId = `deep-${level}`
    appendFixtureNode(
      document,
      parentId,
      createMindMapNode({ id: nodeId, parentId, text: `Depth ${level}` }),
    )
    parentId = nodeId
  }

  return document
}

export function createWideTreeFixture(width = 8): MindMapDocument {
  const document = createRootOnlyFixture()

  for (let index = 1; index <= width; index += 1) {
    const nodeId = `wide-${index}`
    appendFixtureNode(
      document,
      document.rootNodeId,
      createMindMapNode({
        id: nodeId,
        parentId: document.rootNodeId,
        text: `Wide ${index}`,
      }),
    )
  }

  return document
}

export function createCollapsedTreeFixture(): MindMapDocument {
  const document = createDeepTreeFixture(3)
  const collapsedNode = document.nodes['deep-1']
  if (collapsedNode) collapsedNode.collapsed = true
  return document
}

export function createStyledTreeFixture(): MindMapDocument {
  const document = createWideTreeFixture(2)
  const firstChild = document.nodes['wide-1']
  if (firstChild) {
    firstChild.style = {
      backgroundColor: '#eefbf6',
      borderColor: '#20a779',
      textColor: '#0d5f46',
      fontSize: 16,
      fontWeight: 'bold',
      fontStyle: 'italic',
      shape: 'pill',
    }
    firstChild.markers = [
      { kind: 'priority', value: '1' },
      { kind: 'status', value: 'in-progress' },
      { kind: 'icon', value: 'star' },
    ]
    firstChild.notes = 'Styled fixture note'
    firstChild.links = [{ label: 'OpenTools', url: 'https://example.test' }]
  }
  return document
}

export function createFiveHundredNodeFixture(): MindMapDocument {
  const document = createRootOnlyFixture()

  for (let index = 1; index <= 500; index += 1) {
    const parentId =
      index <= 20 ? document.rootNodeId : `node-${Math.floor(index / 20)}`
    const nodeId = `node-${index}`
    appendFixtureNode(
      document,
      parentId,
      createMindMapNode({ id: nodeId, parentId, text: `Node ${index}` }),
    )
  }

  return document
}
