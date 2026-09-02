import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createMindMapBoundary,
  createMindMapCallout,
  createMindMapNode,
  createMindMapRelationship,
  createMindMapSummary,
  createTidyLayoutPreview,
  getComputedMindMapNodeStyle,
  getMindMapThemePreset,
  getReferencedMindMapAssetIds,
  mindMapCommandTypes,
  type CommandResult,
  type MindMapCommand,
} from '@opentools/mindmap-core'
import {
  serializeMindMapBundle,
  serializeMindMapDocument,
} from '@opentools/mindmap-format'
import type { MindMapAssetRepository } from '@opentools/mindmap-storage'

import { MindMapCanvas } from './mind-map-canvas'
import { FilterPanel } from './filter-panel'
import { TopicInspector } from './topic-inspector'
import { LanguageSwitcher } from './language-switcher'
import type { EditorSessionSnapshot } from '../editor/session'
import { getSelectedTopicIds } from '../editor/selection'
import { useEditorUiStore } from '../editor/store'
import { useRenderableMindMapAssets } from '../editor/use-renderable-assets'
import { useRenderableMindMapEquations } from '../editor/use-renderable-equations'
import { insertBrowserImage } from '../editor/image-actions'
import {
  createBatchStyleCommand,
  createResetStyleCommand,
} from '../editor/actions'
import {
  EditorActionDispatcher,
  editorActionIds,
  type EditorActionId,
  type EditorActionRuntime,
} from '../editor/action-registry'
import {
  localizedMessage,
  translateMessage,
  type LocalizedMessage,
} from '../i18n/messages'
import { toLocalizedError } from '../i18n/errors'
import { localizeMindMapSvgScene } from '../i18n/scene'
import {
  createSafeDownloadFilename,
  downloadBrowserFile,
  renderSvgAsPng,
} from '../platform/file-transfer'
import {
  BrowserImageError,
  getClipboardImageBlob,
} from '../platform/image-decoder'
import { createPlatformId } from '../platform/ids'
import { MathJaxEquationRenderer } from '../platform/equation-renderer'
import { EditorActionToolbar } from './editor-action-toolbar'

export interface EditorShellProps {
  readonly assetRepository: MindMapAssetRepository
  readonly error: string | null
  readonly isBusy: boolean
  readonly onExecute: (command: MindMapCommand) => CommandResult | undefined
  readonly onImport: (file: File) => Promise<void>
  readonly onRename: (title: string) => void
  readonly onRedo: () => CommandResult | undefined
  readonly onReturnToLibrary: () => Promise<void>
  readonly onUndo: () => CommandResult | undefined
  readonly session: EditorSessionSnapshot
}

function getSaveStatusKey(
  session: EditorSessionSnapshot,
):
  | 'editor.save.saving'
  | 'editor.save.saved'
  | 'editor.save.error'
  | 'editor.save.idle' {
  switch (session.saveStatus.state) {
    case 'saving':
      return 'editor.save.saving'
    case 'saved':
      return 'editor.save.saved'
    case 'error':
      return 'editor.save.error'
    case 'idle':
      return 'editor.save.idle'
  }
}

