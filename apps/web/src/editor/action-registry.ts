import type { MindMapDocument } from '@opentools/mindmap-core'

import type { EditorBranchFocusState } from './focus'
import type { EditorSelectionTarget } from './selection'

export const editorActionIds = {
  undo: 'history.undo',
  redo: 'history.redo',
  createSibling: 'topic.create-sibling',
  createChild: 'topic.create-child',
  edit: 'topic.edit',
  duplicate: 'topic.duplicate',
  delete: 'topic.delete',
  collapse: 'topic.collapse',
  copy: 'topic.copy',
  cut: 'topic.cut',
  paste: 'topic.paste',
  selectAll: 'topic.select-all',
  insertParent: 'topic.insert-parent',
  deleteKeepChildren: 'topic.delete-keep-children',
  movePrevious: 'topic.move-previous',
  moveNext: 'topic.move-next',
  promote: 'topic.promote',
  demote: 'topic.demote',
  convertToFloatingTopic: 'topic.convert-to-floating',
  focusBranch: 'topic.focus-branch',
  exitFocus: 'topic.exit-focus',
  tidy: 'structure.tidy',
  logicRight: 'structure.logic-right',
  logicLeft: 'structure.logic-left',
  mindMapBalanced: 'structure.mind-map-balanced',
  treeTop: 'structure.tree-top',
  orgTop: 'structure.org-top',
  insertFloatingTopic: 'insert.floating-topic',
  insertMarker: 'insert.marker',
  insertLabel: 'insert.label',
  insertCallout: 'insert.callout',
  insertRelationship: 'insert.relationship',
  insertBoundary: 'insert.boundary',
  insertSummary: 'insert.summary',
  insertNotes: 'insert.notes',
  insertLink: 'insert.link',
  insertImage: 'insert.image',
  insertEquation: 'insert.equation',
  copyStyle: 'style.copy',
  pasteStyle: 'style.paste',
  resetStyle: 'style.reset',
  openStyle: 'style.open',
  themeClassic: 'style.theme-classic',
  themeOcean: 'style.theme-ocean',
  themeForest: 'style.theme-forest',
  themeSunset: 'style.theme-sunset',
  zoomIn: 'view.zoom-in',
  zoomOut: 'view.zoom-out',
  fit: 'view.fit',
  center: 'view.center',
  importJson: 'file.import-json',
  exportJson: 'file.export-json',
  exportSvg: 'file.export-svg',
  exportPng: 'file.export-png',
} as const

export type EditorActionId =
  (typeof editorActionIds)[keyof typeof editorActionIds]

export type EditorActionGroup =
  'History' | 'Topic' | 'Structure' | 'Insert' | 'Style' | 'View' | 'File'

export type EditorActionKind = 'command' | 'ui' | 'platform'

export interface EditorActionDescriptor {
  readonly id: EditorActionId
  readonly group: EditorActionGroup
  readonly kind: EditorActionKind
  readonly labelKey: string
  readonly shortcut?: string | undefined
}

export interface EditorActionRuntime {
  readonly document: MindMapDocument
  readonly selection: EditorSelectionTarget
  readonly branchFocus: EditorBranchFocusState
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly isBusy: boolean
  readonly pendingActionIds: ReadonlySet<EditorActionId>
  readonly hasStyleClipboard: boolean
  readonly handlers: Partial<
    Record<EditorActionId, () => unknown | Promise<unknown>>
  >
}

export interface ResolvedEditorAction extends EditorActionDescriptor {
  readonly visible: boolean
  readonly enabled: boolean
  readonly active: boolean
  readonly pending: boolean
  readonly disabledReasonKey?: string | undefined
}

export type EditorActionDispatchResult =
  | {
      readonly status: 'executed'
      readonly id: EditorActionId
      readonly value: unknown
    }
  | {
      readonly status: 'disabled'
      readonly id: EditorActionId
      readonly reasonKey: string
    }

function action(
  id: EditorActionId,
  group: EditorActionGroup,
  kind: EditorActionKind,
  shortcut?: string,
): EditorActionDescriptor {
  return {
    id,
    group,
    kind,
    labelKey: `actions.${id}.label`,
    ...(shortcut ? { shortcut } : {}),
  }
}

