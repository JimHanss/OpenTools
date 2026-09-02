import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getComputedMindMapNodeStyle,
  getMindMapStyleScopeNodeIds,
  getMindMapThemePreset,
  getSharedComputedMindMapStyleValue,
  mindMapCommandTypes,
  mindMapThemePresets,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapNodeId,
  type MindMapNodeStyle,
  type MindMapNodeStyleOverride,
  type MindMapStyleScope,
} from '@opentools/mindmap-core'

import {
  createBatchStyleCommand,
  createResetStyleCommand,
} from '../editor/actions'
import { useEditorUiStore } from '../editor/store'

const themeLabelKeys = {
  classic: 'style.themes.classic',
  ocean: 'style.themes.ocean',
  forest: 'style.themes.forest',
  sunset: 'style.themes.sunset',
} as const

export interface TopicStyleInspectorProps {
  readonly document: MindMapDocument
  readonly selectedNodeIds: readonly MindMapNodeId[]
  readonly onExecute: (command: MindMapCommand) => unknown
}

function finiteInRange(
  value: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined
}

export function TopicStyleInspector({
  document,
  selectedNodeIds,
  onExecute,
}: TopicStyleInspectorProps) {
  const { t } = useTranslation()
  const [scope, setScope] = useState<MindMapStyleScope>('current')
  const styleClipboard = useEditorUiStore((state) => state.styleClipboard)
  const setStyleClipboard = useEditorUiStore((state) => state.setStyleClipboard)
  const scopeNodeIds = useMemo(
    () => getMindMapStyleScopeNodeIds(document, selectedNodeIds, scope),
    [document, scope, selectedNodeIds],
  )
  const shared = <Key extends keyof MindMapNodeStyle>(key: Key) => {
    const result = getSharedComputedMindMapStyleValue(
      document,
      selectedNodeIds,
      key,
    )
    return result.state === 'value' ? result.value : undefined
  }
  const apply = (style: MindMapNodeStyleOverride) =>
    onExecute(createBatchStyleCommand(document, selectedNodeIds, style))
  const applyToScope = (style: MindMapNodeStyleOverride) => {
    if (scopeNodeIds.length === 0) return
    onExecute(createBatchStyleCommand(document, scopeNodeIds, style))
  }
  const mixed = (key: keyof MindMapNodeStyle) => shared(key) === undefined
  const shape = shared('shape')
  const fontFamily = shared('fontFamily')
  const fontWeight = shared('fontWeight')
  const fontStyle = shared('fontStyle')
  const textDecoration = shared('textDecoration')
  const textAlign = shared('textAlign')
  const borderStyle = shared('borderStyle')
  const branchStyle = shared('branchStyle')
  const branchShape = shared('branchShape')

  return (
    <section aria-label={t('style.section')} className="topic-style-controls">
      <h2>{t('style.section')}</h2>
      <label>
        {t('style.theme')}
        <select
          aria-label={t('style.theme')}
          value={document.theme.id}
          onChange={(event) => {
            const theme = getMindMapThemePreset(event.target.value)
            if (!theme) return
            onExecute({
              type: mindMapCommandTypes.updateTheme,
              label: 'Update mind map theme',
              payload: { theme },
            })
          }}
        >
          {mindMapThemePresets.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {t(
                themeLabelKeys[theme.id as keyof typeof themeLabelKeys] ??
                  themeLabelKeys.classic,
              )}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t('style.shape')}
        <select
          aria-label={t('style.shape')}
          data-mixed={mixed('shape') || undefined}
          value={shape ?? ''}
          onChange={(event) =>
            apply({ shape: event.target.value as MindMapNodeStyle['shape'] })
          }
        >
          {shape === undefined ? (
            <option value="">{t('style.mixed')}</option>
          ) : null}
          <option value="rounded-rectangle">{t('style.rounded')}</option>
          <option value="rectangle">{t('style.rectangle')}</option>
          <option value="pill">{t('style.pill')}</option>
          <option value="underline">{t('style.underline')}</option>
          <option value="borderless">{t('style.borderless')}</option>
        </select>
      </label>

      <div className="style-color-grid">
        {(
          [
            ['backgroundColor', 'style.fill', '#ffffff'],
            ['borderColor', 'style.borderColor', '#7c6ff2'],
            ['textColor', 'style.textColor', '#1e1b4b'],
            ['branchColor', 'style.branchColor', '#8b83dc'],
          ] as const
        ).map(([key, labelKey, fallback]) => (
          <label key={key}>
            {t(labelKey)}
            <input
              aria-label={t(labelKey)}
              data-mixed={mixed(key) || undefined}
              type="color"
              value={(shared(key) as string | undefined) ?? fallback}
              onChange={(event) => apply({ [key]: event.target.value })}
            />
          </label>
        ))}
      </div>

      <div className="style-grid">
        <label>
          {t('style.fontFamily')}
          <select
            aria-label={t('style.fontFamily')}
            value={fontFamily ?? ''}
            onChange={(event) => apply({ fontFamily: event.target.value })}
          >
            {fontFamily === undefined ? (
              <option value="">{t('style.mixed')}</option>
            ) : null}
            <option value="Inter, system-ui, sans-serif">Inter</option>
            <option value="Georgia, Cambria, serif">Georgia</option>
            <option value="ui-monospace, SFMono-Regular, Consolas, monospace">
              Monospace
            </option>
          </select>
        </label>
        <label>
          {t('style.fontSize')}
          <input
            key={`font-size-${String(shared('fontSize'))}`}
            aria-label={t('style.fontSize')}
            defaultValue={shared('fontSize') ?? ''}
            min={8}
            max={96}
            placeholder={t('style.mixed')}
            type="number"
            onBlur={(event) => {
              const value = finiteInRange(event.target.value, 8, 96)
              if (value !== undefined) apply({ fontSize: value })
            }}
          />
        </label>
        <label>
          {t('style.fontWeight')}
          <select
            value={fontWeight ?? ''}
            onChange={(event) =>
              apply({
                fontWeight: event.target
                  .value as MindMapNodeStyle['fontWeight'],
              })
            }
          >
            {fontWeight === undefined ? (
              <option value="">{t('style.mixed')}</option>
            ) : null}
            <option value="normal">{t('style.normal')}</option>
            <option value="medium">{t('style.medium')}</option>
            <option value="semibold">{t('style.semibold')}</option>
            <option value="bold">{t('style.bold')}</option>
          </select>
        </label>
        <label>
          {t('style.align')}
          <select
            value={textAlign ?? ''}
            onChange={(event) =>
              apply({
                textAlign: event.target.value as MindMapNodeStyle['textAlign'],
              })
            }
          >
            {textAlign === undefined ? (
              <option value="">{t('style.mixed')}</option>
            ) : null}
            <option value="left">{t('style.left')}</option>
            <option value="center">{t('style.center')}</option>
            <option value="right">{t('style.right')}</option>
          </select>
        </label>
      </div>

      <div className="style-toggle-grid">
        <label>
          <input
            checked={fontStyle === 'italic'}
            data-mixed={fontStyle === undefined ? true : undefined}
            type="checkbox"
            onChange={(event) =>
              apply({ fontStyle: event.target.checked ? 'italic' : 'normal' })
            }
          />
          {t('style.italic')}
        </label>
        <label>
          <input
            checked={textDecoration === 'line-through'}
            data-mixed={textDecoration === undefined ? true : undefined}
            type="checkbox"
            onChange={(event) =>
              apply({
                textDecoration: event.target.checked ? 'line-through' : 'none',
              })
            }
          />
          {t('style.strike')}
        </label>
      </div>

      <fieldset>
        <legend>{t('style.border')}</legend>
        <div className="style-grid">
          <label>
            {t('style.width')}
            <input
              key={`border-width-${String(shared('borderWidth'))}`}
              defaultValue={shared('borderWidth') ?? ''}
              min={0}
              max={20}
              placeholder={t('style.mixed')}
              type="number"
              onBlur={(event) => {
                const value = finiteInRange(event.target.value, 0, 20)
                if (value !== undefined) apply({ borderWidth: value })
              }}
            />
          </label>
          <label>
            {t('style.pattern')}
            <select
              value={borderStyle ?? ''}
              onChange={(event) =>
                apply({
                  borderStyle: event.target
                    .value as MindMapNodeStyle['borderStyle'],
                })
              }
            >
              {borderStyle === undefined ? (
                <option value="">{t('style.mixed')}</option>
              ) : null}
              <option value="solid">{t('style.solid')}</option>
              <option value="dashed">{t('style.dashed')}</option>
              <option value="dotted">{t('style.dotted')}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('style.branch')}</legend>
        <div className="style-grid">
          <label>
            {t('style.width')}
            <input
              key={`branch-width-${String(shared('branchWidth'))}`}
              defaultValue={shared('branchWidth') ?? ''}
              min={0}
              max={20}
              placeholder={t('style.mixed')}
              type="number"
              onBlur={(event) => {
                const value = finiteInRange(event.target.value, 0, 20)
                if (value !== undefined) apply({ branchWidth: value })
              }}
            />
          </label>
          <label>
            {t('style.pattern')}
            <select
              value={branchStyle ?? ''}
              onChange={(event) =>
                apply({
                  branchStyle: event.target
                    .value as MindMapNodeStyle['branchStyle'],
                })
              }
            >
              {branchStyle === undefined ? (
                <option value="">{t('style.mixed')}</option>
              ) : null}
              <option value="solid">{t('style.solid')}</option>
              <option value="dashed">{t('style.dashed')}</option>
              <option value="dotted">{t('style.dotted')}</option>
            </select>
          </label>
          <label>
            {t('style.connector')}
            <select
              value={branchShape ?? ''}
              onChange={(event) =>
                apply({
                  branchShape: event.target
                    .value as MindMapNodeStyle['branchShape'],
                })
              }
            >
              {branchShape === undefined ? (
                <option value="">{t('style.mixed')}</option>
              ) : null}
              <option value="curve">{t('style.curve')}</option>
              <option value="straight">{t('style.straight')}</option>
              <option value="elbow">{t('style.elbow')}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="fixed-width-control">
        <label>
          {t('style.fixedWidth')}
          <input
            key={`fixed-width-${String(shared('fixedWidth'))}`}
            defaultValue={shared('fixedWidth') ?? ''}
            min={80}
            max={350}
            placeholder={t('style.autoWidth')}
            type="number"
            onBlur={(event) => {
              if (event.target.value.trim() === '') {
                onExecute({
                  type: mindMapCommandTypes.batch,
                  label: 'Reset selected topic width',
                  payload: {
                    commands: selectedNodeIds.map((nodeId) => ({
                      type: mindMapCommandTypes.updateNodeStyle,
                      label: 'Reset topic width',
                      payload: {
                        nodeId,
                        style: {},
                        resetKeys: ['fixedWidth'],
                      },
                    })),
                  },
                })
                return
              }
              const value = finiteInRange(event.target.value, 80, 350)
              if (value !== undefined) apply({ fixedWidth: value })
            }}
          />
        </label>
      </div>

      <div className="style-clipboard-controls">
        <label>
          {t('style.scope')}
          <select
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as MindMapStyleScope)
            }
          >
            <option value="current">{t('style.scopeCurrent')}</option>
            <option value="siblings">{t('style.scopeSiblings')}</option>
            <option value="descendants">{t('style.scopeDescendants')}</option>
            <option value="level">{t('style.scopeLevel')}</option>
          </select>
        </label>
        <p aria-live="polite">
          {t('style.scopeCount', { count: scopeNodeIds.length })}
        </p>
        <div>
          <button
            disabled={selectedNodeIds.length === 0}
            type="button"
            onClick={() => {
              const nodeId = selectedNodeIds[0]
              if (!nodeId) return
              setStyleClipboard(getComputedMindMapNodeStyle(document, nodeId))
            }}
          >
            {t('style.copy')}
          </button>
          <button
            disabled={!styleClipboard || scopeNodeIds.length === 0}
            type="button"
            onClick={() => styleClipboard && applyToScope(styleClipboard)}
          >
            {t('style.paste')}
          </button>
          <button
            disabled={scopeNodeIds.length === 0}
            type="button"
            onClick={() =>
              onExecute(createResetStyleCommand(document, scopeNodeIds))
            }
          >
            {t('style.reset')}
          </button>
        </div>
      </div>
    </section>
  )
}
