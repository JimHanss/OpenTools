import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'

import {
  createMindMapClipboardPayload,
  duplicateMindMapClipboardPayload,
  findNodeIdsByText,
  getAncestorNodeIds,
  getDescendantNodeIds,
  mindMapCommandTypes,
  normalizeTopLevelNodeSelection,
  type CommandResult,
  type MindMapClipboardPayload,
  type MindMapCommand,
  type MindMapNodeId,
} from '@opentools/mindmap-core'
import { layoutMindMap } from '@opentools/mindmap-layout'
import { createMindMapSvgScene } from '@opentools/mindmap-renderer-svg'

import {
  createBatchMoveCommand,
  createChildNodeCommand,
  createDeleteNodesCommand,
  createSiblingNodeCommand,
} from '../editor/actions'
import { getEditorKeyboardShortcut } from '../editor/keyboard'
import type { EditorSessionSnapshot } from '../editor/session'
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
  readonly onExecute: (command: MindMapCommand) => CommandResult | undefined
  readonly onRedo: () => CommandResult | undefined
  readonly onUndo: () => CommandResult | undefined
  readonly session: EditorSessionSnapshot
}

interface TextDraft {
  readonly nodeId: MindMapNodeId
  readonly value: string
}

interface ActivePointerInteraction {
  readonly nodeIds?: readonly MindMapNodeId[]
  readonly pointerId: number
  readonly startClientPoint: CanvasPoint
  readonly startViewport: EditorViewport
  readonly type: 'drag' | 'pan'
}

interface SceneNodeBounds extends CanvasRect {
  readonly id: MindMapNodeId
}