export const editorActionDescriptors = [
  action(editorActionIds.undo, 'History', 'command', 'Ctrl/⌘+Z'),
  action(editorActionIds.redo, 'History', 'command', 'Ctrl/⌘+Shift+Z'),
  action(editorActionIds.createSibling, 'Topic', 'command', 'Enter'),
  action(editorActionIds.createChild, 'Topic', 'command', 'Tab'),
  action(editorActionIds.edit, 'Topic', 'ui', 'F2'),
  action(editorActionIds.duplicate, 'Topic', 'command', 'Ctrl/⌘+D'),
  action(editorActionIds.delete, 'Topic', 'command', 'Delete'),
  action(editorActionIds.collapse, 'Topic', 'command'),
  action(editorActionIds.copy, 'Topic', 'platform', 'Ctrl/⌘+C'),
  action(editorActionIds.cut, 'Topic', 'platform', 'Ctrl/⌘+X'),
  action(editorActionIds.paste, 'Topic', 'platform', 'Ctrl/⌘+V'),
  action(editorActionIds.selectAll, 'Topic', 'ui', 'Ctrl/⌘+A'),
  action(editorActionIds.insertParent, 'Topic', 'command'),
  action(editorActionIds.deleteKeepChildren, 'Topic', 'command'),
  action(editorActionIds.movePrevious, 'Topic', 'command', 'Alt+↑'),
  action(editorActionIds.moveNext, 'Topic', 'command', 'Alt+↓'),
  action(editorActionIds.promote, 'Topic', 'command', 'Alt+←'),
  action(editorActionIds.demote, 'Topic', 'command', 'Alt+→'),
  action(editorActionIds.convertToFloatingTopic, 'Topic', 'command'),
  action(editorActionIds.focusBranch, 'Topic', 'ui'),
  action(editorActionIds.exitFocus, 'Topic', 'ui'),
  action(editorActionIds.tidy, 'Structure', 'command'),
  action(editorActionIds.logicRight, 'Structure', 'command'),
  action(editorActionIds.logicLeft, 'Structure', 'command'),
  action(editorActionIds.mindMapBalanced, 'Structure', 'command'),
  action(editorActionIds.treeTop, 'Structure', 'command'),
  action(editorActionIds.orgTop, 'Structure', 'command'),
  action(editorActionIds.insertFloatingTopic, 'Insert', 'command'),
  action(editorActionIds.insertMarker, 'Insert', 'ui'),
  action(editorActionIds.insertLabel, 'Insert', 'ui'),
  action(editorActionIds.insertCallout, 'Insert', 'command'),
  action(editorActionIds.insertRelationship, 'Insert', 'command'),
  action(editorActionIds.insertBoundary, 'Insert', 'command'),
  action(editorActionIds.insertSummary, 'Insert', 'command'),
  action(editorActionIds.insertNotes, 'Insert', 'ui'),
  action(editorActionIds.insertLink, 'Insert', 'ui'),
  action(editorActionIds.insertImage, 'Insert', 'platform'),
  action(editorActionIds.insertEquation, 'Insert', 'ui'),
  action(editorActionIds.copyStyle, 'Style', 'ui'),
  action(editorActionIds.pasteStyle, 'Style', 'command'),
  action(editorActionIds.resetStyle, 'Style', 'command'),
  action(editorActionIds.openStyle, 'Style', 'ui'),
  action(editorActionIds.themeClassic, 'Style', 'command'),
  action(editorActionIds.themeOcean, 'Style', 'command'),
  action(editorActionIds.themeForest, 'Style', 'command'),
  action(editorActionIds.themeSunset, 'Style', 'command'),
  action(editorActionIds.zoomIn, 'View', 'ui', 'Ctrl/⌘++'),
  action(editorActionIds.zoomOut, 'View', 'ui', 'Ctrl/⌘+-'),
  action(editorActionIds.fit, 'View', 'ui'),
  action(editorActionIds.center, 'View', 'ui'),
  action(editorActionIds.importJson, 'File', 'platform'),
  action(editorActionIds.exportJson, 'File', 'platform'),
  action(editorActionIds.exportSvg, 'File', 'platform'),
  action(editorActionIds.exportPng, 'File', 'platform'),
] as const satisfies readonly EditorActionDescriptor[]

const descriptorsById = new Map(
  editorActionDescriptors.map((descriptor) => [descriptor.id, descriptor]),
)

