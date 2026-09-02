import { defaultMindMapNodeStyle, defaultMindMapTheme } from './document'
import type {
  MindMapDocument,
  MindMapNode,
  MindMapNodeId,
  MindMapNodeStyle,
  MindMapNodeStyleOverride,
  MindMapTheme,
} from './model'
import { getDescendantNodeIds, getOwningRootNodeId } from './traversal'

export const mindMapNodeStyleKeys = [
  'backgroundColor',
  'borderColor',
  'textColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'textAlign',
  'shape',
  'borderWidth',
  'borderStyle',
  'branchColor',
  'branchWidth',
  'branchStyle',
  'branchShape',
  'fixedWidth',
] as const satisfies readonly (keyof MindMapNodeStyle)[]

const branchStyleKeys = [
  'branchColor',
  'branchWidth',
  'branchStyle',
  'branchShape',
] as const satisfies readonly (keyof MindMapNodeStyle)[]

export type MindMapStyleScope = 'current' | 'siblings' | 'descendants' | 'level'

export type SharedMindMapStyleValue<Value> =
  | { readonly state: 'empty' }
  | { readonly state: 'mixed' }
  | { readonly state: 'value'; readonly value: Value }

function cloneTheme(theme: MindMapTheme): MindMapTheme {
  return {
    ...theme,
    rootTopicStyle: { ...theme.rootTopicStyle },
    mainTopicStyle: { ...theme.mainTopicStyle },
    subtopicStyle: { ...theme.subtopicStyle },
  }
}

function definedStyleOverride(
  override: MindMapNodeStyleOverride,
): Partial<MindMapNodeStyle> {
  return Object.fromEntries(
    Object.entries(override).filter((entry) => entry[1] !== undefined),
  ) as Partial<MindMapNodeStyle>
}

export const mindMapThemePresets: readonly MindMapTheme[] = [
  cloneTheme(defaultMindMapTheme),
  {
    id: 'ocean',
    backgroundColor: '#ffffff',
    defaultFontFamily: 'Inter, system-ui, sans-serif',
    rootTopicStyle: {
      backgroundColor: '#0f6cbd',
      borderColor: '#0b5799',
      textColor: '#ffffff',
      fontSize: 18,
      shape: 'pill',
      branchColor: '#62a7df',
    },
    mainTopicStyle: {
      backgroundColor: '#e8f4ff',
      borderColor: '#4f9bd3',
      textColor: '#103f66',
      branchColor: '#62a7df',
    },
    subtopicStyle: { backgroundColor: '#ffffff', borderColor: '#9cc8e8' },
  },
  {
    id: 'forest',
    backgroundColor: '#ffffff',
    defaultFontFamily: 'Inter, system-ui, sans-serif',
    rootTopicStyle: {
      backgroundColor: '#2f7d4a',
      borderColor: '#236139',
      textColor: '#ffffff',
      fontSize: 18,
      branchColor: '#72ad83',
    },
    mainTopicStyle: {
      backgroundColor: '#e4f3e8',
      borderColor: '#64a679',
      textColor: '#214f30',
      branchColor: '#72ad83',
    },
    subtopicStyle: { backgroundColor: '#fbfefb', borderColor: '#9bcaaa' },
  },
  {
    id: 'sunset',
    backgroundColor: '#ffffff',
    defaultFontFamily: 'Georgia, Cambria, serif',
    rootTopicStyle: {
      backgroundColor: '#c85d3a',
      borderColor: '#a8492c',
      textColor: '#ffffff',
      fontSize: 18,
      branchColor: '#dc8a69',
    },
    mainTopicStyle: {
      backgroundColor: '#ffeadf',
      borderColor: '#dc8a69',
      textColor: '#71351f',
      branchColor: '#dc8a69',
    },
    subtopicStyle: { backgroundColor: '#fffdfb', borderColor: '#efb49c' },
  },
]

export function getMindMapThemePreset(id: string): MindMapTheme | undefined {
  const theme = mindMapThemePresets.find((preset) => preset.id === id)
  return theme ? cloneTheme(theme) : undefined
}

export function isValidMindMapNodeStyle(style: MindMapNodeStyle): boolean {
  return (
    style.backgroundColor.trim().length > 0 &&
    style.borderColor.trim().length > 0 &&
    style.textColor.trim().length > 0 &&
    style.fontFamily.trim().length > 0 &&
    Number.isFinite(style.fontSize) &&
    style.fontSize >= 8 &&
    style.fontSize <= 96 &&
    ['normal', 'medium', 'semibold', 'bold'].includes(style.fontWeight) &&
    ['normal', 'italic'].includes(style.fontStyle) &&
    ['none', 'line-through'].includes(style.textDecoration) &&
    ['left', 'center', 'right'].includes(style.textAlign) &&
    [
      'rounded-rectangle',
      'rectangle',
      'pill',
      'underline',
      'borderless',
    ].includes(style.shape) &&
    Number.isFinite(style.borderWidth) &&
    style.borderWidth >= 0 &&
    style.borderWidth <= 20 &&
    ['solid', 'dashed', 'dotted'].includes(style.borderStyle) &&
    style.branchColor.trim().length > 0 &&
    Number.isFinite(style.branchWidth) &&
    style.branchWidth >= 0 &&
    style.branchWidth <= 20 &&
    ['solid', 'dashed', 'dotted'].includes(style.branchStyle) &&
    ['curve', 'straight', 'elbow'].includes(style.branchShape) &&
    (style.fixedWidth === undefined ||
      (Number.isFinite(style.fixedWidth) &&
        style.fixedWidth >= 80 &&
        style.fixedWidth <= 800))
  )
}