const emptyCanvasSize: ViewportSize = { width: 0, height: 0 }

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
  onExecute,
  onRedo,
  onUndo,
  session,
}: MindMapCanvasProps) {
  const { t } = useTranslation()
  const { document } = session
  const selectedNodeIds = useEditorUiStore((state) => state.selectedNodeIds)
  const editingNodeId = useEditorUiStore((state) => state.editingNodeId)
  const viewport = useEditorUiStore((state) => state.viewport)
  const dragPreview = useEditorUiStore((state) => state.dragPreview)
  const search = useEditorUiStore((state) => state.search)
  const setEditingNodeId = useEditorUiStore((state) => state.setEditingNodeId)
  const setSelectedNodeIds = useEditorUiStore(
    (state) => state.setSelectedNodeIds,
  )
  const toggleSelectedNodeId = useEditorUiStore(
    (state) => state.toggleSelectedNodeId,
  )
  const setDragPreview = useEditorUiStore((state) => state.setDragPreview)
  const setSearch = useEditorUiStore((state) => state.setSearch)
  const setViewport = useEditorUiStore((state) => state.setViewport)
  const [draft, setDraft] = useState<TextDraft | null>(null)
  const [notice, setNotice] = useState<LocalizedMessage | null>(null)
  const [canvasSize, setCanvasSize] = useState<ViewportSize>(emptyCanvasSize)
  const clipboardRef = useRef<MindMapClipboardPayload | undefined>(undefined)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activePointerRef = useRef<ActivePointerInteraction | null>(null)
  const lastCenteredSearchNodeIdRef = useRef<MindMapNodeId | null>(null)
  const suppressClickRef = useRef(false)

  const layout = useMemo(() => layoutMindMap(document), [document])
  const scene = useMemo(
    () => localizeMindMapSvgScene(createMindMapSvgScene(document, layout), t),
    [document, layout, t],
  )
  const sceneNodesById = useMemo(
    () => new Map(scene.nodes.map((node) => [node.id, node])),
    [scene.nodes],
  )
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
  const activeDraft = draft && editingNodeId === draft.nodeId ? draft : null
  const activeSceneNode = activeDraft
    ? sceneNodesById.get(activeDraft.nodeId)
    : undefined

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
    [document, onExecute, search, setSearch, setSelectedNodeIds],
  )

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

  const createSibling = useCallback(() => {
    const nodeId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
    if (!nodeId) return
    const newNodeId = createPlatformId('node')
    const text = t('defaults.newTopic')
    const result = onExecute(
      createSiblingNodeCommand(document, nodeId, newNodeId, text),
    )
    if (result) beginNewNodeEditing(newNodeId, text)
  }, [beginNewNodeEditing, document, onExecute, selectedNodeIds, t])

  const createChild = useCallback(() => {
    const nodeId = getSelectionOrRoot(selectedNodeIds, document.rootNodeId)[0]
    if (!nodeId) return
    const newNodeId = createPlatformId('node')
    const text = t('defaults.newTopic')
    const result = onExecute(
      createChildNodeCommand(document, nodeId, newNodeId, text),
    )
    if (result) beginNewNodeEditing(newNodeId, text)
  }, [beginNewNodeEditing, document, onExecute, selectedNodeIds, t])

  const deleteSelection = useCallback(() => {
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
    setSelectedNodeIds,
  ])

  const copySelection = useCallback(async () => {
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
  }, [document, selectedNodeIds])

  const pasteSelection = useCallback(async () => {
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
  }, [document, onExecute, selectedNodeIds, setSelectedNodeIds])

  const cutSelection = useCallback(async () => {
    await copySelection()
    deleteSelection()
  }, [copySelection, deleteSelection])

  const duplicateSelection = useCallback(() => {
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
  }, [document, onExecute, selectedNodeIds, setSelectedNodeIds])

  const clearPointerInteraction = useCallback(() => {
    activePointerRef.current = null
    setDragPreview(null)
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

      const relativeY = (point.y - target.y) / target.height
      return {
        nodeIds,
        targetNodeId: target.id,
        placement:
          relativeY < 0.28 ? 'before' : relativeY > 0.72 ? 'after' : 'child',
      }
    },
    [document, sceneNodeBounds],
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

      onExecute(
        createBatchMoveCommand(document, preview.nodeIds, parentId, index),
      )
    },
    [document, onExecute],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isEditableTarget(event.target)) return

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
      activePointerRef.current =
        nodeIds && nodeIds.length > 0
          ? { ...start, nodeIds, type: 'drag' }
          : { ...start, type: 'pan' }
      suppressClickRef.current = false
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
      suppressClickRef.current = true

      if (active.type === 'pan') {
        setViewport(panViewport(active.startViewport, delta))
        return
      }

      const point = getCoordinateAdapter().clientToScenePoint({
        x: event.clientX,
        y: event.clientY,
      })
      if (active.nodeIds) setDragPreview(getDropPreview(active.nodeIds, point))
    },
    [getCoordinateAdapter, getDropPreview, setDragPreview, setViewport],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = activePointerRef.current
      if (!active || active.pointerId !== event.pointerId) return

      const preview = useEditorUiStore.getState().dragPreview
      if (active.type === 'drag' && preview && active.nodeIds) {
        commitDropPreview(preview)
      }
      clearPointerInteraction()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [clearPointerInteraction, commitDropPreview],
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
      switch (shortcut) {
        case 'create-sibling':
          createSibling()
          break
        case 'create-child':
          createChild()
          break
        case 'delete':
          deleteSelection()
          break
        case 'undo':
          onUndo()
          break
        case 'redo':
          onRedo()
          break
        case 'copy':
          void copySelection()
          break
        case 'cut':
          void cutSelection()
          break
        case 'paste':
          void pasteSelection()
          break
        case 'duplicate':
          duplicateSelection()
          break
        case 'select-all':
          setSelectedNodeIds(Object.keys(document.nodes))
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', clearPointerInteraction)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', clearPointerInteraction)
    }
  }, [
    clearPointerInteraction,
    copySelection,
    createChild,
    createSibling,
    cutSelection,
    deleteSelection,
    document.nodes,
    duplicateSelection,
    editingNodeId,
    onRedo,
    onUndo,
    pasteSelection,
    setSelectedNodeIds,
  ])

  const previewNode = dragPreview
    ? sceneNodesById.get(dragPreview.targetNodeId)
    : undefined

  return (
    <section className="mind-map-canvas" aria-label={t('canvas.label')}>
      <div className="canvas-hint" aria-hidden="true">
        {t('canvas.hint')}
      </div>
      <div
        ref={scrollRef}
        className="mind-map-scroll"
        onClick={handleCanvasClick}
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
              <g className="mind-map-boundaries" aria-hidden="true">
                {scene.boundaries.map((boundary) => (
                  <g key={boundary.id} className="mind-map-boundary">
                    <rect
                      fill="#e9e7ff"
                      fillOpacity={0.45}
                      height={boundary.height}
                      rx={16}
                      stroke="#8c82e7"
                      strokeDasharray="6 4"
                      width={boundary.width}
                      x={boundary.x}
                      y={boundary.y}
                    />
                    <text
                      fill="#4b458a"
                      fontSize={12}
                      fontWeight="semibold"
                      x={boundary.x + 12}
                      y={boundary.y + 17}
                    >
                      {boundary.label}
                    </text>
                  </g>
                ))}
              </g>
              <g className="mind-map-connectors" aria-hidden="true">
                {scene.connectors.map((connector) => (
                  <path
                    key={connector.id}
                    d={connector.path}
                    fill="none"
                    stroke={connector.stroke}
                    strokeWidth={connector.strokeWidth}
                  />
                ))}
              </g>
              <g className="mind-map-relationships" aria-hidden="true">
                {scene.relationships.map((relationship) => (
                  <g key={relationship.id} className="mind-map-relationship">
                    <path
                      d={relationship.path}
                      fill="none"
                      stroke="#e07850"
                      strokeDasharray="5 4"
                      strokeWidth={2}
                    />
                    <text
                      fill="#99422b"
                      fontSize={12}
                      textAnchor="middle"
                      x={relationship.labelX}
                      y={relationship.labelY}
                    >
                      {relationship.label}
                    </text>
                  </g>
                ))}
              </g>
              <g className="mind-map-summaries" aria-hidden="true">
                {scene.summaries.map((summary) => (
                  <g key={summary.id} className="mind-map-summary">
                    <path
                      d={summary.path}
                      fill="none"
                      stroke="#36a47f"
                      strokeWidth={2}
                    />
                    <text
                      fill="#176245"
                      fontSize={12}
                      fontWeight="semibold"
                      x={summary.labelX}
                      y={summary.labelY}
                    >
                      {summary.label}
                    </text>
                  </g>
                ))}
              </g>
              <g className="mind-map-nodes">
                {scene.nodes.map((node) => {
                  const isSelected = selectedNodeIds.includes(node.id)
                  const isEditing = editingNodeId === node.id
                  const isDragging = dragPreview?.nodeIds.includes(node.id)
                  const isSearchResult = search.resultNodeIds.includes(node.id)
                  const isActiveSearchResult =
                    search.resultNodeIds[search.activeResultIndex] === node.id
                  const sourceNode = document.nodes[node.id]
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
                        stroke={node.stroke}
                      />
                      {isEditing
                        ? null
                        : node.textLines.map((line, index) => (
                            <text
                              key={`${node.id}-line-${index}`}
                              fill={line.fill}
                              fontSize={line.fontSize}
                              fontStyle={line.fontStyle}
                              fontWeight={line.fontWeight}
                              x={line.x}
                              y={line.y}
                            >
                              {line.text}
                            </text>
                          ))}
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
                      {sourceNode && sourceNode.childIds.length > 0 ? (
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
                    <path
                      d={`M ${previewNode.x - 12} ${
                        dragPreview.placement === 'before'
                          ? previewNode.y - 5
                          : previewNode.y + previewNode.height + 5
                      } H ${previewNode.x + previewNode.width + 12}`}
                    />
                  )}
                </g>
              ) : null}
            </svg>
            {activeDraft && activeSceneNode ? (
              <textarea
                aria-label={t('canvas.editTopic')}
                autoFocus
                className="node-text-editor"
                style={{
                  height: activeSceneNode.height,
                  left: activeSceneNode.x - scene.bounds.x,
                  top: activeSceneNode.y - scene.bounds.y,
                  width: activeSceneNode.width,
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
      {notice ? (
        <p className="canvas-notice" role="status">
          {translateMessage(t, notice)}
        </p>
      ) : null}
    </section>
  )
}