const topicSelectionActions = new Set<EditorActionId>([
  editorActionIds.createSibling,
  editorActionIds.createChild,
  editorActionIds.edit,
  editorActionIds.duplicate,
  editorActionIds.delete,
  editorActionIds.collapse,
  editorActionIds.copy,
  editorActionIds.cut,
  editorActionIds.insertParent,
  editorActionIds.deleteKeepChildren,
  editorActionIds.movePrevious,
  editorActionIds.moveNext,
  editorActionIds.promote,
  editorActionIds.demote,
  editorActionIds.convertToFloatingTopic,
  editorActionIds.focusBranch,
  editorActionIds.insertMarker,
  editorActionIds.insertLabel,
  editorActionIds.insertCallout,
  editorActionIds.insertNotes,
  editorActionIds.insertLink,
  editorActionIds.insertImage,
  editorActionIds.insertEquation,
  editorActionIds.copyStyle,
  editorActionIds.resetStyle,
  editorActionIds.openStyle,
])

const multiTopicSelectionActions = new Set<EditorActionId>([
  editorActionIds.delete,
  editorActionIds.copy,
  editorActionIds.cut,
  editorActionIds.duplicate,
  editorActionIds.copyStyle,
  editorActionIds.resetStyle,
])

const rootProtectedActions = new Set<EditorActionId>([
  editorActionIds.delete,
  editorActionIds.cut,
  editorActionIds.insertParent,
  editorActionIds.deleteKeepChildren,
  editorActionIds.promote,
  editorActionIds.movePrevious,
  editorActionIds.moveNext,
  editorActionIds.convertToFloatingTopic,
])

function selectedTopicIds(runtime: EditorActionRuntime): readonly string[] {
  return runtime.selection.kind === 'topic' ? runtime.selection.ids : []
}

function activeStructureId(runtime: EditorActionRuntime): string {
  const nodeId = selectedTopicIds(runtime)[0]
  return (
    (nodeId ? runtime.document.structureOverrides[nodeId] : undefined) ??
    runtime.document.defaultStructure
  )
}

function resolveDisabledReason(
  descriptor: EditorActionDescriptor,
  runtime: EditorActionRuntime,
): string | undefined {
  if (runtime.isBusy) return 'actions.disabled.busy'
  if (runtime.pendingActionIds.has(descriptor.id)) {
    return 'actions.disabled.pending'
  }
  if (!runtime.handlers[descriptor.id]) return 'actions.disabled.unavailable'
  if (descriptor.id === editorActionIds.undo && !runtime.canUndo) {
    return 'actions.disabled.noUndo'
  }
  if (descriptor.id === editorActionIds.redo && !runtime.canRedo) {
    return 'actions.disabled.noRedo'
  }
  if (descriptor.id === editorActionIds.exitFocus) {
    return runtime.branchFocus.rootNodeId
      ? undefined
      : 'actions.disabled.noBranchFocus'
  }
  if (descriptor.id === editorActionIds.pasteStyle) {
    if (!runtime.hasStyleClipboard) return 'actions.disabled.noStyleClipboard'
  }
  if (
    descriptor.id === editorActionIds.paste &&
    runtime.selection.kind !== 'none' &&
    runtime.selection.kind !== 'topic'
  ) {
    return 'actions.disabled.selectTopic'
  }
  if (descriptor.id === editorActionIds.insertRelationship) {
    return selectedTopicIds(runtime).length === 2
      ? undefined
      : 'actions.disabled.selectTwoTopics'
  }
  if (
    descriptor.id === editorActionIds.insertBoundary ||
    descriptor.id === editorActionIds.insertSummary
  ) {
    return selectedTopicIds(runtime).length >= 2
      ? undefined
      : 'actions.disabled.selectTwoTopics'
  }
  if (topicSelectionActions.has(descriptor.id)) {
    const ids = selectedTopicIds(runtime)
    if (
      descriptor.id === editorActionIds.delete &&
      ['relationship', 'boundary', 'summary', 'callout'].includes(
        runtime.selection.kind,
      )
    ) {
      return undefined
    }
    if (ids.length === 0) return 'actions.disabled.selectTopic'
    if (
      descriptor.id === editorActionIds.collapse &&
      runtime.document.nodes[ids[0]!]?.childIds.length === 0
    ) {
      return 'actions.disabled.noChildren'
    }
    if (
      descriptor.id === editorActionIds.insertCallout &&
      runtime.document.callouts.some(
        (callout) => callout.ownerNodeId === ids[0],
      )
    ) {
      return 'actions.disabled.hasCallout'
    }
    const requiresSingle = !multiTopicSelectionActions.has(descriptor.id)
    if (requiresSingle && ids.length !== 1) {
      return 'actions.disabled.selectOneTopic'
    }
    if (
      rootProtectedActions.has(descriptor.id) &&
      ids.includes(runtime.document.rootNodeId)
    ) {
      return 'actions.disabled.rootProtected'
    }
    if (
      descriptor.id === editorActionIds.convertToFloatingTopic &&
      runtime.document.floatingTopics[ids[0]!]
    ) {
      return 'actions.disabled.alreadyFloatingTopic'
    }
  }
  return undefined
}

