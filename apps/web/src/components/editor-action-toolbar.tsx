import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import {
  editorActionIds,
  type EditorActionDispatcher,
  type EditorActionId,
  type ResolvedEditorAction,
} from '../editor/action-registry'
import { useEditorUiStore } from '../editor/store'

export interface EditorActionToolbarProps {
  readonly dispatcher: EditorActionDispatcher
  readonly revision: number
}

const primaryActions = [
  editorActionIds.undo,
  editorActionIds.redo,
  editorActionIds.createSibling,
  editorActionIds.createChild,
  editorActionIds.delete,
] as const

const topicActions = [
  editorActionIds.edit,
  editorActionIds.duplicate,
  editorActionIds.collapse,
  editorActionIds.insertParent,
  editorActionIds.deleteKeepChildren,
  editorActionIds.movePrevious,
  editorActionIds.moveNext,
  editorActionIds.promote,
  editorActionIds.demote,
  editorActionIds.convertToFloatingTopic,
  editorActionIds.focusBranch,
  editorActionIds.exitFocus,
] as const

const structureActions = [
  editorActionIds.logicRight,
  editorActionIds.logicLeft,
  editorActionIds.mindMapBalanced,
  editorActionIds.treeTop,
  editorActionIds.orgTop,
  editorActionIds.tidy,
] as const

const insertActions = [
  editorActionIds.insertFloatingTopic,
  editorActionIds.insertMarker,
  editorActionIds.insertLabel,
  editorActionIds.insertCallout,
  editorActionIds.insertRelationship,
  editorActionIds.insertBoundary,
  editorActionIds.insertSummary,
  editorActionIds.insertNotes,
  editorActionIds.insertLink,
  editorActionIds.insertImage,
  editorActionIds.insertEquation,
] as const

const styleActions = [
  editorActionIds.openStyle,
  editorActionIds.themeClassic,
  editorActionIds.themeOcean,
  editorActionIds.themeForest,
  editorActionIds.themeSunset,
  editorActionIds.copyStyle,
  editorActionIds.pasteStyle,
  editorActionIds.resetStyle,
] as const

const viewActions = [
  editorActionIds.zoomOut,
  editorActionIds.fit,
  editorActionIds.center,
  editorActionIds.zoomIn,
] as const

const fileActions = [
  editorActionIds.importJson,
  editorActionIds.exportJson,
  editorActionIds.exportSvg,
  editorActionIds.exportPng,
] as const

const actionIcons: Partial<Record<EditorActionId, string>> = {
  [editorActionIds.undo]: '↶',
  [editorActionIds.redo]: '↷',
  [editorActionIds.createSibling]: '＋',
  [editorActionIds.createChild]: '↳',
  [editorActionIds.delete]: '⌫',
  [editorActionIds.zoomOut]: '−',
  [editorActionIds.zoomIn]: '+',
  [editorActionIds.fit]: '⊡',
  [editorActionIds.center]: '◎',
}

const actionsThatMoveFocus = new Set<EditorActionId>([
  editorActionIds.edit,
  editorActionIds.insertParent,
  editorActionIds.insertFloatingTopic,
  editorActionIds.insertMarker,
  editorActionIds.insertLabel,
  editorActionIds.insertNotes,
  editorActionIds.insertLink,
  editorActionIds.insertImage,
  editorActionIds.insertEquation,
  editorActionIds.openStyle,
  editorActionIds.importJson,
])

function translateDynamic(t: TFunction, key: string): string {
  return t(key as never) as string
}

function ActionButton({
  action,
  compact = false,
  dispatcher,
  onDisabled,
}: {
  readonly action: ResolvedEditorAction
  readonly compact?: boolean
  readonly dispatcher: EditorActionDispatcher
  readonly onDisabled: (reasonKey: string) => void
}) {
  const { t } = useTranslation()
  const label = translateDynamic(t, action.labelKey)
  const reason = action.disabledReasonKey
    ? translateDynamic(t, action.disabledReasonKey)
    : undefined
  const title = reason
    ? `${label} — ${reason}`
    : action.shortcut
      ? `${label} (${action.shortcut})`
      : label
  return (
    <button
      aria-disabled={!action.enabled}
      aria-label={label}
      aria-pressed={action.active || undefined}
      className={action.active ? 'is-active' : undefined}
      data-action-id={action.id}
      title={title}
      type="button"
      onClick={() => {
        if (!action.enabled) {
          onDisabled(action.disabledReasonKey ?? 'actions.disabled.unavailable')
          return
        }
        void dispatcher.dispatch(action.id)
      }}
    >
      {actionIcons[action.id] ? (
        <span aria-hidden="true" className="toolbar-action-icon">
          {actionIcons[action.id]}
        </span>
      ) : null}
      {compact ? <span className="sr-only">{label}</span> : label}
      {action.pending ? <span aria-hidden="true">…</span> : null}
    </button>
  )
}

