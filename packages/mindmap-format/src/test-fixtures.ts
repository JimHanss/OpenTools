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