export function isValidMindMapNodeStyleOverride(
  override: MindMapNodeStyleOverride,
): boolean {
  return isValidMindMapNodeStyle({
    ...defaultMindMapNodeStyle,
    ...definedStyleOverride(override),
  })
}

export function isValidMindMapTheme(theme: MindMapTheme): boolean {
  return (
    theme.id.trim().length > 0 &&
    theme.backgroundColor.trim().length > 0 &&
    theme.defaultFontFamily.trim().length > 0 &&
    isValidMindMapNodeStyleOverride(theme.rootTopicStyle) &&
    isValidMindMapNodeStyleOverride(theme.mainTopicStyle) &&
    isValidMindMapNodeStyleOverride(theme.subtopicStyle)
  )
}

export function getMindMapNodeDepth(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): number {
  let depth = 0
  const initialNode = document.nodes[nodeId]
  if (!initialNode) return -1
  let node: MindMapNode = initialNode
  while (node.parentId) {
    depth += 1
    const parent: MindMapNode | undefined = document.nodes[node.parentId]
    if (!parent) return -1
    node = parent
  }
  return depth
}

function getThemeRoleStyle(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNodeStyleOverride {
  if (nodeId === document.rootNodeId) return document.theme.rootTopicStyle
  const node = document.nodes[nodeId]
  if (
    !node ||
    node.parentId === null ||
    node.parentId === document.rootNodeId
  ) {
    return document.theme.mainTopicStyle
  }
  return document.theme.subtopicStyle
}

function getTopLevelBranchNodeId(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNodeId | undefined {
  const ownerRootId = getOwningRootNodeId(document, nodeId)
  const initialNode = document.nodes[nodeId]
  if (!initialNode || initialNode.id === ownerRootId) return undefined
  let current: MindMapNode = initialNode
  while (current.parentId && current.parentId !== ownerRootId) {
    const parent: MindMapNode | undefined = document.nodes[current.parentId]
    if (!parent) return undefined
    current = parent
  }
  return current.id
}

export function getComputedMindMapNodeStyle(
  document: MindMapDocument,
  nodeId: MindMapNodeId,
): MindMapNodeStyle {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Mind map node not found: ${nodeId}`)
  const branchRootId = getTopLevelBranchNodeId(document, nodeId)
  const inheritedBranchStyle: MindMapNodeStyleOverride = {}
  if (branchRootId && branchRootId !== nodeId) {
    const branchOverrides = document.nodes[branchRootId]?.styleOverrides ?? {}
    for (const key of branchStyleKeys) {
      const value = branchOverrides[key]
      if (value !== undefined) {
        Object.assign(inheritedBranchStyle, { [key]: value })
      }
    }
  }
  return {
    ...defaultMindMapNodeStyle,
    fontFamily: document.theme.defaultFontFamily,
    ...definedStyleOverride(getThemeRoleStyle(document, nodeId)),
    ...definedStyleOverride(inheritedBranchStyle),
    ...definedStyleOverride(node.styleOverrides),
  }
}

export function getComputedMindMapNodeStyles(
  document: MindMapDocument,
): Readonly<Record<MindMapNodeId, MindMapNodeStyle>> {
  return Object.fromEntries(
    Object.keys(document.nodes).map((nodeId) => [
      nodeId,
      getComputedMindMapNodeStyle(document, nodeId),
    ]),
  )
}

export function getSharedComputedMindMapStyleValue<
  Key extends keyof MindMapNodeStyle,
>(
  document: MindMapDocument,
  nodeIds: readonly MindMapNodeId[],
  key: Key,
): SharedMindMapStyleValue<MindMapNodeStyle[Key]> {
  const styles = nodeIds.flatMap((nodeId) =>
    document.nodes[nodeId]
      ? [getComputedMindMapNodeStyle(document, nodeId)]
      : [],
  )
  if (styles.length === 0) return { state: 'empty' }
  const value = styles[0]![key]
  return styles.every((style) => Object.is(style[key], value))
    ? { state: 'value', value }
    : { state: 'mixed' }
}

export function getMindMapStyleScopeNodeIds(
  document: MindMapDocument,
  anchorNodeIds: readonly MindMapNodeId[],
  scope: MindMapStyleScope,
): MindMapNodeId[] {
  const anchors = [...new Set(anchorNodeIds)].filter(
    (nodeId) => document.nodes[nodeId],
  )
  if (scope === 'current') return anchors
  const result = new Set<MindMapNodeId>()
  if (scope === 'siblings') {
    for (const nodeId of anchors) {
      const node = document.nodes[nodeId]!
      if (!node.parentId) result.add(nodeId)
      else
        document.nodes[node.parentId]?.childIds.forEach((id) => result.add(id))
    }
  } else if (scope === 'descendants') {
    anchors.forEach((nodeId) =>
      getDescendantNodeIds(document, nodeId).forEach((id) => result.add(id)),
    )
  } else {
    const depths = new Set(
      anchors.map((nodeId) => getMindMapNodeDepth(document, nodeId)),
    )
    for (const nodeId of Object.keys(document.nodes)) {
      if (depths.has(getMindMapNodeDepth(document, nodeId))) result.add(nodeId)
    }
  }
  return [...result]
}