function isActionActive(
  descriptor: EditorActionDescriptor,
  runtime: EditorActionRuntime,
): boolean {
  const nodeId = selectedTopicIds(runtime)[0]
  if (descriptor.id === editorActionIds.collapse) {
    return Boolean(nodeId && runtime.document.nodes[nodeId]?.collapsed)
  }
  if (descriptor.id === editorActionIds.focusBranch) {
    return Boolean(nodeId && runtime.branchFocus.rootNodeId === nodeId)
  }
  if (descriptor.id === editorActionIds.themeClassic) {
    return runtime.document.theme.id === 'classic'
  }
  if (descriptor.id === editorActionIds.themeOcean) {
    return runtime.document.theme.id === 'ocean'
  }
  if (descriptor.id === editorActionIds.themeForest) {
    return runtime.document.theme.id === 'forest'
  }
  if (descriptor.id === editorActionIds.themeSunset) {
    return runtime.document.theme.id === 'sunset'
  }
  const structure = activeStructureId(runtime)
  return (
    (descriptor.id === editorActionIds.logicRight &&
      structure === 'logic-right') ||
    (descriptor.id === editorActionIds.logicLeft &&
      structure === 'logic-left') ||
    (descriptor.id === editorActionIds.mindMapBalanced &&
      structure === 'mind-map-balanced') ||
    (descriptor.id === editorActionIds.treeTop && structure === 'tree-top') ||
    (descriptor.id === editorActionIds.orgTop && structure === 'org-top')
  )
}

export class EditorActionRegistry {
  get(id: EditorActionId): EditorActionDescriptor {
    const descriptor = descriptorsById.get(id)
    if (!descriptor) throw new Error(`Unknown editor action: ${id}`)
    return descriptor
  }

  list(group?: EditorActionGroup): readonly EditorActionDescriptor[] {
    return group
      ? editorActionDescriptors.filter((item) => item.group === group)
      : editorActionDescriptors
  }

  resolve(
    id: EditorActionId,
    runtime: EditorActionRuntime,
  ): ResolvedEditorAction {
    const descriptor = this.get(id)
    const disabledReasonKey = resolveDisabledReason(descriptor, runtime)
    return {
      ...descriptor,
      visible: true,
      enabled: !disabledReasonKey,
      active: isActionActive(descriptor, runtime),
      pending: runtime.pendingActionIds.has(id),
      ...(disabledReasonKey ? { disabledReasonKey } : {}),
    }
  }
}

export class EditorActionDispatcher {
  readonly registry: EditorActionRegistry
  readonly #getRuntime: () => EditorActionRuntime

  constructor(
    getRuntime: () => EditorActionRuntime,
    registry = new EditorActionRegistry(),
  ) {
    this.#getRuntime = getRuntime
    this.registry = registry
  }

  resolve(id: EditorActionId): ResolvedEditorAction {
    return this.registry.resolve(id, this.#getRuntime())
  }

  async dispatch(id: EditorActionId): Promise<EditorActionDispatchResult> {
    const runtime = this.#getRuntime()
    const resolved = this.registry.resolve(id, runtime)
    if (!resolved.enabled) {
      return {
        status: 'disabled',
        id,
        reasonKey: resolved.disabledReasonKey ?? 'actions.disabled.unavailable',
      }
    }
    const handler = runtime.handlers[id]
    if (!handler) {
      return {
        status: 'disabled',
        id,
        reasonKey: 'actions.disabled.unavailable',
      }
    }
    return { status: 'executed', id, value: await handler() }
  }
}