function ActionMenu({
  actionIds,
  dispatcher,
  label,
  onDisabled,
}: {
  readonly actionIds: readonly EditorActionId[]
  readonly dispatcher: EditorActionDispatcher
  readonly label: string
  readonly onDisabled: (reasonKey: string) => void
}) {
  const { t } = useTranslation()
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const actions = actionIds.map((id) => dispatcher.resolve(id))

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const closeOnWindowBlur = () => setOpen(false)

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('blur', closeOnWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('blur', closeOnWindowBlur)
    }
  }, [open])

  const closeAndRestoreFocus = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    )
    const index = items.indexOf(
      globalThis.document.activeElement as HTMLButtonElement,
    )
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % items.length
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
      closeAndRestoreFocus()
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={containerRef} className="toolbar-menu">
      <button
        ref={triggerRef}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (
            event.key === 'ArrowDown' ||
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            event.preventDefault()
            setOpen(true)
          }
          if (event.key === 'Escape' && open) closeAndRestoreFocus()
        }}
      >
        {label}
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          aria-label={label}
          className="toolbar-menu-popover"
          id={menuId}
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action) => {
            const actionLabel = translateDynamic(t, action.labelKey)
            const reason = action.disabledReasonKey
              ? translateDynamic(t, action.disabledReasonKey)
              : undefined
            return (
              <button
                key={action.id}
                aria-checked={action.active || undefined}
                aria-disabled={!action.enabled}
                className={action.active ? 'is-active' : undefined}
                data-action-id={action.id}
                role="menuitem"
                title={reason ?? actionLabel}
                type="button"
                onClick={() => {
                  if (!action.enabled) {
                    onDisabled(
                      action.disabledReasonKey ??
                        'actions.disabled.unavailable',
                    )
                    return
                  }
                  setOpen(false)
                  void dispatcher.dispatch(action.id)
                  if (!actionsThatMoveFocus.has(action.id)) {
                    requestAnimationFrame(() => triggerRef.current?.focus())
                  }
                }}
              >
                <span>{actionLabel}</span>
                {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                {reason ? <small>{reason}</small> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function EditorActionToolbar({
  dispatcher,
  revision,
}: EditorActionToolbarProps) {
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [availableWidth, setAvailableWidth] = useState(1200)
  const [filesInOverflow, setFilesInOverflow] = useState(false)
  const [disabledNoticeKey, setDisabledNoticeKey] = useState<string | null>(
    null,
  )
  const selection = useEditorUiStore((state) => state.selection)
  const viewport = useEditorUiStore((state) => state.viewport)
  const branchFocus = useEditorUiStore((state) => state.branchFocus)
  const styleClipboard = useEditorUiStore((state) => state.styleClipboard)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () =>
      setAvailableWidth(element.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(max-width: 960px)')
    const update = () => setFilesInOverflow(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  const compact = availableWidth < (i18n.language.startsWith('en') ? 1080 : 980)
  const narrow = availableWidth < (i18n.language.startsWith('en') ? 760 : 720)
  void selection
  void branchFocus
  void styleClipboard
  void i18n.language
  const onDisabled = (reasonKey: string) => setDisabledNoticeKey(reasonKey)
  const hiddenActions = [
    ...(compact ? topicActions : []),
    ...(narrow ? [...insertActions, ...structureActions, ...styleActions] : []),
    ...(compact ? viewActions : []),
    ...(narrow || filesInOverflow ? fileActions : []),
  ]

  return (
    <div
      ref={containerRef}
      aria-label={t('toolbar.label')}
      className="editor-action-toolbar"
      data-revision={revision}
      role="toolbar"
    >
      <div className="toolbar-primary-actions">
        {primaryActions.map((id) => (
          <ActionButton
            key={id}
            action={dispatcher.resolve(id)}
            compact={narrow}
            dispatcher={dispatcher}
            onDisabled={onDisabled}
          />
        ))}
      </div>
      <div className="toolbar-group-menus">
        {!compact ? (
          <ActionMenu
            actionIds={topicActions}
            dispatcher={dispatcher}
            label={t('toolbar.topic')}
            onDisabled={onDisabled}
          />
        ) : null}
        {!narrow ? (
          <>
            <ActionMenu
              actionIds={insertActions}
              dispatcher={dispatcher}
              label={t('toolbar.insert')}
              onDisabled={onDisabled}
            />
            <ActionMenu
              actionIds={structureActions}
              dispatcher={dispatcher}
              label={t('toolbar.structure')}
              onDisabled={onDisabled}
            />
            <ActionMenu
              actionIds={styleActions}
              dispatcher={dispatcher}
              label={t('toolbar.style')}
              onDisabled={onDisabled}
            />
          </>
        ) : null}
      </div>
      {!compact ? (
        <div className="toolbar-view-actions">
          {viewActions.map((id) => (
            <ActionButton
              key={id}
              action={dispatcher.resolve(id)}
              compact
              dispatcher={dispatcher}
              onDisabled={onDisabled}
            />
          ))}
        </div>
      ) : null}
      {hiddenActions.length > 0 ? (
        <ActionMenu
          actionIds={hiddenActions}
          dispatcher={dispatcher}
          label={t('toolbar.more')}
          onDisabled={onDisabled}
        />
      ) : null}
      <span className="toolbar-zoom-value" aria-live="polite">
        {Math.round(viewport.zoom * 100)}%
      </span>
      <span className="toolbar-disabled-notice" role="status">
        {disabledNoticeKey ? translateDynamic(t, disabledNoticeKey) : ''}
      </span>
    </div>
  )
}
