import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { queryMindMap, type MindMapDocument } from '@opentools/mindmap-core'

import { useEditorUiStore, type EditorFilterState } from '../editor/store'

export interface FilterPanelProps {
  readonly document: MindMapDocument
}

function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

export function FilterPanel({ document }: FilterPanelProps) {
  const { t } = useTranslation()
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const summaryRef = useRef<HTMLElement | null>(null)
  const filter = useEditorUiStore((state) => state.filter)
  const setFilter = useEditorUiStore((state) => state.setFilter)
  const result = useMemo(
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
  const update = (patch: Partial<EditorFilterState>) =>
    setFilter({ ...filter, ...patch })
  const clear = () =>
    setFilter({
      text: '',
      labelIds: [],
      priorities: [],
      statuses: [],
      hasNotes: undefined,
      operator: 'and',
    })

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current
      const target = event.target
      if (
        !details?.open ||
        (target instanceof Node && details.contains(target))
      ) {
        return
      }
      details.open = false
    }
    const closeOnWindowBlur = () => {
      if (detailsRef.current) detailsRef.current.open = false
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current
      if (event.key !== 'Escape' || !details?.open) return
      event.preventDefault()
      details.open = false
      summaryRef.current?.focus()
    }

    globalThis.document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('blur', closeOnWindowBlur)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      globalThis.document.removeEventListener(
        'pointerdown',
        closeOnOutsidePointer,
      )
      window.removeEventListener('blur', closeOnWindowBlur)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <details ref={detailsRef} className="filter-panel">
      <summary ref={summaryRef}>
        {t('filter.title')} ·{' '}
        {t('filter.matches', { count: result.matchedNodeIds.length })}
      </summary>
      <div className="filter-panel-content">
        <label>
          {t('filter.text')}
          <input
            value={filter.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </label>
        <label>
          {t('filter.operator')}
          <select
            value={filter.operator}
            onChange={(event) =>
              update({ operator: event.target.value as 'and' | 'or' })
            }
          >
            <option value="and">{t('filter.and')}</option>
            <option value="or">{t('filter.or')}</option>
          </select>
        </label>
        {Object.keys(document.labels).length > 0 ? (
          <fieldset>
            <legend>{t('filter.labels')}</legend>
            {Object.values(document.labels).map((label) => (
              <label key={label.id}>
                <input
                  checked={filter.labelIds.includes(label.id)}
                  type="checkbox"
                  onChange={() =>
                    update({
                      labelIds: toggleValue(filter.labelIds, label.id),
                    })
                  }
                />
                <span style={{ color: label.color }}>{label.name}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <fieldset>
          <legend>{t('filter.priority')}</legend>
          {['1', '2', '3'].map((value) => (
            <label key={value}>
              <input
                checked={filter.priorities.includes(value)}
                type="checkbox"
                onChange={() =>
                  update({
                    priorities: toggleValue(filter.priorities, value),
                  })
                }
              />
              P{value}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t('filter.status')}</legend>
          {(['todo', 'doing', 'done'] as const).map((value) => (
            <label key={value}>
              <input
                checked={filter.statuses.includes(value)}
                type="checkbox"
                onChange={() =>
                  update({ statuses: toggleValue(filter.statuses, value) })
                }
              />
              {t(
                `inspector.status${value === 'todo' ? 'Todo' : value === 'doing' ? 'Doing' : 'Done'}`,
              )}
            </label>
          ))}
        </fieldset>
        <label>
          {t('filter.notes')}
          <select
            value={
              filter.hasNotes === undefined
                ? 'any'
                : filter.hasNotes
                  ? 'yes'
                  : 'no'
            }
            onChange={(event) =>
              update({
                hasNotes:
                  event.target.value === 'any'
                    ? undefined
                    : event.target.value === 'yes',
              })
            }
          >
            <option value="any">{t('filter.anyNotes')}</option>
            <option value="yes">{t('filter.withNotes')}</option>
            <option value="no">{t('filter.withoutNotes')}</option>
          </select>
        </label>
        <button type="button" onClick={clear}>
          {t('filter.clear')}
        </button>
      </div>
    </details>
  )
}
