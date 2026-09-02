import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  EquationRenderer,
  RenderedEquation,
} from '@opentools/mindmap-renderer-svg'

export interface EquationEditorValue {
  readonly source: string
  readonly width: number
  readonly height: number
}

export interface EquationEditorDialogProps {
  readonly initialSource: string
  readonly isEditing: boolean
  readonly renderer: EquationRenderer
  readonly onCancel: () => void
  readonly onSave: (value: EquationEditorValue) => void
}

export function EquationEditorDialog({
  initialSource,
  isEditing,
  renderer,
  onCancel,
  onSave,
}: EquationEditorDialogProps) {
  const { t } = useTranslation()
  const [source, setSource] = useState(initialSource)
  const [isComposing, setIsComposing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastValid, setLastValid] = useState<RenderedEquation | null>(null)
  const [validatedSource, setValidatedSource] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (isComposing) return
    if (source.trim().length === 0) {
      setIsLoading(false)
      setValidatedSource(null)
      setError(t('equation.emptyError'))
      return
    }
    let active = true
    setIsLoading(true)
    setValidatedSource(null)
    const timer = window.setTimeout(() => {
      void renderer
        .render({ source, displayMode: 'block', fontSize: 16 })
        .then((result) => {
          if (!active) return
          setIsLoading(false)
          if (result.state === 'ready') {
            setLastValid(result)
            setValidatedSource(source)
            setError(null)
          } else {
            setError(t('equation.invalidError'))
          }
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isComposing, renderer, source, t])

  const canSave = !isLoading && lastValid !== null && validatedSource === source

  return (
    <div
      aria-label={isEditing ? t('equation.editTitle') : t('equation.addTitle')}
      aria-modal="true"
      className="equation-dialog-backdrop"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isComposing) {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <div className="equation-dialog-card">
        <h2>{isEditing ? t('equation.editTitle') : t('equation.addTitle')}</h2>
        <label>
          {t('equation.source')}
          <textarea
            ref={textareaRef}
            aria-label={t('equation.source')}
            maxLength={10_000}
            rows={6}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onCompositionEnd={() => setIsComposing(false)}
            onCompositionStart={() => setIsComposing(true)}
          />
        </label>
        <p className="inspector-help">{t('equation.help')}</p>
        <div
          aria-busy={isLoading}
          aria-label={t('equation.preview')}
          className="equation-dialog-preview"
        >
          {lastValid ? (
            <div dangerouslySetInnerHTML={{ __html: lastValid.svg }} />
          ) : (
            <span>
              {isLoading ? t('equation.loading') : t('equation.previewEmpty')}
            </span>
          )}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="equation-dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('equation.cancel')}
          </button>
          <button
            disabled={!canSave}
            type="button"
            onClick={() => {
              if (!lastValid || validatedSource !== source) return
              onSave({
                source,
                width: lastValid.width,
                height: lastValid.height,
              })
            }}
          >
            {t('equation.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
