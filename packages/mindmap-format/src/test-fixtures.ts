export const legacyV1MindMapDocumentFixture = {
  schemaVersion: 1,
  id: 'legacy-map',
  title: 'Legacy map',
  rootNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      parentId: null,
      childIds: ['child'],
      text: 'Legacy map',
      collapsed: false,
      markers: ['priority:1'],
      notes: '',
      links: [],
      style: {
        backgroundColor: '#ffffff',
        borderColor: '#7c6ff2',
        textColor: '#1e1b4b',
      },
    },
    child: {
      id: 'child',
      parentId: 'root',
      childIds: [],
      text: 'Legacy child',
      collapsed: false,
      markers: ['icon:star'],
      notes: '',
      links: [],
      style: {
        backgroundColor: '#ffffff',
        borderColor: '#7c6ff2',
        textColor: '#1e1b4b',
      },
    },
  },
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
} as const

export const malformedMindMapImportFixtures = {
  missingRoot: {
    ...legacyV1MindMapDocumentFixture,
    rootNodeId: 'missing-root',
  },
  duplicateChild: {
    ...legacyV1MindMapDocumentFixture,
    nodes: {
      ...legacyV1MindMapDocumentFixture.nodes,
      root: {
        ...legacyV1MindMapDocumentFixture.nodes.root,
        childIds: ['child', 'child'],
      },
    },
  },
  parentCycle: {
    ...legacyV1MindMapDocumentFixture,
    rootNodeId: 'root',
    nodes: {
      ...legacyV1MindMapDocumentFixture.nodes,
      root: {
        ...legacyV1MindMapDocumentFixture.nodes.root,
        parentId: 'child',
      },
      child: {
        ...legacyV1MindMapDocumentFixture.nodes.child,
        childIds: ['root'],
      },
    },
  },
} as const

export const legacyV2MindMapDocumentFixture = {
  schemaVersion: 2,
  id: 'legacy-v2-map',
  title: 'Legacy v2 map',
  rootNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      parentId: null,
      childIds: ['child'],
      text: 'Legacy v2 map',
      collapsed: false,
      markers: [{ kind: 'priority', value: '1' }],
      notes: 'Root note',
      links: [],
      style: {
        backgroundColor: '#ffffff',
        borderColor: '#7c6ff2',
        textColor: '#1e1b4b',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        shape: 'pill',
      },
    },
    child: {
      id: 'child',
      parentId: 'root',
      childIds: [],
      text: 'Legacy v2 child',
      collapsed: true,
      markers: [{ kind: 'icon', value: 'star' }],
      notes: '',
      links: [{ label: 'Reference', url: 'https://example.test' }],
      style: {
        backgroundColor: '#eefbf6',
        borderColor: '#20a779',
        textColor: '#0d5f46',
      },
    },
  },
  relationships: [
    {
      id: 'legacy-relationship',
      fromNodeId: 'root',
      toNodeId: 'child',
      label: 'supports',
    },
  ],
  boundaries: [
    {
      id: 'legacy-boundary',
      nodeIds: ['root', 'child'],
      label: 'Scope',
    },
  ],
  summaries: [
    {
      id: 'legacy-summary',
      nodeIds: ['root', 'child'],
      label: 'Summary',
    },
  ],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
} as const

export const malformedV3FixtureMutations = {
  unregisteredRoot: 'unregistered-root',
  duplicateOwnership: 'duplicate-ownership',
  invalidAssetReference: 'invalid-asset-reference',
  duplicateCalloutOwner: 'duplicate-callout-owner',
  unsupportedStructure: 'unsupported-structure',
  invalidEquationSource: String.raw`\not-a-real-command{`,
  dangerousSvg: '<svg><script>alert(1)</script></svg>',
} as const
