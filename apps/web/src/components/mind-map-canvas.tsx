import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'

import {
  createMindMapClipboardPayload,
  buildMindMapStructureEdit,
  duplicateMindMapClipboardPayload,
  findNodeIdsByText,
  getAncestorNodeIds,
  getDescendantNodeIds,
  getComputedMindMapNodeStyle,
  mindMapCommandTypes,
  normalizeTopLevelNodeSelection,
  queryMindMap,
  type CommandResult,
  type MindMapClipboardPayload,
  type MindMapCommand,
  type MindMapId,
  type MindMapNodeId,
} from '@opentools/mindmap-core'
import {
  defaultLayoutConfig,
  estimateMindMapNodeSize,
  layoutMindMap,
  layoutMindMapSubtree,
  measureMindMapTopicText,
  type MindMapLayoutResult,
} from '@opentools/mindmap-layout'
import {
  createMindMapSvgScene,
  getMindMapEquationRenderKey,
  type RenderableMindMapEquation,
  type RenderableMindMapAsset,
} from '@opentools/mindmap-renderer-svg'

import {
  createBatchMoveCommand,
  createChildNodeCommand,
  createDeleteNodesCommand,
  createSiblingNodeCommand,
} from '../editor/actions'
import {
  editorActionIds,
  type EditorActionDispatcher,
  type EditorActionId,
} from '../editor/action-registry'
import { getEditorKeyboardShortcut } from '../editor/keyboard'
import { getTopicDropPlacement } from '../editor/drop-placement'
import { editorCanvasBackgroundColor } from '../editor/presentation'
import { measureBrowserMindMapTopicText } from '../platform/text-measurement'
import {
  createEditorBranchFocus,
  emptyEditorBranchFocusState,
  isNodeInsideBranchFocus,
  restoreSelectionAfterBranchFocus,
} from '../editor/focus'
import type { EditorSessionSnapshot } from '../editor/session'
import {
  createEditorSelectionRect,
  getIntersectingEditorTopicIds,
  getSelectedTopicIds,
  reconcileEditorSelection,
} from '../editor/selection'
import { useEditorUiStore, type EditorViewport } from '../editor/store'
import {
  localizedMessage,
  translateMessage,
  type LocalizedMessage,
} from '../i18n/messages'
import {
  getLocalizedMarkerAriaLabel,
  localizeMindMapSvgScene,
} from '../i18n/scene'
import {
  centerViewportOnRect,
  createViewportCoordinateAdapter,
  fitViewportToRect,
  panViewport,
  zoomViewportAtPoint,
  type CanvasPoint,
  type CanvasRect,
  type ViewportSize,
} from '../editor/viewport'
import {
  ClipboardUnavailableError,
  createBrowserMindMapClipboardAdapter,
} from '../platform/clipboard'
import { createPlatformId } from '../platform/ids'

export interface MindMapCanvasProps {
  readonly actionDispatcher: EditorActionDispatcher
  readonly actionHandlers: Partial<
    Record<EditorActionId, () => unknown | Promise<unknown>>
  >
  readonly onActionHandlersChange: () => void
  readonly assets?: Readonly<Record<string, RenderableMindMapAsset>>
  readonly equations?: Readonly<Record<string, RenderableMindMapEquation>>
  readonly onExecute: (command: MindMapCommand) => CommandResult | undefined
  readonly session: EditorSessionSnapshot
}

interface TextDraft {
  readonly nodeId: MindMapNodeId
  readonly value: string
}

interface CanvasContextMenuState {
  readonly x: number
  readonly y: number
}

interface ActivePointerInteraction {
  readonly appendSelection?: boolean
  readonly initialSelectedNodeIds?: readonly MindMapNodeId[]
  readonly nodeIds?: readonly MindMapNodeId[]
  readonly enhancementId?: string
  readonly controlPointIndex?: number
  readonly startOffset?: CanvasPoint
  readonly pointerId: number
  readonly startClientPoint: CanvasPoint
  readonly startScenePoint?: CanvasPoint
  readonly startViewport: EditorViewport
  readonly type: 'callout' | 'drag' | 'marquee' | 'pan' | 'relationship-control'
  readonly usesSecondaryButton?: boolean
}

interface MarqueeSelectionState {
  readonly nodeIds: readonly MindMapNodeId[]
  readonly rect: CanvasRect
}

interface TopicDragVisualState {
  readonly clientPoint: CanvasPoint
  readonly nodeIds: readonly MindMapNodeId[]
  readonly sourceNodeId: MindMapNodeId
}

type EnhancementDragPreview =
  | {
      readonly kind: 'callout'
      readonly id: string
      readonly offset: CanvasPoint
    }
  | {
      readonly kind: 'relationship-control'
      readonly id: string
      readonly index: number
      readonly offset: CanvasPoint
    }

interface SceneNodeBounds extends CanvasRect {
  readonly id: MindMapNodeId
}

const emptyCanvasSize: ViewportSize = { width: 0, height: 0 }
const quickCreateButtonSize = 20
const quickCreateButtonGap = 6

