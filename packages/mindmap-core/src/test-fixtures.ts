import {
  createMindMapDocument,
  createMindMapNode,
  defaultMindMapCalloutStyle,
} from './document'
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
      ...firstChild.style,
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

export function createFiftyNodeFixture(): MindMapDocument {
  const document = createRootOnlyFixture()

  for (let index = 1; index <= 50; index += 1) {
    const parentId =
      index <= 10 ? document.rootNodeId : `keyboard-${Math.floor(index / 10)}`
    const nodeId = `keyboard-${index}`
    appendFixtureNode(
      document,
      parentId,
      createMindMapNode({ id: nodeId, parentId, text: `Keyboard ${index}` }),
    )
  }

  return document
}

export function createFloatingForestFixture(): MindMapDocument {
  const document = createWideTreeFixture(2)
  const floatingRootId = 'floating-root'
  const floatingChildId = 'floating-child'
  const secondFloatingRootId = 'floating-root-2'
  document.nodes[floatingRootId] = createMindMapNode({
    id: floatingRootId,
    parentId: null,
    childIds: [floatingChildId],
    text: 'Floating idea',
  })
  document.nodes[floatingChildId] = createMindMapNode({
    id: floatingChildId,
    parentId: floatingRootId,
    text: 'Floating detail',
  })
  document.floatingTopics[floatingRootId] = {
    x: 640,
    y: -160,
    structure: 'tree-top',
  }
  document.nodes[secondFloatingRootId] = createMindMapNode({
    id: secondFloatingRootId,
    parentId: null,
    text: 'Second floating idea',
  })
  document.floatingTopics[secondFloatingRootId] = {
    x: -480,
    y: 220,
    structure: 'logic-right',
  }
  return document
}

export function createV3FeatureFixture(): MindMapDocument {
  const document = createFloatingForestFixture()
  document.defaultStructure = 'mind-map-balanced'
  document.structureOverrides['wide-1'] = 'org-top'
  document.structureOverrides['wide-2'] = 'logic-left'
  document.labels['label-roadmap'] = {
    id: 'label-roadmap',
    name: 'Roadmap',
    color: '#7c3aed',
    order: 1,
  }
  document.nodes['wide-1']!.labelIds = ['label-roadmap']
  document.nodes.root!.numbering = {
    style: 'decimal',
    mode: 'hierarchical',
    startAt: 1,
  }
  document.assets['asset-image'] = {
    id: 'asset-image',
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 128,
    checksum: 'sha256:fixture-image',
    intrinsicWidth: 320,
    intrinsicHeight: 180,
    createdAt: fixtureTime,
  }
  document.nodes['wide-1']!.contentBlocks = [
    {
      id: 'content-image',
      type: 'image',
      assetId: 'asset-image',
      width: 240,
      altText: 'Roadmap preview',
      preserveAspectRatio: true,
    },
    {
      id: 'content-equation',
      type: 'equation',
      source: String.raw`E = mc^2`,
      displayMode: 'block',
    },
  ]
  document.callouts.push({
    id: 'callout-1',
    ownerNodeId: 'wide-1',
    text: 'Review this branch',
    placement: 'right',
    offset: { x: 32, y: -16 },
    style: { ...defaultMindMapCalloutStyle },
  })
  return document
}

export function createMalformedV3Fixtures(): Record<
  | 'unregisteredRoot'
  | 'multipleParents'
  | 'parentCycle'
  | 'invalidAssetReference'
  | 'duplicateCalloutOwner',
  MindMapDocument
> {
  const unregisteredRoot = createFloatingForestFixture()
  delete unregisteredRoot.floatingTopics['floating-root']

  const multipleParents = createWideTreeFixture(2)
  const shared = createMindMapNode({
    id: 'shared-child',
    parentId: 'wide-1',
    text: 'Shared child',
  })
  multipleParents.nodes[shared.id] = shared
  multipleParents.nodes['wide-1']!.childIds.push(shared.id)
  multipleParents.nodes['wide-2']!.childIds.push(shared.id)

  const parentCycle = createDeepTreeFixture(2)
  parentCycle.nodes.root!.parentId = 'deep-2'
  parentCycle.nodes['deep-2']!.childIds.push('root')

  const invalidAssetReference = createV3FeatureFixture()
  const imageBlock = invalidAssetReference.nodes['wide-1']?.contentBlocks.find(
    (block) => block.type === 'image',
  )
  if (!imageBlock || imageBlock.type !== 'image') {
    throw new Error('Missing fixture image block')
  }
  imageBlock.assetId = 'missing-asset'

  const duplicateCalloutOwner = createV3FeatureFixture()
  duplicateCalloutOwner.callouts.push({
    ...duplicateCalloutOwner.callouts[0]!,
    id: 'callout-duplicate',
    offset: { ...duplicateCalloutOwner.callouts[0]!.offset },
    style: { ...duplicateCalloutOwner.callouts[0]!.style },
  })

  return {
    unregisteredRoot,
    multipleParents,
    parentCycle,
    invalidAssetReference,
    duplicateCalloutOwner,
  }
}
