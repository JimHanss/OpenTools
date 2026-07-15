import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createTidyLayoutPreview,
  mindMapCommandTypes,
  type CommandResult,
  type MindMapCommand,
} from '@opentools/mindmap-core'
import { serializeMindMapDocument } from '@opentools/mindmap-format'
import { layoutMindMap } from '@opentools/mindmap-layout'
import {
  createMindMapSvgScene,
  serializeMindMapSvgScene,
} from '@opentools/mindmap-renderer-svg'

import { MindMapCanvas } from './mind-map-canvas'
import { TopicInspector } from './topic-inspector'
import { LanguageSwitcher } from './language-switcher'
import type { EditorSessionSnapshot } from '../editor/session'
import {
  localizedMessage,
  translateMessage,
  type LocalizedMessage,
} from '../i18n/messages'
import { localizeMindMapSvgScene } from '../i18n/scene'
import {
  createSafeDownloadFilename,
  downloadBrowserFile,
  renderSvgAsPng,
} from '../platform/file-transfer'

export interface EditorShellProps {
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
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const tidyPreview = useMemo(
    () => createTidyLayoutPreview(session.document),
    [session.document],
  )

  useEffect(() => {
    setTitle(session.document.title)
  }, [session.document.id, session.document.title])

  function commitTitle() {
    const nextTitle = title.trim() || t('defaults.untitledMap')
    if (nextTitle !== title) setTitle(nextTitle)
    if (nextTitle !== session.document.title) onRename(nextTitle)
  }

  function exportJson() {
    setExportNotice(null)
    downloadBrowserFile(
      serializeMindMapDocument(session.document),
      'application/json;charset=utf-8',
      createSafeDownloadFilename(session.document.title, 'json'),
    )
  }

  function getExportSvg() {
    return serializeMindMapSvgScene(
      localizeMindMapSvgScene(
        createMindMapSvgScene(
          session.document,
          layoutMindMap(session.document),
        ),
        t,
      ),
    )
  }

  function exportSvg() {
    setExportNotice(null)
    downloadBrowserFile(
      getExportSvg(),
      'image/svg+xml;charset=utf-8',
      createSafeDownloadFilename(session.document.title, 'svg'),
    )
  }

  async function exportPng() {
    try {
      const blob = await renderSvgAsPng(getExportSvg())
      downloadBrowserFile(
        blob,
        'image/png',
        createSafeDownloadFilename(session.document.title, 'png'),
      )
      setExportNotice(localizedMessage('messages.pngDownloaded'))
    } catch {
      downloadBrowserFile(
        getExportSvg(),
        'image/svg+xml;charset=utf-8',
        createSafeDownloadFilename(session.document.title, 'svg'),
      )
      setExportNotice(localizedMessage('messages.pngFallback'))
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
      </header>

      <section className="editor-workspace" aria-label={t('editor.workspace')}>
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
        <div className="editor-toolbar" aria-label={t('editor.editControls')}>
          <div className="toolbar-history">
            <button
              aria-label={t('editor.undoAria')}
              disabled={!session.canUndo || isBusy}
              title={t('editor.undoTitle')}
              type="button"
              onClick={() => onUndo()}
            >
              {t('editor.undo')}
            </button>
            <button
              aria-label={t('editor.redoAria')}
              disabled={!session.canRedo || isBusy}
              title={t('editor.redoTitle')}
              type="button"
              onClick={() => onRedo()}
            >
              {t('editor.redo')}
            </button>
          </div>
          <div className="toolbar-file-actions">
            <button
              aria-label={t('editor.tidyAria')}
              title={
                tidyPreview.changedParentIds.length === 0
                  ? t('editor.tidyClear')
                  : t('editor.tidyPreview', {
                      count: tidyPreview.changedParentIds.length,
                    })
              }
              type="button"
              onClick={tidyLayout}
            >
              {t('editor.tidy', {
                count: tidyPreview.changedParentIds.length,
              })}
            </button>
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
              type="button"
              disabled={isBusy}
              onClick={() => importInputRef.current?.click()}
            >
              {t('editor.importJson')}
            </button>
            <button type="button" onClick={exportJson}>
              {t('editor.exportJson')}
            </button>
            <button type="button" onClick={exportSvg}>
              {t('editor.exportSvg')}
            </button>
            <button type="button" onClick={() => void exportPng()}>
              {t('editor.exportPng')}
            </button>
          </div>
          <p>
            {t('editor.topicCount', {
              count: Object.keys(session.document.nodes).length,
              revision: session.revision,
            })}
          </p>
        </div>
        <div className="editor-content">
          <MindMapCanvas
            onExecute={onExecute}
            onRedo={onRedo}
            onUndo={onUndo}
            session={session}
          />
          <TopicInspector document={session.document} onExecute={onExecute} />
        </div>
      </section>
    </main>
  )
}