function getSceneNodeAtPoint(
  sceneNodes: readonly SceneNodeBounds[],
  point: CanvasPoint,
): SceneNodeBounds | undefined {
  return sceneNodes.find(
    (node) =>
      point.x >= node.x &&
      point.x <= node.x + node.width &&
      point.y >= node.y &&
      point.y <= node.y + node.height,
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function getSelectionOrRoot(
  selectedNodeIds: readonly string[],
  rootNodeId: MindMapNodeId,
): MindMapNodeId[] {
  return selectedNodeIds.length > 0 ? [...selectedNodeIds] : [rootNodeId]
}

/**
 * Browser-only interaction adapter for the command-backed mind-map scene.
 * It owns transient selection and input state, while edits still flow through
 * the application session and its domain command history.
 */
export function MindMapCanvas({
  actionDispatcher,
  actionHandlers,
  assets = {},
  equations = {},
  onExecute,
  onActionHandlersChange,
  session,
}: MindMapCanvasProps) {
  const { t } = useTranslation()
  const { document } = session
  const selection = useEditorUiStore((state) => state.selection)
  const selectedNodeIds = getSelectedTopicIds(selection)
  const editingNodeId = useEditorUiStore((state) => state.editingNodeId)
  const viewport = useEditorUiStore((state) => state.viewport)
  const dragPreview = useEditorUiStore((state) => state.dragPreview)
  const search = useEditorUiStore((state) => state.search)
  const filter = useEditorUiStore((state) => state.filter)
  const branchFocus = useEditorUiStore((state) => state.branchFocus)
  const setEditingNodeId = useEditorUiStore((state) => state.setEditingNodeId)
  const setSelection = useEditorUiStore((state) => state.setSelection)
  const setSelectedNodeIds = useEditorUiStore(
    (state) => state.setSelectedNodeIds,
  )
  const toggleSelectedNodeId = useEditorUiStore(
    (state) => state.toggleSelectedNodeId,
  )
  const setDragPreview = useEditorUiStore((state) => state.setDragPreview)
  const setFilter = useEditorUiStore((state) => state.setFilter)
  const setSearch = useEditorUiStore((state) => state.setSearch)
  const setBranchFocus = useEditorUiStore((state) => state.setBranchFocus)
  const setViewport = useEditorUiStore((state) => state.setViewport)
  const [draft, setDraft] = useState<TextDraft | null>(null)
  const [notice, setNotice] = useState<LocalizedMessage | null>(null)
  const [canvasSize, setCanvasSize] = useState<ViewportSize>(emptyCanvasSize)
  const [enhancementDragPreview, setEnhancementDragPreview] =
    useState<EnhancementDragPreview | null>(null)
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(
    null,
  )
  const [canvasInteractionMode, setCanvasInteractionMode] = useState<
    'idle' | 'marquee' | 'pan'
  >('idle')
  const [isAltPressed, setIsAltPressed] = useState(false)
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelectionState | null>(null)
  const [topicDragVisual, setTopicDragVisual] =
    useState<TopicDragVisualState | null>(null)
  const clipboardRef = useRef<MindMapClipboardPayload | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activePointerRef = useRef<ActivePointerInteraction | null>(null)
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null)
  const initializedViewportDocumentIdRef = useRef<MindMapId | null>(null)
  const lastCenteredSearchNodeIdRef = useRef<MindMapNodeId | null>(null)
  const suppressClickRef = useRef(false)
  const suppressContextMenuRef = useRef(false)
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const nextSelection = reconcileEditorSelection(document, selection)
    if (JSON.stringify(nextSelection) !== JSON.stringify(selection)) {
      setSelection(nextSelection)
    }
    if (editingNodeId && !document.nodes[editingNodeId]) {
      setEditingNodeId(null)
      setDraft(null)
    }
  }, [document, editingNodeId, selection, setEditingNodeId, setSelection])

  // Shell-level actions (for example Floating Topic and Insert Parent) can
  // request editing through the shared UI store. Materialize the local draft
  // after the new node reaches the current document.
  useEffect(() => {
    if (!editingNodeId || draft?.nodeId === editingNodeId) return
    const node = document.nodes[editingNodeId]
    if (node) setDraft({ nodeId: node.id, value: node.text })
  }, [document.nodes, draft?.nodeId, editingNodeId])

  const hasActiveFilter =
    filter.text.trim().length > 0 ||
    filter.labelIds.length > 0 ||
    filter.priorities.length > 0 ||
    filter.statuses.length > 0 ||
    filter.hasNotes !== undefined
  const filterResult = useMemo(
    () =>
      queryMindMap(document, {
        text: filter.text,
        labelIds: filter.labelIds,
        priorities: filter.priorities,
        statuses: filter.statuses,
        hasNotes: filter.hasNotes,
        operator: filter.operator,
      }),
    [document, filter],
  )
  const visibleNodeIds = useMemo(
    () => (hasActiveFilter ? new Set(filterResult.contextNodeIds) : undefined),
    [filterResult.contextNodeIds, hasActiveFilter],
  )
  const effectiveFocusRootNodeId =
    branchFocus.rootNodeId && document.nodes[branchFocus.rootNodeId]
      ? branchFocus.rootNodeId
      : null
  const hasFilterMatchOutsideFocus = Boolean(
    effectiveFocusRootNodeId &&
    hasActiveFilter &&
    filterResult.matchedNodeIds.some(
      (nodeId) =>
        !isNodeInsideBranchFocus(document, effectiveFocusRootNodeId, nodeId),
    ),
  )
  const activeDraft = draft && editingNodeId === draft.nodeId ? draft : null
  const presentationDocument = useMemo(() => {
    if (!activeDraft) return document
    const sourceNode = document.nodes[activeDraft.nodeId]
    if (!sourceNode) return document
    return {
      ...document,
      nodes: {
        ...document.nodes,
        [sourceNode.id]: { ...sourceNode, text: activeDraft.value },
      },
    }
  }, [activeDraft, document])
  const measuredPresentationNodes = useMemo(
    () =>
      Object.fromEntries(
        Object.values(presentationDocument.nodes).map((node) => {
          const measuredNode = {
            ...node,
            style: getComputedMindMapNodeStyle(presentationDocument, node.id),
            contentBlocks: node.contentBlocks.map((block) => {
              if (block.type !== 'equation') return block
              const rendered =
                equations[getMindMapEquationRenderKey(node.id, block.id)]
              return rendered?.state === 'ready'
                ? {
                    ...block,
                    width: rendered.width,
                    height: rendered.height,
                  }
                : block
            }),
          }
          return [node.id, measuredNode]
        }),
      ),
    [equations, presentationDocument],
  )
  const nodeSizes = useMemo(
    () =>
      Object.fromEntries(
        Object.values(measuredPresentationNodes).map((node) => [
          node.id,
          estimateMindMapNodeSize(
            node,
            defaultLayoutConfig,
            measureBrowserMindMapTopicText,
          ),
        ]),
      ),
    [measuredPresentationNodes],
  )
  const textMetricsByNodeId = useMemo(
    () =>
      Object.fromEntries(
        Object.values(measuredPresentationNodes).map((node) => [
          node.id,
          measureMindMapTopicText(
            node,
            nodeSizes[node.id]?.width ?? defaultLayoutConfig.nodeWidth,
            defaultLayoutConfig,
            measureBrowserMindMapTopicText,
          ),
        ]),
      ),
    [measuredPresentationNodes, nodeSizes],
  )
  const layout = useMemo<MindMapLayoutResult>(() => {
    if (!effectiveFocusRootNodeId) {
      return layoutMindMap(document, {
        nodeSizes,
        ...(visibleNodeIds ? { visibleNodeIds } : {}),
      })
    }
    const root = layoutMindMapSubtree(document, effectiveFocusRootNodeId, {
      nodeSizes,
      ...(visibleNodeIds ? { visibleNodeIds } : {}),
    })
    return {
      nodes: root.nodes,
      edges: root.edges,
      roots: [root],
      bounds: root.bounds,
      width: root.bounds.width,
      height: root.bounds.height,
    }
  }, [document, effectiveFocusRootNodeId, nodeSizes, visibleNodeIds])
  const layoutNodesById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  )
  const scene = useMemo(
    () =>
      localizeMindMapSvgScene(
        createMindMapSvgScene(presentationDocument, layout, {
          assets,
          backgroundColor: editorCanvasBackgroundColor,
          equations,
          textMetricsByNodeId,
        }),
        t,
      ),
    [assets, equations, layout, presentationDocument, t, textMetricsByNodeId],
  )
  const sceneNodesById = useMemo(
    () => new Map(scene.nodes.map((node) => [node.id, node])),
    [scene.nodes],
  )
  const sceneNumberingByNodeId = useMemo(
    () =>
      new Map(
        scene.numberings.map((numbering) => [numbering.nodeId, numbering]),
      ),
    [scene.numberings],
  )
  const sceneImagesByNodeId = useMemo(() => {
    const imagesByNodeId = new Map<string, typeof scene.images>()
    for (const image of scene.images) {
      const images = imagesByNodeId.get(image.nodeId) ?? []
      imagesByNodeId.set(image.nodeId, [...images, image])
    }
    return imagesByNodeId
  }, [scene.images])
  const sceneEquationsByNodeId = useMemo(() => {
    const equationsByNodeId = new Map<string, typeof scene.equations>()
    for (const equation of scene.equations) {
      const nodeEquations = equationsByNodeId.get(equation.nodeId) ?? []
      equationsByNodeId.set(equation.nodeId, [...nodeEquations, equation])
    }
    return equationsByNodeId
  }, [scene.equations])
  const sceneNodeBounds = useMemo<readonly SceneNodeBounds[]>(
    () =>
      scene.nodes.map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      })),
    [scene.nodes],
  )
  const activeSceneNode = activeDraft
    ? sceneNodesById.get(activeDraft.nodeId)
    : undefined
  const activeEditorStyle = activeDraft
    ? getComputedMindMapNodeStyle(document, activeDraft.nodeId)
    : undefined

  useLayoutEffect(() => {
    if (!activeDraft || !activeSceneNode) return
    const editor = textEditorRef.current
    if (!editor) return
    editor.focus()
    editor.select()
  }, [activeDraft?.nodeId, activeSceneNode?.id])

  useEffect(() => {
    if (!branchFocus.rootNodeId || effectiveFocusRootNodeId) return
    setSelectedNodeIds(restoreSelectionAfterBranchFocus(document, branchFocus))
    setBranchFocus(emptyEditorBranchFocusState)
  }, [
    branchFocus,
    document,
    effectiveFocusRootNodeId,
    setBranchFocus,
    setSelectedNodeIds,
  ])

  const getCoordinateAdapter = useCallback(() => {
    const rect = scrollRef.current?.getBoundingClientRect()
    return createViewportCoordinateAdapter(
      viewport,
      { x: rect?.left ?? 0, y: rect?.top ?? 0 },
      { x: scene.bounds.x, y: scene.bounds.y },
    )
  }, [scene.bounds.x, scene.bounds.y, viewport])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const zoomAtCanvasPoint = useCallback(
    (point: CanvasPoint, delta: number) => {
      setViewport(zoomViewportAtPoint(viewport, point, delta))
    },
    [setViewport, viewport],
  )

  const fitToContent = useCallback(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return
    setViewport(
      fitViewportToRect(
        {
          x: 0,
          y: 0,
          width: scene.bounds.width,
          height: scene.bounds.height,
        },
        canvasSize,
      ),
    )
  }, [canvasSize, scene.bounds.height, scene.bounds.width, setViewport])

  const centerNode = useCallback(
    (nodeId: MindMapNodeId) => {
      if (canvasSize.width <= 0 || canvasSize.height <= 0) return
      const selectedNode = sceneNodesById.get(nodeId)
      if (!selectedNode) return
      setViewport(
        centerViewportOnRect(
          {
            x: selectedNode.x - scene.bounds.x,
            y: selectedNode.y - scene.bounds.y,
            width: selectedNode.width,
            height: selectedNode.height,
          },
          viewport,
          canvasSize,
        ),
      )
    },
    [
      canvasSize,
      scene.bounds.x,
      scene.bounds.y,
      sceneNodesById,
      setViewport,
      viewport,
    ],
  )

  const centerSelected = useCallback(() => {
    centerNode(selectedNodeIds[0] ?? document.rootNodeId)
  }, [centerNode, document.rootNodeId, selectedNodeIds])

  useEffect(() => {
    if (
      initializedViewportDocumentIdRef.current === document.id ||
      canvasSize.width <= 0 ||
      canvasSize.height <= 0
    ) {
      return
    }
    const rootNode = sceneNodesById.get(document.rootNodeId)
    if (!rootNode) return

    initializedViewportDocumentIdRef.current = document.id
    setViewport(
      centerViewportOnRect(
        {
          x: rootNode.x - scene.bounds.x,
          y: rootNode.y - scene.bounds.y,
          width: rootNode.width,
          height: rootNode.height,
        },
        { x: 0, y: 0, zoom: 1 },
        canvasSize,
      ),
    )
  }, [
    canvasSize,
    document.id,
    document.rootNodeId,
    scene.bounds.x,
    scene.bounds.y,
    sceneNodesById,
    setViewport,
  ])

  const updateSearchQuery = useCallback(
    (query: string) => {
      const resultNodeIds = findNodeIdsByText(document, query)
      lastCenteredSearchNodeIdRef.current = null
      setSearch({
        query,
        resultNodeIds,
        activeResultIndex: resultNodeIds.length > 0 ? 0 : -1,
      })
    },
    [document, setSearch],
  )

  const navigateSearchResult = useCallback(
    (direction: 1 | -1) => {
      if (search.resultNodeIds.length === 0) return
      const activeResultIndex =
        (search.activeResultIndex + direction + search.resultNodeIds.length) %
        search.resultNodeIds.length
      const nodeId = search.resultNodeIds[activeResultIndex]
      if (!nodeId) return

      if (
        effectiveFocusRootNodeId &&
        !isNodeInsideBranchFocus(document, effectiveFocusRootNodeId, nodeId)
      ) {
        setNotice(localizedMessage('focus.outsideSearch'))
        return
      }

      const expandCommands = getAncestorNodeIds(document, nodeId)
        .filter((ancestorId) => document.nodes[ancestorId]?.collapsed)
        .map((ancestorId) => ({
          type: mindMapCommandTypes.setNodeCollapse,
          label: 'Expand search result ancestor',
          payload: { nodeId: ancestorId, collapsed: false },
        }))
      if (expandCommands.length > 0) {
        onExecute({
          type: mindMapCommandTypes.batch,
          label: 'Reveal search result',
          payload: { commands: expandCommands },
        })
      }

      lastCenteredSearchNodeIdRef.current = null
      setSelectedNodeIds([nodeId])
      setSearch({ ...search, activeResultIndex })
    },
    [
      document,
      effectiveFocusRootNodeId,
      onExecute,
      search,
      setSearch,
      setSelectedNodeIds,
    ],
  )

  const focusBranch = useCallback(
    (nodeId: MindMapNodeId) => {
      const previousSelection = branchFocus.rootNodeId
        ? branchFocus.previousSelectionNodeIds
        : selectedNodeIds
      setBranchFocus(
        createEditorBranchFocus(document, nodeId, previousSelection),
      )
      setSelectedNodeIds([nodeId])
      setEditingNodeId(null)
      setDraft(null)
    },
    [
      branchFocus,
      document,
      selectedNodeIds,
      setBranchFocus,
      setEditingNodeId,
      setSelectedNodeIds,
    ],
  )

  const exitBranchFocus = useCallback(() => {
    setSelectedNodeIds(restoreSelectionAfterBranchFocus(document, branchFocus))
    setBranchFocus(emptyEditorBranchFocusState)
    setEditingNodeId(null)
    setDraft(null)
  }, [
    branchFocus,
    document,
    setBranchFocus,
    setEditingNodeId,
    setSelectedNodeIds,
  ])

  useEffect(() => {
    const nodeId = search.resultNodeIds[search.activeResultIndex]
    if (!nodeId || lastCenteredSearchNodeIdRef.current === nodeId) return
    if (!sceneNodesById.has(nodeId)) return
    centerNode(nodeId)
    lastCenteredSearchNodeIdRef.current = nodeId
  }, [
    centerNode,
    sceneNodesById,
    search.activeResultIndex,
    search.resultNodeIds,
  ])

  const toggleCollapse = useCallback(
    (nodeId: MindMapNodeId) => {
      const node = document.nodes[nodeId]
      if (!node || node.childIds.length === 0) return
      onExecute({
        type: mindMapCommandTypes.setNodeCollapse,
        label: node.collapsed ? 'Expand topic' : 'Collapse topic',
        payload: { nodeId, collapsed: !node.collapsed },
      })
    },
    [document.nodes, onExecute],
  )

  const beginEditing = useCallback(
    (nodeId: MindMapNodeId) => {
      const node = document.nodes[nodeId]
      if (!node) return
      setSelectedNodeIds([nodeId])
      setEditingNodeId(nodeId)
      setDraft({ nodeId, value: node.text })
    },
    [document.nodes, setEditingNodeId, setSelectedNodeIds],
  )

  const beginNewNodeEditing = useCallback(
    (nodeId: MindMapNodeId, text: string) => {
      setSelectedNodeIds([nodeId])
      setEditingNodeId(nodeId)
      setDraft({ nodeId, value: text })
    },
    [setEditingNodeId, setSelectedNodeIds],
  )

  const cancelEditing = useCallback(() => {
    setDraft(null)
    setEditingNodeId(null)
  }, [setEditingNodeId])

  const commitEditing = useCallback(() => {
    if (!activeDraft || !document.nodes[activeDraft.nodeId]) {
      cancelEditing()
      return
    }

    const node = document.nodes[activeDraft.nodeId]
    if (!node) {
      cancelEditing()
      return
    }
    const text = activeDraft.value.trim() || t('defaults.untitledTopic')
    if (node.text !== text) {
      onExecute({
        type: mindMapCommandTypes.updateNodeText,
        label: 'Update topic text',
        payload: { nodeId: activeDraft.nodeId, text },
      })
    }
    cancelEditing()
  }, [activeDraft, cancelEditing, document.nodes, onExecute, t])

  const createSiblingFor = useCallback(
    (nodeId: MindMapNodeId) => {
      const newNodeId = createPlatformId('node')
      const text = t('defaults.newTopic')
      const result = onExecute(
        createSiblingNodeCommand(document, nodeId, newNodeId, text),
      )
      if (result) beginNewNodeEditing(newNodeId, text)
    },
    [beginNewNodeEditing, document, onExecute, t],
  )

  const createChildFor = useCallback(
    (nodeId: MindMapNodeId) => {
      const newNodeId = createPlatformId('node')
      const text = t('defaults.newTopic')
      const result = onExecute(
        createChildNodeCommand(document, nodeId, newNodeId, text),
      )
      if (result) beginNewNodeEditing(newNodeId, text)
    },
    [beginNewNodeEditing, document, onExecute, t],
  )

  const createSibling = useCallback(() => {
    if (selection.kind !== 'topic' && selection.kind !== 'none') return
    const nodeId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
    if (nodeId) createSiblingFor(nodeId)
  }, [createSiblingFor, document.rootNodeId, selectedNodeIds, selection.kind])

  const createChild = useCallback(() => {
    if (selection.kind !== 'topic' && selection.kind !== 'none') return
    const nodeId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
    if (nodeId) createChildFor(nodeId)
  }, [createChildFor, document.rootNodeId, selectedNodeIds, selection.kind])

  const deleteSelection = useCallback(() => {
    if (selection.kind !== 'topic' && selection.kind !== 'none') {
      const type =
        selection.kind === 'relationship'
          ? mindMapCommandTypes.deleteRelationship
          : selection.kind === 'boundary'
            ? mindMapCommandTypes.deleteBoundary
            : selection.kind === 'summary'
              ? mindMapCommandTypes.deleteSummary
              : mindMapCommandTypes.deleteCallout
      const payload =
        selection.kind === 'relationship'
          ? { relationshipId: selection.id }
          : selection.kind === 'boundary'
            ? { boundaryId: selection.id }
            : selection.kind === 'summary'
              ? { summaryId: selection.id }
              : { calloutId: selection.id }
      const result = onExecute({
        type,
        label: 'Delete selected enhancement',
        payload,
      } as MindMapCommand)
      if (result) setSelectedNodeIds([document.rootNodeId])
      return
    }
    const nodeIds = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)
    const result = onExecute(createDeleteNodesCommand(nodeIds))
    if (result) {
      setSelectedNodeIds([document.rootNodeId])
      cancelEditing()
    }
  }, [
    cancelEditing,
    document.rootNodeId,
    onExecute,
    selectedNodeIds,
    selection,
    setSelectedNodeIds,
  ])

  const copySelection = useCallback(async () => {
    if (selection.kind !== 'topic') return
    const payload = createMindMapClipboardPayload(
      document,
      getSelectionOrRoot(selectedNodeIds, document.rootNodeId),
    )
    clipboardRef.current = payload

    try {
      await createBrowserMindMapClipboardAdapter().write(payload)
      setNotice(localizedMessage('messages.clipboardCopied'))
    } catch (error) {
      const message =
        error instanceof ClipboardUnavailableError
          ? localizedMessage('messages.clipboardUnavailableCopy')
          : localizedMessage('messages.clipboardCopyFailed')
      setNotice(message)
    }
  }, [document, selectedNodeIds, selection.kind])

  const pasteSelection = useCallback(async () => {
    if (selection.kind !== 'topic' && selection.kind !== 'none') return
    let payload = clipboardRef.current
    try {
      payload = (await createBrowserMindMapClipboardAdapter().read()) ?? payload
    } catch (error) {
      if (error instanceof ClipboardUnavailableError) {
        setNotice(localizedMessage('messages.clipboardUnavailablePaste'))
      } else {
        setNotice(localizedMessage('messages.clipboardReadFailed'))
      }
    }

    if (!payload || payload.roots.length === 0) {
      setNotice(localizedMessage('messages.nothingToPaste'))
      return
    }

    const parentId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
    const parent = parentId ? document.nodes[parentId] : undefined
    if (!parent) return

    const clipboard = duplicateMindMapClipboardPayload(payload, () =>
      createPlatformId('node'),
    )
    const result = onExecute({
      type: mindMapCommandTypes.pasteSubtree,
      label: 'Paste topics',
      payload: {
        parentId: parent.id,
        index: parent.childIds.length,
        clipboard,
      },
    })
    if (result) {
      setSelectedNodeIds(clipboard.roots.map((root) => root.rootNodeId))
      setNotice(localizedMessage('messages.topicsPasted'))
    }
  }, [document, onExecute, selectedNodeIds, selection.kind, setSelectedNodeIds])

  const cutSelection = useCallback(async () => {
    await copySelection()
    deleteSelection()
  }, [copySelection, deleteSelection])

  const duplicateSelection = useCallback(() => {
    if (selection.kind !== 'topic') return
    const selected = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)
    const sourceNode = document.nodes[selected[0] ?? '']
    if (!sourceNode) return

    const parent = sourceNode.parentId
      ? document.nodes[sourceNode.parentId]
      : document.nodes[document.rootNodeId]
    if (!parent) return

    const sourceIndex = parent.childIds.indexOf(sourceNode.id)
    const clipboard = duplicateMindMapClipboardPayload(
      createMindMapClipboardPayload(document, selected),
      () => createPlatformId('node'),
    )
    const result = onExecute({
      type: mindMapCommandTypes.pasteSubtree,
      label: 'Duplicate topics',
      payload: {
        parentId: parent.id,
        index: sourceIndex >= 0 ? sourceIndex + 1 : parent.childIds.length,
        clipboard,
      },
    })
    if (result)
      setSelectedNodeIds(clipboard.roots.map((root) => root.rootNodeId))
  }, [document, onExecute, selectedNodeIds, selection.kind, setSelectedNodeIds])

  const editSelectedStructure = useCallback(
    (
      edit:
        'demote' | 'move-sibling-next' | 'move-sibling-previous' | 'promote',
    ) => {
      if (selection.kind !== 'topic') return
      const nodeId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
      if (!nodeId) return
      const result = buildMindMapStructureEdit(document, nodeId, edit)
      if (result.enabled) onExecute(result.command)
    },
    [document, onExecute, selectedNodeIds, selection.kind],
  )

  const clearPointerInteraction = useCallback(() => {
    activePointerRef.current = null
    marqueeSelectionRef.current = null
    setDragPreview(null)
    setEnhancementDragPreview(null)
    setMarqueeSelection(null)
    setTopicDragVisual(null)
    setCanvasInteractionMode('idle')
  }, [setDragPreview])

  const getDropPreview = useCallback(
    (
      nodeIds: readonly MindMapNodeId[],
      point: CanvasPoint,
    ): ReturnType<typeof useEditorUiStore.getState>['dragPreview'] => {
      const target = getSceneNodeAtPoint(sceneNodeBounds, point)
      if (!target) return null

      const isInvalidTarget = nodeIds.some(
        (nodeId) =>
          nodeId === target.id ||
          getDescendantNodeIds(document, nodeId).includes(target.id),
      )
      if (isInvalidTarget) return null

      const layoutTarget = layoutNodesById.get(target.id)
      return {
        nodeIds,
        targetNodeId: target.id,
        placement: getTopicDropPlacement(
          layoutTarget?.structure,
          target,
          point,
        ),
      }
    },
    [document, layoutNodesById, sceneNodeBounds],
  )

  const commitDropPreview = useCallback(
    (
      preview: NonNullable<
        ReturnType<typeof useEditorUiStore.getState>['dragPreview']
      >,
    ) => {
      const target = document.nodes[preview.targetNodeId]
      if (!target) return

      const parentId =
        preview.placement === 'child' ? target.id : target.parentId
      if (!parentId) return

      const parent = document.nodes[parentId]
      if (!parent) return

      const targetIndex = parent.childIds.indexOf(target.id)
      const index =
        preview.placement === 'child'
          ? parent.childIds.length
          : targetIndex + (preview.placement === 'after' ? 1 : 0)

      const floatingRootId =
        preview.nodeIds.length === 1 &&
        document.floatingTopics[preview.nodeIds[0] ?? '']
          ? preview.nodeIds[0]
          : undefined
      if (floatingRootId) {
        onExecute({
          type: mindMapCommandTypes.attachFloatingTopic,
          label: 'Attach floating topic',
          payload: { nodeId: floatingRootId, parentId, index },
        })
      } else {
        onExecute(
          createBatchMoveCommand(document, preview.nodeIds, parentId, index),
        )
      }
    },
    [document, onExecute],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return

      const isMouse = event.pointerType === 'mouse'
      const usesSecondaryButton = isMouse && event.button === 2
      const usesPrimaryButton = event.button === 0
      if (!usesSecondaryButton && !usesPrimaryButton) return

      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      const node = getSceneNodeAtPoint(sceneNodeBounds, point)
      const isModifierSelection = event.metaKey || event.ctrlKey
      const nodeIds = node
        ? normalizeTopLevelNodeSelection(
            document,
            selectedNodeIds.includes(node.id) && !isModifierSelection
              ? selectedNodeIds
              : [node.id],
          ).filter((nodeId) => nodeId !== document.rootNodeId)
        : undefined

      const start = {
        pointerId: event.pointerId,
        startClientPoint: { x: event.clientX, y: event.clientY },
        startViewport: viewport,
      }

      if (usesSecondaryButton || !isMouse) {
        activePointerRef.current = {
          ...start,
          type: 'pan',
          usesSecondaryButton,
        }
        setCanvasInteractionMode('pan')
      } else if (nodeIds && nodeIds.length > 0) {
        activePointerRef.current = { ...start, nodeIds, type: 'drag' }
        setCanvasInteractionMode('idle')
      } else if (event.altKey) {
        activePointerRef.current = {
          ...start,
          appendSelection: event.metaKey || event.ctrlKey || event.shiftKey,
          initialSelectedNodeIds: selectedNodeIds,
          startScenePoint: point,
          type: 'marquee',
        }
        setCanvasInteractionMode('marquee')
      } else {
        activePointerRef.current = { ...start, type: 'pan' }
        setCanvasInteractionMode('pan')
      }
      suppressClickRef.current = false
      if (usesSecondaryButton) suppressContextMenuRef.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [
      document,
      getCoordinateAdapter,
      sceneNodeBounds,
      selectedNodeIds,
      viewport,
    ],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      const delta = {
        x: event.clientX - active.startClientPoint.x,
        y: event.clientY - active.startClientPoint.y,
      }
      if (Math.hypot(delta.x, delta.y) < 4) return
      if (active.usesSecondaryButton) {
        suppressContextMenuRef.current = true
      } else {
        suppressClickRef.current = true
      }

      if (active.type === 'pan') {
        setViewport(panViewport(active.startViewport, delta))
        return
      }

      if (active.type === 'marquee' && active.startScenePoint) {
        const point = getCoordinateAdapter().clientToScenePoint({
          x: event.clientX,
          y: event.clientY,
        })
        const rect = createEditorSelectionRect(active.startScenePoint, point)
        const intersectingNodeIds = getIntersectingEditorTopicIds(
          sceneNodeBounds,
          rect,
        )
        const nodeIds = active.appendSelection
          ? [
              ...new Set([
                ...(active.initialSelectedNodeIds ?? []),
                ...intersectingNodeIds,
              ]),
            ]
          : intersectingNodeIds
        const nextMarqueeSelection = { nodeIds, rect }
        marqueeSelectionRef.current = nextMarqueeSelection
        setMarqueeSelection(nextMarqueeSelection)
        return
      }

      if (
        (active.type === 'callout' || active.type === 'relationship-control') &&
        active.enhancementId &&
        active.startOffset
      ) {
        const offset = {
          x: active.startOffset.x + delta.x / active.startViewport.zoom,
          y: active.startOffset.y + delta.y / active.startViewport.zoom,
        }
        setEnhancementDragPreview(
          active.type === 'callout'
            ? { kind: 'callout', id: active.enhancementId, offset }
            : {
                kind: 'relationship-control',
                id: active.enhancementId,
                index: active.controlPointIndex ?? 0,
                offset,
              },
        )
        return
      }

      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      if (active.nodeIds) {
        setTopicDragVisual({
          clientPoint: { x: event.clientX, y: event.clientY },
          nodeIds: active.nodeIds,
          sourceNodeId: active.nodeIds[0]!,
        })
        setDragPreview(getDropPreview(active.nodeIds, point))
      }
    },
    [
      getCoordinateAdapter,
      getDropPreview,
      sceneNodeBounds,
      setDragPreview,
      setViewport,
    ],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      const preview = useEditorUiStore.getState().dragPreview
      if (active.type === 'marquee') {
        const nodeIds = marqueeSelectionRef.current?.nodeIds
        if (nodeIds) setSelectedNodeIds(nodeIds)
      } else if (
        active.type === 'callout' &&
        active.enhancementId &&
        active.startOffset
      ) {
        const delta = {
          x:
            (event.clientX - active.startClientPoint.x) /
            active.startViewport.zoom,
          y:
            (event.clientY - active.startClientPoint.y) /
            active.startViewport.zoom,
        }
        if (Math.hypot(delta.x, delta.y) >= 4) {
          onExecute({
            type: mindMapCommandTypes.updateCallout,
            label: 'Move callout',
            payload: {
              calloutId: active.enhancementId,
              changes: {
                offset: {
                  x: active.startOffset.x + delta.x,
                  y: active.startOffset.y + delta.y,
                },
              },
            },
          })
        }
      } else if (
        active.type === 'relationship-control' &&
        active.enhancementId &&
        active.startOffset
      ) {
        const relationship = document.relationships.find(
          (candidate) => candidate.id === active.enhancementId,
        )
        const index = active.controlPointIndex ?? 0
        if (relationship?.controlPoints[index]) {
          const delta = {
            x:
              (event.clientX - active.startClientPoint.x) /
              active.startViewport.zoom,
            y:
              (event.clientY - active.startClientPoint.y) /
              active.startViewport.zoom,
          }
          if (Math.hypot(delta.x, delta.y) >= 4) {
            const controlPoints = relationship.controlPoints.map((point) => ({
              ...point,
            }))
            controlPoints[index] = {
              x: active.startOffset.x + delta.x,
              y: active.startOffset.y + delta.y,
            }
            onExecute({
              type: mindMapCommandTypes.updateRelationship,
              label: 'Move relationship control point',
              payload: {
                relationshipId: relationship.id,
                changes: { controlPoints },
              },
            })
          }
        }
      } else if (active.type === 'drag' && preview && active.nodeIds) {
        commitDropPreview(preview)
      } else if (
        active.type === 'drag' &&
        active.nodeIds?.length === 1 &&
        document.floatingTopics[active.nodeIds[0] ?? '']
      ) {
        const nodeId = active.nodeIds[0]!
        const placement = document.floatingTopics[nodeId]!
        const delta = {
          x:
            (event.clientX - active.startClientPoint.x) /
            active.startViewport.zoom,
          y:
            (event.clientY - active.startClientPoint.y) /
            active.startViewport.zoom,
        }
        if (Math.hypot(delta.x, delta.y) >= 4) {
          onExecute({
            type: mindMapCommandTypes.setFloatingTopicPlacement,
            label: 'Move floating topic',
            payload: {
              nodeId,
              placement: {
                ...placement,
                x: placement.x + delta.x,
                y: placement.y + delta.y,
              },
            },
          })
        }
      }
      clearPointerInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [
      clearPointerInteraction,
      commitDropPreview,
      document,
      onExecute,
      setSelectedNodeIds,
    ],
  )

  const handleCanvasClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }

      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      const node = getSceneNodeAtPoint(sceneNodeBounds, point)
      if (!node) {
        cancelEditing()
        setSelectedNodeIds([])
        return
      }

      if (event.metaKey || event.ctrlKey) {
        toggleSelectedNodeId(node.id)
      } else {
        setSelectedNodeIds([node.id])
      }
    },
    [
      cancelEditing,
      getCoordinateAdapter,
      sceneNodeBounds,
      setSelectedNodeIds,
      toggleSelectedNodeId,
    ],
  )

  const handleCanvasDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return

      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      const node = getSceneNodeAtPoint(sceneNodeBounds, point)
      if (!node) return

      event.preventDefault()
      beginEditing(node.id)
    },
    [beginEditing, getCoordinateAdapter, sceneNodeBounds],
  )

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      if (suppressContextMenuRef.current) {
        suppressContextMenuRef.current = false
        setContextMenu(null)
        return
      }
      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      const node = getSceneNodeAtPoint(sceneNodeBounds, point)
      if (!node) {
        setContextMenu(null)
        return
      }
      setSelectedNodeIds([node.id])
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [getCoordinateAdapter, sceneNodeBounds, setSelectedNodeIds],
  )

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      zoomAtCanvasPoint(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        event.deltaY < 0 ? 0.1 : -0.1,
      )
    },
    [zoomAtCanvasPoint],
  )

  useEffect(() => {
    const handlers: Partial<
      Record<EditorActionId, () => unknown | Promise<unknown>>
    > = {
      [editorActionIds.createSibling]: createSibling,
      [editorActionIds.createChild]: createChild,
      [editorActionIds.edit]: () => {
        const nodeId = selectedNodeIds[0]
        if (nodeId) beginEditing(nodeId)
      },
      [editorActionIds.delete]: deleteSelection,
      [editorActionIds.duplicate]: duplicateSelection,
      [editorActionIds.copy]: copySelection,
      [editorActionIds.cut]: cutSelection,
      [editorActionIds.paste]: pasteSelection,
      [editorActionIds.selectAll]: () =>
        setSelectedNodeIds(layout.nodes.map((node) => node.id)),
      [editorActionIds.movePrevious]: () =>
        editSelectedStructure('move-sibling-previous'),
      [editorActionIds.moveNext]: () =>
        editSelectedStructure('move-sibling-next'),
      [editorActionIds.promote]: () => editSelectedStructure('promote'),
      [editorActionIds.demote]: () => editSelectedStructure('demote'),
      [editorActionIds.convertToFloatingTopic]: () => {
        const nodeId = selectedNodeIds[0]
        const layoutNode = nodeId ? layoutNodesById.get(nodeId) : undefined
        if (!nodeId || !layoutNode) return
        onExecute({
          type: mindMapCommandTypes.convertToFloatingTopic,
          label: 'Convert topic to floating topic',
          payload: {
            nodeId,
            placement: {
              x: layoutNode.x,
              y: layoutNode.y,
              structure: layoutNode.structure,
            },
          },
        })
      },
      [editorActionIds.collapse]: () => {
        const nodeId = selectedNodeIds[0]
        if (nodeId) toggleCollapse(nodeId)
      },
      [editorActionIds.focusBranch]: () => {
        const nodeId = selectedNodeIds[0]
        if (nodeId) focusBranch(nodeId)
      },
      [editorActionIds.exitFocus]: exitBranchFocus,
      [editorActionIds.zoomIn]: () =>
        zoomAtCanvasPoint(
          { x: canvasSize.width / 2, y: canvasSize.height / 2 },
          0.1,
        ),
      [editorActionIds.zoomOut]: () =>
        zoomAtCanvasPoint(
          { x: canvasSize.width / 2, y: canvasSize.height / 2 },
          -0.1,
        ),
      [editorActionIds.fit]: fitToContent,
      [editorActionIds.center]: centerSelected,
    }
    Object.assign(actionHandlers, handlers)
    onActionHandlersChange()
    return () => {
      for (const [id, handler] of Object.entries(handlers)) {
        if (actionHandlers[id as EditorActionId] === handler) {
          delete actionHandlers[id as EditorActionId]
        }
      }
    }
  }, [
    actionHandlers,
    beginEditing,
    canvasSize.height,
    canvasSize.width,
    centerSelected,
    copySelection,
    createChild,
    createSibling,
    cutSelection,
    deleteSelection,
    duplicateSelection,
    editSelectedStructure,
    fitToContent,
    focusBranch,
    layout.nodes,
    layoutNodesById,
    onActionHandlersChange,
    onExecute,
    pasteSelection,
    selectedNodeIds,
    setSelectedNodeIds,
    toggleCollapse,
    exitBranchFocus,
    zoomAtCanvasPoint,
  ])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('blur', close)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    const onModifierKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setIsAltPressed(true)
    }
    const onModifierKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setIsAltPressed(false)
    }
    const clearModifierState = () => setIsAltPressed(false)

    window.addEventListener('keydown', onModifierKeyDown)
    window.addEventListener('keyup', onModifierKeyUp)
    window.addEventListener('blur', clearModifierState)
    return () => {
      window.removeEventListener('keydown', onModifierKeyDown)
      window.removeEventListener('keyup', onModifierKeyUp)
      window.removeEventListener('blur', clearModifierState)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activePointerRef.current) {
        event.preventDefault()
        clearPointerInteraction()
        return
      }
      const shortcut = getEditorKeyboardShortcut(
        event,
        Boolean(editingNodeId) || isEditableTarget(event.target),
      )
      if (!shortcut) return

      event.preventDefault()
      void actionDispatcher.dispatch(shortcut)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', clearPointerInteraction)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', clearPointerInteraction)
    }
  }, [clearPointerInteraction, actionDispatcher, editingNodeId])

  const previewNode = dragPreview
    ? sceneNodesById.get(dragPreview.targetNodeId)
    : undefined
  const quickCreateNodeId =
    selection.kind === 'topic' &&
    selection.ids.length === 1 &&
    selection.ids[0] !== document.rootNodeId &&
    !activeDraft &&
    !topicDragVisual
      ? selection.ids[0]
      : undefined
  const quickCreateSceneNode = quickCreateNodeId
    ? sceneNodesById.get(quickCreateNodeId)
    : undefined
  const quickCreateSourceNode = quickCreateNodeId
    ? document.nodes[quickCreateNodeId]
    : undefined
  const dragGhostNode = topicDragVisual
    ? sceneNodesById.get(topicDragVisual.sourceNodeId)
    : undefined
  const dragGhostSource = topicDragVisual
    ? document.nodes[topicDragVisual.sourceNodeId]
    : undefined

  return (
    <section className="mind-map-canvas" aria-label={t('canvas.label')}>
      <div className="canvas-hint" aria-hidden="true">
        {t('canvas.hint')}
      </div>
      <nav className="branch-focus-bar" aria-label={t('focus.focusBranch')}>
        {effectiveFocusRootNodeId ? (
          <>
            {branchFocus.breadcrumbNodeIds.map((nodeId) => (
              <button
                key={nodeId}
                type="button"
                onClick={() => focusBranch(nodeId)}
              >
                {document.nodes[nodeId]?.text ?? nodeId}
              </button>
            ))}
            <button type="button" onClick={exitBranchFocus}>
              {t('focus.exit')}
            </button>
          </>
        ) : (
          <button
            disabled={selectedNodeIds.length !== 1}
            type="button"
            onClick={() => {
              const nodeId = selectedNodeIds[0]
              if (nodeId) focusBranch(nodeId)
            }}
          >
            {t('focus.focusBranch')}
          </button>
        )}
      </nav>
      {contextMenu ? (
        <div
          aria-label={t('toolbar.topic')}
          className="canvas-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            )
            const index = items.indexOf(
              globalThis.document.activeElement as HTMLButtonElement,
            )
            let nextIndex: number | undefined
            if (event.key === 'ArrowDown') {
              nextIndex = (index + 1) % items.length
            }
            if (event.key === 'ArrowUp') {
              nextIndex = (index - 1 + items.length) % items.length
            }
            if (event.key === 'Home') nextIndex = 0
            if (event.key === 'End') nextIndex = items.length - 1
            if (nextIndex !== undefined) {
              event.preventDefault()
              items[nextIndex]?.focus()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setContextMenu(null)
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {[
            editorActionIds.edit,
            editorActionIds.createSibling,
            editorActionIds.createChild,
            editorActionIds.duplicate,
            editorActionIds.copy,
            editorActionIds.paste,
            editorActionIds.convertToFloatingTopic,
            editorActionIds.openStyle,
            editorActionIds.delete,
          ].map((id, index) => {
            const action = actionDispatcher.resolve(id)
            return (
              <button
                key={id}
                aria-disabled={!action.enabled}
                autoFocus={index === 0}
                data-action-id={id}
                role="menuitem"
                title={
                  action.disabledReasonKey
                    ? t(action.disabledReasonKey as never)
                    : t(action.labelKey as never)
                }
                type="button"
                onClick={() => {
                  if (action.enabled) void actionDispatcher.dispatch(id)
                  setContextMenu(null)
                }}
              >
                {t(action.labelKey as never)}
              </button>
            )
          })}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="mind-map-scroll"
        data-alt-selecting={isAltPressed ? 'true' : undefined}
        data-interaction={canvasInteractionMode}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleCanvasDoubleClick}
        onLostPointerCapture={clearPointerInteraction}
        onPointerCancel={clearPointerInteraction}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="mind-map-viewport-layer"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          <div
            className="mind-map-stage"
            style={{
              width: scene.bounds.width,
              height: scene.bounds.height,
            }}
          >
            <svg
              aria-label={t('canvas.sceneLabel')}
              className="mind-map-svg"
              role="group"
              viewBox={`${scene.bounds.x} ${scene.bounds.y} ${scene.bounds.width} ${scene.bounds.height}`}
            >
              <defs>
                <marker
                  id="canvas-relationship-arrow"
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto-start-reverse"
                  refX="7"
                  refY="4"
                >
                  <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
                </marker>
                <marker
                  id="canvas-relationship-dot"
                  markerHeight="8"
                  markerWidth="8"
                  refX="4"
                  refY="4"
                >
                  <circle cx="4" cy="4" fill="context-stroke" r="3" />
                </marker>
              </defs>
              <rect
                data-map-background="true"
                fill={scene.background}
                height={scene.bounds.height}
                width={scene.bounds.width}
                x={scene.bounds.x}
                y={scene.bounds.y}
              />
              <g className="mind-map-boundaries">
                {scene.boundaries.map((boundary) => {
                  const isSelected =
                    selection.kind === 'boundary' &&
                    selection.id === boundary.id
                  return (
                    <g
                      key={boundary.id}
                      aria-label={t('enhancement.boundaryLabel', {
                        label: boundary.label,
                      })}
                      aria-pressed={isSelected}
                      className={`mind-map-boundary${isSelected ? ' is-selected' : ''}`}
                      data-boundary-id={boundary.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelection({ kind: 'boundary', id: boundary.id })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setSelection({ kind: 'boundary', id: boundary.id })
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setSelection({ kind: 'boundary', id: boundary.id })
                      }}
                    >
                      <rect
                        fill={boundary.fill}
                        fillOpacity={boundary.fillOpacity}
                        height={boundary.height}
                        rx={boundary.cornerRadius}
                        stroke={boundary.stroke}
                        strokeDasharray={boundary.strokeDasharray}
                        strokeWidth={boundary.strokeWidth}
                        width={boundary.width}
                        x={boundary.x}
                        y={boundary.y}
                      />
                      <text
                        fill={boundary.textFill}
                        fontSize={12}
                        fontWeight="semibold"
                        pointerEvents="none"
                        x={boundary.x + 12}
                        y={boundary.y + 17}
                      >
                        {boundary.label}
                      </text>
                    </g>
                  )
                })}
              </g>
              <g className="mind-map-connectors" aria-hidden="true">
                {scene.connectors.map((connector) => (
                  <path
                    key={connector.id}
                    d={connector.path}
                    fill="none"
                    stroke={connector.stroke}
                    strokeDasharray={connector.strokeDasharray}
                    strokeWidth={connector.strokeWidth}
                  />
                ))}
              </g>
              <g className="mind-map-relationships">
                {scene.relationships.map((relationship) => {
                  const isSelected =
                    selection.kind === 'relationship' &&
                    selection.id === relationship.id
                  return (
                    <g
                      key={relationship.id}
                      aria-label={t('enhancement.relationshipLabel', {
                        label: relationship.label,
                      })}
                      aria-pressed={isSelected}
                      className={`mind-map-relationship${isSelected ? ' is-selected' : ''}`}
                      data-relationship-id={relationship.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelection({
                          kind: 'relationship',
                          id: relationship.id,
                        })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setSelection({
                          kind: 'relationship',
                          id: relationship.id,
                        })
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setSelection({
                          kind: 'relationship',
                          id: relationship.id,
                        })
                      }}
                    >
                      <path
                        className="enhancement-hit-path"
                        d={relationship.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(
                          14,
                          relationship.strokeWidth + 10,
                        )}
                      />
                      <path
                        d={relationship.path}
                        fill="none"
                        markerEnd={
                          relationship.endMarker === 'none'
                            ? undefined
                            : `url(#canvas-relationship-${relationship.endMarker})`
                        }
                        markerStart={
                          relationship.startMarker === 'none'
                            ? undefined
                            : `url(#canvas-relationship-${relationship.startMarker})`
                        }
                        pointerEvents="none"
                        stroke={relationship.stroke}
                        strokeDasharray={relationship.strokeDasharray}
                        strokeWidth={relationship.strokeWidth}
                      />
                      <text
                        fill={relationship.labelFill}
                        fontSize={relationship.labelFontSize}
                        pointerEvents="none"
                        textAnchor="middle"
                        x={relationship.labelX}
                        y={relationship.labelY}
                      >
                        {relationship.label}
                      </text>
                    </g>
                  )
                })}
              </g>
              <g className="mind-map-summaries">
                {scene.summaries.map((summary) => {
                  const isSelected =
                    selection.kind === 'summary' && selection.id === summary.id
                  return (
                    <g
                      key={summary.id}
                      aria-label={t('enhancement.summaryLabel', {
                        label: summary.label,
                      })}
                      aria-pressed={isSelected}
                      className={`mind-map-summary${isSelected ? ' is-selected' : ''}`}
                      data-summary-id={summary.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelection({ kind: 'summary', id: summary.id })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setSelection({ kind: 'summary', id: summary.id })
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setSelection({ kind: 'summary', id: summary.id })
                      }}
                    >
                      <path
                        className="enhancement-hit-path"
                        d={summary.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={Math.max(14, summary.strokeWidth + 10)}
                      />
                      <path
                        d={summary.path}
                        fill="none"
                        pointerEvents="none"
                        stroke={summary.stroke}
                        strokeDasharray={summary.strokeDasharray}
                        strokeWidth={summary.strokeWidth}
                      />
                      <text
                        fill={summary.textFill}
                        fontSize={12}
                        fontWeight="semibold"
                        pointerEvents="none"
                        x={summary.labelX}
                        y={summary.labelY}
                      >
                        {summary.label}
                      </text>
                    </g>
                  )
                })}
              </g>
              {marqueeSelection ? (
                <rect
                  aria-hidden="true"
                  className="marquee-selection"
                  data-selection-marquee="true"
                  height={marqueeSelection.rect.height}
                  width={marqueeSelection.rect.width}
                  x={marqueeSelection.rect.x}
                  y={marqueeSelection.rect.y}
                />
              ) : null}
              <g className="mind-map-nodes">
                {scene.nodes.map((node) => {
                  const isSelected =
                    selectedNodeIds.includes(node.id) ||
                    Boolean(marqueeSelection?.nodeIds.includes(node.id))
                  const isEditing = editingNodeId === node.id
                  const isDragging = topicDragVisual?.nodeIds.includes(node.id)
                  const isSearchResult = search.resultNodeIds.includes(node.id)
                  const isActiveSearchResult =
                    search.resultNodeIds[search.activeResultIndex] === node.id
                  const sourceNode = document.nodes[node.id]
                  const numbering = sceneNumberingByNodeId.get(node.id)
                  return (
                    <g
                      key={node.id}
                      aria-label={t('canvas.topicLabel', {
                        title: sourceNode?.text ?? node.id,
                      })}
                      aria-pressed={isSelected}
                      className={`mind-map-node${isSelected ? ' is-selected' : ''}${
                        isEditing ? ' is-editing' : ''
                      }${isDragging ? ' is-dragging' : ''}${
                        sourceNode?.collapsed ? ' is-collapsed' : ''
                      }${isSearchResult ? ' is-search-result' : ''}${
                        isActiveSearchResult ? ' is-active-search-result' : ''
                      }`}
                      data-node-id={node.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Spacebar') {
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedNodeIds([node.id])
                        }
                        if (event.key === 'F2') {
                          event.preventDefault()
                          event.stopPropagation()
                          beginEditing(node.id)
                        }
                      }}
                    >
                      <rect
                        height={node.height}
                        rx={node.cornerRadius}
                        width={node.width}
                        x={node.x}
                        y={node.y}
                        fill={node.fill}
                        stroke={
                          node.shape === 'borderless' ||
                          node.shape === 'underline'
                            ? 'none'
                            : node.stroke
                        }
                        strokeDasharray={node.strokeDasharray}
                        strokeWidth={node.strokeWidth}
                      />
                      {node.shape === 'underline' ? (
                        <line
                          stroke={node.stroke}
                          strokeDasharray={node.strokeDasharray}
                          strokeWidth={node.strokeWidth}
                          x1={node.x}
                          x2={node.x + node.width}
                          y1={node.y + node.height}
                          y2={node.y + node.height}
                        />
                      ) : null}
                      {numbering && !isEditing ? (
                        <text
                          data-numbering-for={numbering.nodeId}
                          fill={numbering.fill}
                          fontSize={numbering.fontSize}
                          fontWeight="semibold"
                          x={numbering.x}
                          y={numbering.y}
                        >
                          {numbering.text}
                        </text>
                      ) : null}
                      {isEditing
                        ? null
                        : node.textLines.map((line, index) => (
                            <text
                              key={`${node.id}-line-${index}`}
                              fill={line.fill}
                              fontFamily={line.fontFamily}
                              fontSize={line.fontSize}
                              fontStyle={line.fontStyle}
                              fontWeight={line.fontWeight}
                              textAnchor={line.textAnchor}
                              textDecoration={line.textDecoration}
                              x={line.x}
                              y={line.y}
                            >
                              {line.text}
                            </text>
                          ))}
                      {(sceneImagesByNodeId.get(node.id) ?? []).map((image) =>
                        image.state === 'ready' && image.href ? (
                          <image
                            key={image.id}
                            aria-label={image.altText || t('image.image')}
                            data-asset-id={image.assetId}
                            data-image-id={image.id}
                            height={image.height}
                            href={image.href}
                            pointerEvents="none"
                            preserveAspectRatio="xMidYMid meet"
                            role="img"
                            width={image.width}
                            x={image.x}
                            y={image.y}
                          />
                        ) : (
                          <g
                            key={image.id}
                            data-image-id={image.id}
                            data-image-state={image.state}
                            pointerEvents="none"
                          >
                            <rect
                              fill="#f4f3fb"
                              height={image.height}
                              rx={8}
                              stroke="#aaa4cf"
                              strokeDasharray="4 3"
                              width={image.width}
                              x={image.x}
                              y={image.y}
                            />
                            <text
                              fill="#5c5878"
                              fontSize={12}
                              textAnchor="middle"
                              x={image.x + image.width / 2}
                              y={image.y + image.height / 2}
                            >
                              {image.altText ||
                                (image.state === 'loading'
                                  ? t('image.loading')
                                  : t('image.unavailable'))}
                            </text>
                          </g>
                        ),
                      )}
                      {(sceneEquationsByNodeId.get(node.id) ?? []).map(
                        (equation) => {
                          if (equation.state === 'ready' && equation.svg) {
                            const intrinsicWidth =
                              Number(
                                /\bwidth=["']([0-9.]+)/i.exec(
                                  equation.svg,
                                )?.[1],
                              ) || equation.width
                            const intrinsicHeight =
                              Number(
                                /\bheight=["']([0-9.]+)/i.exec(
                                  equation.svg,
                                )?.[1],
                              ) || equation.height
                            return (
                              <g
                                key={equation.id}
                                aria-label={equation.source}
                                data-equation-id={equation.blockId}
                                pointerEvents="none"
                                role="img"
                                transform={`translate(${equation.x} ${equation.y}) scale(${equation.width / intrinsicWidth} ${equation.height / intrinsicHeight})`}
                                dangerouslySetInnerHTML={{
                                  __html: equation.svg,
                                }}
                              />
                            )
                          }
                          return (
                            <g
                              key={equation.id}
                              data-equation-id={equation.blockId}
                              data-equation-state={equation.state}
                              pointerEvents="none"
                            >
                              <rect
                                fill="#f4f3fb"
                                height={equation.height}
                                rx={8}
                                stroke="#aaa4cf"
                                strokeDasharray="4 3"
                                width={equation.width}
                                x={equation.x}
                                y={equation.y}
                              />
                              <text
                                fill="#5c5878"
                                fontSize={12}
                                textAnchor="middle"
                                x={equation.x + equation.width / 2}
                                y={equation.y + equation.height / 2}
                              >
                                {equation.state === 'loading'
                                  ? t('equation.loading')
                                  : t('equation.unavailable')}
                              </text>
                            </g>
                          )
                        },
                      )}
                      {node.markers.map((marker) => (
                        <g
                          key={marker.key}
                          aria-label={getLocalizedMarkerAriaLabel(
                            marker.kind,
                            marker.value,
                            t,
                          )}
                        >
                          <rect
                            fill={marker.fill}
                            height={marker.size}
                            rx={marker.size / 2}
                            width={marker.size}
                            x={marker.x}
                            y={marker.y}
                          />
                          <text
                            fill={marker.textColor}
                            fontSize={Math.max(8, marker.size * 0.48)}
                            textAnchor="middle"
                            x={marker.x + marker.size / 2}
                            y={marker.y + marker.size * 0.7}
                          >
                            {marker.label}
                          </text>
                        </g>
                      ))}
                      {sourceNode &&
                      sourceNode.childIds.length > 0 &&
                      isSelected &&
                      !isEditing &&
                      !isDragging ? (
                        <g
                          aria-label={
                            sourceNode.collapsed
                              ? t('canvas.expandTopic', {
                                  title: sourceNode.text,
                                })
                              : t('canvas.collapseTopic', {
                                  title: sourceNode.text,
                                })
                          }
                          className="node-collapse-control"
                          role="button"
                          tabIndex={-1}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleCollapse(node.id)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <circle cx={node.x + 11} cy={node.y + 11} r={8} />
                          <text
                            textAnchor="middle"
                            x={node.x + 11}
                            y={node.y + 15}
                          >
                            {sourceNode.collapsed ? '+' : '−'}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  )
                })}
              </g>
              <g className="mind-map-labels">
                {scene.labels.map((label) => (
                  <g
                    key={label.key}
                    aria-label={t('enhancement.topicLabel', {
                      label: label.text,
                    })}
                    className="mind-map-label"
                    data-label-id={label.labelId}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedNodeIds([label.nodeId])
                      setFilter({
                        ...filter,
                        labelIds: [label.labelId],
                      })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedNodeIds([label.nodeId])
                      setFilter({ ...filter, labelIds: [label.labelId] })
                    }}
                  >
                    <rect
                      fill={label.fill}
                      height={label.height}
                      rx={label.height / 2}
                      width={label.width}
                      x={label.x}
                      y={label.y}
                    />
                    <text
                      fill={label.textFill}
                      fontSize={11}
                      pointerEvents="none"
                      textAnchor="middle"
                      x={label.x + label.width / 2}
                      y={label.y + label.height * 0.68}
                    >
                      {label.text}
                    </text>
                  </g>
                ))}
              </g>
              <g className="mind-map-callouts">
                {scene.callouts.map((callout) => {
                  const isSelected =
                    selection.kind === 'callout' && selection.id === callout.id
                  const source = document.callouts.find(
                    (candidate) => candidate.id === callout.id,
                  )
                  const preview =
                    enhancementDragPreview?.kind === 'callout' &&
                    enhancementDragPreview.id === callout.id &&
                    source
                      ? enhancementDragPreview
                      : null
                  const delta =
                    preview && source
                      ? {
                          x: preview.offset.x - source.offset.x,
                          y: preview.offset.y - source.offset.y,
                        }
                      : { x: 0, y: 0 }
                  return (
                    <g
                      key={callout.id}
                      aria-label={t('enhancement.calloutLabel', {
                        label:
                          callout.textLines
                            .map((line) => line.text)
                            .join(' ') || t('enhancement.emptyCallout'),
                      })}
                      aria-pressed={isSelected}
                      className={`mind-map-callout${isSelected ? ' is-selected' : ''}`}
                      data-callout-id={callout.id}
                      role="button"
                      tabIndex={0}
                      transform={`translate(${delta.x} ${delta.y})`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelection({ kind: 'callout', id: callout.id })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        event.stopPropagation()
                        setSelection({ kind: 'callout', id: callout.id })
                      }}
                      onPointerDown={(event) => {
                        if (!source || event.button !== 0) return
                        event.preventDefault()
                        event.stopPropagation()
                        setSelection({ kind: 'callout', id: callout.id })
                        activePointerRef.current = {
                          type: 'callout',
                          enhancementId: callout.id,
                          startOffset: { ...source.offset },
                          pointerId: event.pointerId,
                          startClientPoint: {
                            x: event.clientX,
                            y: event.clientY,
                          },
                          startViewport: viewport,
                        }
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                    >
                      <path
                        className="enhancement-hit-path"
                        d={callout.connectorPath}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                      />
                      <path
                        d={callout.connectorPath}
                        fill="none"
                        pointerEvents="none"
                        stroke={callout.stroke}
                        strokeWidth={Math.max(1, callout.strokeWidth)}
                      />
                      <rect
                        fill={callout.fill}
                        height={callout.height}
                        rx={callout.cornerRadius}
                        stroke={callout.stroke}
                        strokeWidth={callout.strokeWidth}
                        width={callout.width}
                        x={callout.x}
                        y={callout.y}
                      />
                      {callout.textLines.map((line, index) => (
                        <text
                          key={`${callout.id}-line-${index}`}
                          fill={line.fill}
                          fontSize={line.fontSize}
                          fontStyle={line.fontStyle}
                          fontWeight={line.fontWeight}
                          pointerEvents="none"
                          x={line.x}
                          y={line.y}
                        >
                          {line.text}
                        </text>
                      ))}
                    </g>
                  )
                })}
              </g>
              {dragPreview && previewNode ? (
                <g className="drop-indicator" aria-hidden="true">
                  {dragPreview.placement === 'child' ? (
                    <rect
                      height={previewNode.height + 8}
                      rx={previewNode.cornerRadius + 4}
                      width={previewNode.width + 8}
                      x={previewNode.x - 4}
                      y={previewNode.y - 4}
                    />
                  ) : (
                    (() => {
                      const targetLayout = layoutNodesById.get(previewNode.id)
                      const horizontalSiblings =
                        targetLayout?.structure === 'tree-top' ||
                        targetLayout?.structure === 'org-top'
                      return (
                        <path
                          d={
                            horizontalSiblings
                              ? `M ${
                                  dragPreview.placement === 'before'
                                    ? previewNode.x - 5
                                    : previewNode.x + previewNode.width + 5
                                } ${previewNode.y - 12} V ${
                                  previewNode.y + previewNode.height + 12
                                }`
                              : `M ${previewNode.x - 12} ${
                                  dragPreview.placement === 'before'
                                    ? previewNode.y - 5
                                    : previewNode.y + previewNode.height + 5
                                } H ${previewNode.x + previewNode.width + 12}`
                          }
                        />
                      )
                    })()
                  )}
                </g>
              ) : null}
              <g className="mind-map-relationship-controls">
                {selection.kind === 'relationship'
                  ? scene.relationships
                      .filter(
                        (relationship) => relationship.id === selection.id,
                      )
                      .flatMap((relationship) =>
                        relationship.controlPoints.map((point, index) => {
                          const source = document.relationships.find(
                            (candidate) => candidate.id === relationship.id,
                          )?.controlPoints[index]
                          const preview =
                            enhancementDragPreview?.kind ===
                              'relationship-control' &&
                            enhancementDragPreview.id === relationship.id &&
                            enhancementDragPreview.index === index
                              ? enhancementDragPreview
                              : null
                          const delta =
                            preview && source
                              ? {
                                  x: preview.offset.x - source.x,
                                  y: preview.offset.y - source.y,
                                }
                              : { x: 0, y: 0 }
                          return (
                            <circle
                              key={`${relationship.id}-control-${index}`}
                              aria-label={t('enhancement.controlPoint', {
                                index: index + 1,
                              })}
                              className="relationship-control-point"
                              cx={point.x + delta.x}
                              cy={point.y + delta.y}
                              r={7}
                              role="button"
                              tabIndex={0}
                              onPointerDown={(event) => {
                                if (!source || event.button !== 0) return
                                event.preventDefault()
                                event.stopPropagation()
                                setSelection({
                                  kind: 'relationship',
                                  id: relationship.id,
                                })
                                activePointerRef.current = {
                                  type: 'relationship-control',
                                  enhancementId: relationship.id,
                                  controlPointIndex: index,
                                  startOffset: { ...source },
                                  pointerId: event.pointerId,
                                  startClientPoint: {
                                    x: event.clientX,
                                    y: event.clientY,
                                  },
                                  startViewport: viewport,
                                }
                                event.currentTarget.setPointerCapture(
                                  event.pointerId,
                                )
                              }}
                            />
                          )
                        }),
                      )
                  : null}
              </g>
            </svg>
            {quickCreateSceneNode && quickCreateSourceNode ? (
              <div className="topic-quick-create-controls">
                <button
                  aria-label={t('canvas.createChildTopic')}
                  className="topic-quick-create is-child"
                  style={{
                    left:
                      quickCreateSceneNode.x -
                      scene.bounds.x +
                      quickCreateSceneNode.width +
                      quickCreateButtonGap,
                    top:
                      quickCreateSceneNode.y -
                      scene.bounds.y +
                      quickCreateSceneNode.height / 2 -
                      quickCreateButtonSize / 2,
                  }}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    createChildFor(quickCreateSourceNode.id)
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  +
                </button>
                {quickCreateSourceNode.parentId ? (
                  <button
                    aria-label={t('canvas.createSiblingTopic')}
                    className="topic-quick-create is-sibling"
                    style={{
                      left:
                        quickCreateSceneNode.x -
                        scene.bounds.x +
                        quickCreateSceneNode.width / 2 -
                        quickCreateButtonSize / 2,
                      top:
                        quickCreateSceneNode.y -
                        scene.bounds.y +
                        quickCreateSceneNode.height +
                        quickCreateButtonGap,
                    }}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      createSiblingFor(quickCreateSourceNode.id)
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    +
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeDraft && activeSceneNode ? (
              <textarea
                ref={textEditorRef}
                aria-label={t('canvas.editTopic')}
                autoFocus
                className="node-text-editor"
                style={{
                  height: activeSceneNode.height,
                  left: activeSceneNode.x - scene.bounds.x,
                  top: activeSceneNode.y - scene.bounds.y,
                  width: activeSceneNode.width,
                  borderRadius: activeSceneNode.cornerRadius,
                  color: activeEditorStyle?.textColor,
                  fontFamily: activeEditorStyle?.fontFamily,
                  fontSize: activeEditorStyle?.fontSize,
                  fontStyle: activeEditorStyle?.fontStyle,
                  fontWeight: activeEditorStyle?.fontWeight,
                  textAlign: activeEditorStyle?.textAlign,
                  textDecoration: activeEditorStyle?.textDecoration,
                  lineHeight: `${textMetricsByNodeId[activeDraft.nodeId]?.lineHeight ?? Math.ceil((activeEditorStyle?.fontSize ?? 14) * 1.35)}px`,
                  overflowWrap: 'anywhere',
                  padding: `${defaultLayoutConfig.verticalPadding}px ${defaultLayoutConfig.horizontalPadding}px`,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
                value={activeDraft.value}
                onBlur={commitEditing}
                onChange={(event) =>
                  setDraft({
                    nodeId: activeDraft.nodeId,
                    value: event.target.value,
                  })
                }
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEditing()
                  }
                  if (
                    event.key === 'Enter' &&
                    (event.metaKey || event.ctrlKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
              />
            ) : null}
          </div>
        </div>
        {topicDragVisual && dragGhostNode && dragGhostSource ? (
          <div
            aria-hidden="true"
            className="topic-drag-ghost"
            data-topic-drag-ghost="true"
            style={{
              background: dragGhostNode.fill,
              borderColor: dragGhostNode.stroke,
              borderRadius: dragGhostNode.cornerRadius,
              borderStyle: dragGhostNode.strokeDasharray ? 'dashed' : 'solid',
              borderWidth: dragGhostNode.strokeWidth,
              color: dragGhostNode.textLines[0]?.fill,
              fontFamily: dragGhostNode.textLines[0]?.fontFamily,
              fontSize: dragGhostNode.textLines[0]?.fontSize,
              fontStyle: dragGhostNode.textLines[0]?.fontStyle,
              fontWeight: dragGhostNode.textLines[0]?.fontWeight,
              height: dragGhostNode.height,
              left: topicDragVisual.clientPoint.x + 14,
              top: topicDragVisual.clientPoint.y + 14,
              width: dragGhostNode.width,
            }}
          >
            {dragGhostSource.text}
          </div>
        ) : null}
      </div>
      <div className="canvas-search" role="search">
        <input
          aria-label={t('canvas.searchTopics')}
          placeholder={t('canvas.searchTopics')}
          value={search.query}
          onChange={(event) => updateSearchQuery(event.target.value)}
        />
        <span aria-live="polite">
          {search.query.length === 0
            ? t('canvas.searchMap')
            : search.resultNodeIds.length === 0
              ? t('canvas.noResults')
              : `${search.activeResultIndex + 1}/${search.resultNodeIds.length}`}
        </span>
        <button
          aria-label={t('canvas.previousResult')}
          disabled={search.resultNodeIds.length === 0}
          type="button"
          onClick={() => navigateSearchResult(-1)}
        >
          {t('canvas.previous')}
        </button>
        <button
          aria-label={t('canvas.nextResult')}
          disabled={search.resultNodeIds.length === 0}
          type="button"
          onClick={() => navigateSearchResult(1)}
        >
          {t('canvas.next')}
        </button>
      </div>
      <div className="canvas-navigation" aria-label={t('canvas.navigation')}>
        <button
          aria-label={t('canvas.zoomOut')}
          type="button"
          onClick={() =>
            zoomAtCanvasPoint(
              { x: canvasSize.width / 2, y: canvasSize.height / 2 },
              -0.1,
            )
          }
        >
          −
        </button>
        <output aria-label={t('canvas.currentZoom')}>
          {Math.round(viewport.zoom * 100)}%
        </output>
        <button
          aria-label={t('canvas.zoomIn')}
          type="button"
          onClick={() =>
            zoomAtCanvasPoint(
              { x: canvasSize.width / 2, y: canvasSize.height / 2 },
              0.1,
            )
          }
        >
          +
        </button>
        <button type="button" onClick={fitToContent}>
          {t('canvas.fit')}
        </button>
        <button type="button" onClick={centerSelected}>
          {t('canvas.centerSelected')}
        </button>
      </div>
      {hasFilterMatchOutsideFocus ? (
        <p className="canvas-notice" role="status">
          {t('focus.outsideFilter')}
        </p>
      ) : notice ? (
        <p className="canvas-notice" role="status">
          {translateMessage(t, notice)}
        </p>
      ) : null}
    </section>
  )
}
