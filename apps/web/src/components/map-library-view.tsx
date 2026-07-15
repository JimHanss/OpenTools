import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { MindMapId } from '@opentools/mindmap-core'

import type { MindMapSummary } from '../library/map-library'
import { getCurrentLocale, toIntlLocale } from '../i18n'
import { LanguageSwitcher } from './language-switcher'

export interface MapLibraryViewProps {
  readonly error: string | null
  readonly isBusy: boolean
  readonly maps: readonly MindMapSummary[]
  readonly onCreate: (title: string) => Promise<void>
  readonly onDelete: (id: MindMapId) => Promise<void>
  readonly onDuplicate: (id: MindMapId) => Promise<void>
  readonly onOpen: (id: MindMapId) => Promise<void>
  readonly onRename: (id: MindMapId, title: string) => Promise<void>
}

function formatUpdatedAt(updatedAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(updatedAt))
}

export function MapLibraryView({
  error,
  isBusy,
  maps,
  onCreate,
  onDelete,
  onDuplicate,
  onOpen,
  onRename,
}: MapLibraryViewProps) {
  const { t } = useTranslation()
  const [newMapTitle, setNewMapTitle] = useState('')

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onCreate(newMapTitle)
    setNewMapTitle('')
  }

  async function handleRename(map: MindMapSummary) {
    const title = window.prompt(t('library.renamePrompt'), map.title)
    if (title !== null) await onRename(map.id, title)
  }

  async function handleDelete(map: MindMapSummary) {
    if (!window.confirm(t('library.deleteConfirm', { title: map.title })))
      return
    await onDelete(map.id)
  }

  return (
    <main className="library-page">
      <header className="library-header">
        <div className="brand" aria-label="OpenTools">
          <span className="brand-mark">O</span>
          <span>OpenTools</span>
        </div>
        <p>{t('library.tagline')}</p>
        <LanguageSwitcher />
      </header>

      <section className="library-content" aria-labelledby="library-title">
        <div className="library-intro">
          <div>
            <p className="eyebrow">{t('library.eyebrow')}</p>
            <h1 id="library-title">{t('library.title')}</h1>
          </div>
          <form className="new-map-form" onSubmit={handleCreate}>
            <label className="sr-only" htmlFor="new-map-title">
              {t('library.newTitleLabel')}
            </label>
            <input
              id="new-map-title"
              value={newMapTitle}
              onChange={(event) => setNewMapTitle(event.target.value)}
              placeholder={t('library.newTitlePlaceholder')}
            />
            <button type="submit" disabled={isBusy}>
              {t('library.newMap')}
            </button>
          </form>
        </div>

        {error ? (
          <p className="operation-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="map-grid" aria-busy={isBusy}>
          {maps.map((map) => (
            <article className="map-card" key={map.id}>
              <button
                className="map-card-open"
                type="button"
                onClick={() => void onOpen(map.id)}
                disabled={isBusy}
              >
                <span className="map-card-icon" aria-hidden="true">
                  ◌
                </span>
                <strong>{map.title}</strong>
                <span>
                  {t('library.updatedAt', {
                    date: formatUpdatedAt(
                      map.updatedAt,
                      toIntlLocale(getCurrentLocale()),
                    ),
                  })}
                </span>
              </button>
              <div
                className="map-card-actions"
                aria-label={t('library.actionsLabel', { title: map.title })}
              >
                <button
                  type="button"
                  onClick={() => void handleRename(map)}
                  disabled={isBusy}
                >
                  {t('library.rename')}
                </button>
                <button
                  type="button"
                  onClick={() => void onDuplicate(map.id)}
                  disabled={isBusy}
                >
                  {t('library.duplicate')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(map)}
                  disabled={isBusy}
                >
                  {t('library.delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