export function EditorShell({
  assetRepository,
  error,
  isBusy,
  onExecute,
  onImport,
  onRename,
  onRedo,
  onReturnToLibrary,
  onUndo,
  session,
}: EditorShellProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(session.document.title)
  const [exportNotice, setExportNotice] = useState<LocalizedMessage | null>(
    null,
  )
  const [imageNotice, setImageNotice] = useState<LocalizedMessage | null>(null)
  const [isImageBusy, setIsImageBusy] = useState(false)
  const [pendingActionIds, setPendingActionIds] = useState<
    ReadonlySet<EditorActionId>
  >(new Set())
  const [, setActionHandlerRevision] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const actionHandlersRef = useRef<
    Partial<Record<EditorActionId, () => unknown | Promise<unknown>>>
  >({})
  const actionRuntimeRef = useRef<EditorActionRuntime | null>(null)
  const actionDispatcher = useMemo(
    () =>
      new EditorActionDispatcher(() => {
        const runtime = actionRuntimeRef.current
        if (!runtime) throw new Error('Editor action runtime is not ready.')
        return runtime
      }),
    [],
  )
  const selection = useEditorUiStore((state) => state.selection)
  const branchFocus = useEditorUiStore((state) => state.branchFocus)
  const styleClipboard = useEditorUiStore((state) => state.styleClipboard)
  const notifyActionHandlersChange = useCallback(
    () => setActionHandlerRevision((revision) => revision + 1),
    [],
  )
  const tidyPreview = useMemo(
    () => createTidyLayoutPreview(session.document),
    [session.document],
  )
  const renderableAssets = useRenderableMindMapAssets(
    session.document,
    assetRepository,
  )
  const equationRenderer = useMemo(() => new MathJaxEquationRenderer(), [])
  const renderableEquations = useRenderableMindMapEquations(
    session.document,
    equationRenderer,
  )

  useEffect(() => {
    setTitle(session.document.title)
  }, [session.document.id, session.document.title])

  function commitTitle() {
    const nextTitle = title.trim() || t('defaults.untitledMap')
    if (nextTitle !== title) setTitle(nextTitle)
    if (nextTitle !== session.document.title) onRename(nextTitle)
  }

  async function exportJson() {
    try {
      setExportNotice(null)
      const referencedAssetIds = getReferencedMindMapAssetIds(session.document)
      let source: string
      if (referencedAssetIds.size === 0) {
        source = serializeMindMapDocument(session.document)
      } else {
        const storedAssets = await assetRepository.listByMap(
          session.document.id,
        )
        source = await serializeMindMapBundle(
          session.document,
          await Promise.all(
            storedAssets
              .filter((asset) => referencedAssetIds.has(asset.id))
              .map(async (asset) => ({
                metadata: asset.metadata,
                bytes: new Uint8Array(await asset.blob.arrayBuffer()),
              })),
          ),
        )
      }
      downloadBrowserFile(
        source,
        'application/json;charset=utf-8',
        createSafeDownloadFilename(session.document.title, 'json'),
      )
    } catch (error) {
      setExportNotice(toLocalizedError(error, 'errors.image.exportFailed'))
    }
  }

  async function prepareExport() {
    const { prepareMindMapExport } = await import('../editor/export-pipeline')
    return prepareMindMapExport({
      assetRepository,
      document: session.document,
      equationRenderer,
      transformScene: (scene) => localizeMindMapSvgScene(scene, t),
    })
  }

  async function exportSvg() {
    try {
      setExportNotice(null)
      downloadBrowserFile(
        (await prepareExport()).svg,
        'image/svg+xml;charset=utf-8',
        createSafeDownloadFilename(session.document.title, 'svg'),
      )
    } catch (error) {
      setExportNotice(toLocalizedError(error, 'errors.export.renderFailed'))
    }
  }

  async function exportPng() {
    let preparedSvg: string | undefined
    try {
      setExportNotice(null)
      const prepared = await prepareExport()
      preparedSvg = prepared.svg
      const blob = await renderSvgAsPng(prepared.svg)
      downloadBrowserFile(
        blob,
        'image/png',
        createSafeDownloadFilename(session.document.title, 'png'),
      )
      setExportNotice(localizedMessage('messages.pngDownloaded'))
    } catch (error) {
      if (preparedSvg) {
        downloadBrowserFile(
          preparedSvg,
          'image/svg+xml;charset=utf-8',
          createSafeDownloadFilename(session.document.title, 'svg'),
        )
        setExportNotice(
          localizedMessage('messages.pngFallbackWithReason', {
            reason: translateMessage(
              t,
              toLocalizedError(error, 'errors.export.renderFailed'),
            ),
          }),
        )
      } else {
        setExportNotice(toLocalizedError(error, 'errors.export.renderFailed'))
      }
    }
  }

  async function addImage(nodeId: string, source: Blob) {
    setImageNotice(null)
    setIsImageBusy(true)
    try {
      await insertBrowserImage({
        document: session.document,
        nodeId,
        source,
        repository: assetRepository,
        execute: onExecute,
        createId: () => createPlatformId('image-block'),
      })
    } catch (error) {
      setImageNotice(
        error instanceof BrowserImageError
          ? localizedMessage(`errors.image.${error.code}`)
          : toLocalizedError(error, 'errors.image.insertFailed'),
      )
    } finally {
      setIsImageBusy(false)
    }
  }

  function tidyLayout() {
    const count = tidyPreview.changedParentIds.length
    if (count === 0) {
      setExportNotice(localizedMessage('messages.tidyAlreadyClear'))
      return
    }
    onExecute({
      type: mindMapCommandTypes.tidyLayout,
      label: 'Tidy all topic order',
      payload: { childIdsByParent: tidyPreview.childIdsByParent },
    })
    setExportNotice(localizedMessage('messages.tidyReordered', { count }))
  }

  function focusInspector(selector: string) {
    const target = globalThis.document.querySelector<HTMLElement>(selector)
    target?.scrollIntoView({ block: 'nearest' })
    const focusable = target?.matches('button,input,select,textarea')
      ? target
      : target?.querySelector<HTMLElement>('button,input,select,textarea')
    focusable?.focus()
  }

  async function runPendingAction(
    id: EditorActionId,
    operation: () => unknown | Promise<unknown>,
  ) {
    setPendingActionIds((current) => new Set([...current, id]))
    try {
      return await operation()
    } finally {
      setPendingActionIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const selectedTopicIds = getSelectedTopicIds(selection)
  const selectedNodeId = selectedTopicIds[0]
  const setStructure = (
    structure:
      | 'logic-right'
      | 'logic-left'
      | 'mind-map-balanced'
      | 'tree-top'
      | 'org-top',
  ) => {
    if (!selectedNodeId || selectedNodeId === session.document.rootNodeId) {
      return onExecute({
        type: mindMapCommandTypes.setDefaultStructure,
        label: 'Update map structure',
        payload: { structure },
      })
    }
    return onExecute({
      type: mindMapCommandTypes.setNodeStructure,
      label: 'Update branch structure',
      payload: { nodeId: selectedNodeId, structure },
    })
  }

  Object.assign(actionHandlersRef.current, {
    [editorActionIds.undo]: onUndo,
    [editorActionIds.redo]: onRedo,
    [editorActionIds.tidy]: tidyLayout,
    [editorActionIds.logicRight]: () => setStructure('logic-right'),
    [editorActionIds.logicLeft]: () => setStructure('logic-left'),
    [editorActionIds.mindMapBalanced]: () => setStructure('mind-map-balanced'),
    [editorActionIds.treeTop]: () => setStructure('tree-top'),
    [editorActionIds.orgTop]: () => setStructure('org-top'),
    [editorActionIds.insertParent]: () => {
      if (!selectedNodeId) return
      const nodeId = createPlatformId('node')
      const result = onExecute({
        type: mindMapCommandTypes.insertParent,
        label: 'Insert parent topic',
        payload: {
          targetNodeId: selectedNodeId,
          node: createMindMapNode({
            id: nodeId,
            parentId: null,
            text: t('defaults.newTopic'),
          }),
        },
      })
      if (result) {
        useEditorUiStore.getState().setSelectedNodeIds([nodeId])
        useEditorUiStore.getState().setEditingNodeId(nodeId)
      }
    },
    [editorActionIds.deleteKeepChildren]: () => {
      if (!selectedNodeId) return
      onExecute({
        type: mindMapCommandTypes.deleteNodeKeepChildren,
        label: 'Delete topic and keep children',
        payload: { nodeId: selectedNodeId },
      })
    },
    [editorActionIds.insertFloatingTopic]: () => {
      const nodeId = createPlatformId('node')
      const result = onExecute({
        type: mindMapCommandTypes.createFloatingTopic,
        label: 'Create floating topic',
        payload: {
          node: createMindMapNode({
            id: nodeId,
            parentId: null,
            text: t('defaults.newTopic'),
          }),
          placement: { x: 480, y: 120 },
        },
      })
      if (result) {
        useEditorUiStore.getState().setSelectedNodeIds([nodeId])
        useEditorUiStore.getState().setEditingNodeId(nodeId)
      }
    },
    [editorActionIds.insertRelationship]: () => {
      if (selectedTopicIds.length !== 2) return
      onExecute({
        type: mindMapCommandTypes.createRelationship,
        label: 'Create relationship',
        payload: {
          relationship: createMindMapRelationship({
            id: createPlatformId('relationship'),
            fromNodeId: selectedTopicIds[0]!,
            toNodeId: selectedTopicIds[1]!,
            label: t('defaults.related'),
          }),
        },
      })
    },
    [editorActionIds.insertBoundary]: () => {
      if (selectedTopicIds.length < 2) return
      onExecute({
        type: mindMapCommandTypes.createBoundary,
        label: 'Create boundary',
        payload: {
          boundary: createMindMapBoundary({
            id: createPlatformId('boundary'),
            nodeIds: [...selectedTopicIds],
            label: t('defaults.boundary'),
          }),
        },
      })
    },
    [editorActionIds.insertSummary]: () => {
      if (selectedTopicIds.length < 2) return
      onExecute({
        type: mindMapCommandTypes.createSummary,
        label: 'Create summary',
        payload: {
          summary: createMindMapSummary({
            id: createPlatformId('summary'),
            nodeIds: [...selectedTopicIds],
            label: t('defaults.summary'),
          }),
        },
      })
    },
    [editorActionIds.insertCallout]: () => {
      if (!selectedNodeId) return
      onExecute({
        type: mindMapCommandTypes.createCallout,
        label: 'Create callout',
        payload: {
          callout: createMindMapCallout({
            id: createPlatformId('callout'),
            ownerNodeId: selectedNodeId,
            text: t('defaults.callout'),
          }),
        },
      })
    },
    [editorActionIds.copyStyle]: () => {
      if (!selectedNodeId) return
      useEditorUiStore
        .getState()
        .setStyleClipboard(
          getComputedMindMapNodeStyle(session.document, selectedNodeId),
        )
    },
    [editorActionIds.pasteStyle]: () => {
      if (!styleClipboard || selectedTopicIds.length === 0) return
      onExecute(
        createBatchStyleCommand(
          session.document,
          selectedTopicIds,
          styleClipboard,
        ),
      )
    },
    [editorActionIds.resetStyle]: () => {
      if (selectedTopicIds.length === 0) return
      onExecute(createResetStyleCommand(session.document, selectedTopicIds))
    },
    [editorActionIds.openStyle]: () => focusInspector('.topic-style-controls'),
    [editorActionIds.themeClassic]: () =>
      onExecute({
        type: mindMapCommandTypes.updateTheme,
        label: 'Use classic theme',
        payload: { theme: getMindMapThemePreset('classic')! },
      }),
    [editorActionIds.themeOcean]: () =>
      onExecute({
        type: mindMapCommandTypes.updateTheme,
        label: 'Use ocean theme',
        payload: { theme: getMindMapThemePreset('ocean')! },
      }),
    [editorActionIds.themeForest]: () =>
      onExecute({
        type: mindMapCommandTypes.updateTheme,
        label: 'Use forest theme',
        payload: { theme: getMindMapThemePreset('forest')! },
      }),
    [editorActionIds.themeSunset]: () =>
      onExecute({
        type: mindMapCommandTypes.updateTheme,
        label: 'Use sunset theme',
        payload: { theme: getMindMapThemePreset('sunset')! },
      }),
    [editorActionIds.insertMarker]: () =>
      focusInspector('.topic-inspector [aria-label] select'),
    [editorActionIds.insertLabel]: () => focusInspector('.semantic-inspector'),
    [editorActionIds.insertNotes]: () =>
      focusInspector('.topic-inspector textarea'),
    [editorActionIds.insertLink]: () => focusInspector('.topic-link-form'),
    [editorActionIds.insertImage]: () =>
      focusInspector('.image-inspector button'),
    [editorActionIds.insertEquation]: () =>
      focusInspector('.equation-inspector button'),
    [editorActionIds.importJson]: () => importInputRef.current?.click(),
    [editorActionIds.exportJson]: () =>
      runPendingAction(editorActionIds.exportJson, exportJson),
    [editorActionIds.exportSvg]: () =>
      runPendingAction(editorActionIds.exportSvg, exportSvg),
    [editorActionIds.exportPng]: () =>
      runPendingAction(editorActionIds.exportPng, exportPng),
  } satisfies Partial<Record<EditorActionId, () => unknown | Promise<unknown>>>)

  actionRuntimeRef.current = {
    document: session.document,
    selection,
    branchFocus,
    canUndo: session.canUndo,
    canRedo: session.canRedo,
    isBusy,
    pendingActionIds,
    hasStyleClipboard: Boolean(styleClipboard),
    handlers: actionHandlersRef.current,
  }

  return (
    <main className="editor-page">
      <header className="editor-header">
        <button
          className="back-button"
          disabled={isBusy}
          type="button"
          onClick={() => void onReturnToLibrary()}
        >
          {t('editor.backToLibrary')}
        </button>
        <input
          aria-label={t('editor.mapTitle')}
          className="map-title"
          value={title}
          onBlur={commitTitle}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span
          className={`save-status save-status-${session.saveStatus.state}`}
          role="status"
        >
          <span className="status-dot" />
          {t(getSaveStatusKey(session))}
        </span>
        <LanguageSwitcher />
        <div className="header-file-actions" aria-label={t('toolbar.file')}>
          <input
            ref={importInputRef}
            accept="application/json,.json"
            aria-label={t('editor.importJsonFile')}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void onImport(file)
            }}
          />
          <button
            disabled={isBusy}
            type="button"
            onClick={() =>
              void actionDispatcher.dispatch(editorActionIds.importJson)
            }
          >
            {t('editor.importJson')}
          </button>
          <button
            type="button"
            onClick={() =>
              void actionDispatcher.dispatch(editorActionIds.exportJson)
            }
          >
            {t('editor.exportJson')}
          </button>
          <button
            type="button"
            onClick={() =>
              void actionDispatcher.dispatch(editorActionIds.exportSvg)
            }
          >
            {t('editor.exportSvg')}
          </button>
          <button
            type="button"
            onClick={() =>
              void actionDispatcher.dispatch(editorActionIds.exportPng)
            }
          >
            {t('editor.exportPng')}
          </button>
        </div>
      </header>

      <section
        className="editor-workspace"
        aria-label={t('editor.workspace')}
        onPaste={(event) => {
          const image = getClipboardImageBlob(event.clipboardData)
          const selectedNodeIds = getSelectedTopicIds(
            useEditorUiStore.getState().selection,
          )
          if (!image || selectedNodeIds.length !== 1) return
          event.preventDefault()
          void addImage(selectedNodeIds[0]!, image)
        }}
      >
        <div className="editor-workspace-chrome">
          <div className="editor-notices">
            {error ? (
              <p className="operation-error" role="alert">
                {error}
              </p>
            ) : null}
            {exportNotice ? (
              <p className="export-notice" role="status">
                {translateMessage(t, exportNotice)}
              </p>
            ) : null}
            {imageNotice ? (
              <p className="operation-error" role="alert">
                {translateMessage(t, imageNotice)}
              </p>
            ) : null}
          </div>
          <EditorActionToolbar
            dispatcher={actionDispatcher}
            revision={session.revision}
          />
          <div className="editor-secondary-bar">
            <p>
              {t('editor.topicCount', {
                count: Object.keys(session.document.nodes).length,
                revision: session.revision,
              })}
            </p>
            <FilterPanel document={session.document} />
          </div>
        </div>
        <div className="editor-content">
          <MindMapCanvas
            actionDispatcher={actionDispatcher}
            actionHandlers={actionHandlersRef.current}
            assets={renderableAssets}
            equations={renderableEquations}
            onExecute={onExecute}
            onActionHandlersChange={notifyActionHandlersChange}
            session={session}
          />
          <TopicInspector
            actionDispatcher={actionDispatcher}
            assets={renderableAssets}
            document={session.document}
            equationRenderer={equationRenderer}
            equations={renderableEquations}
            isImageBusy={isImageBusy}
            onExecute={onExecute}
            onInsertImage={addImage}
          />
        </div>
      </section>
    </main>
  )
}
