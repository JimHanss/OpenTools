import { useTranslation } from 'react-i18next'

import {
  mindMapCommandTypes,
  type MindMapCommand,
  type MindMapDocument,
} from '@opentools/mindmap-core'

import type { EditorSelectionTarget } from '../editor/selection'

export interface EnhancementInspectorProps {
  readonly document: MindMapDocument
  readonly selection: Exclude<EditorSelectionTarget, { kind: 'none' | 'topic' }>
  readonly onExecute: (command: MindMapCommand) => unknown
}

function numberFromInput(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function EnhancementInspector({
  document,
  selection,
  onExecute,
}: EnhancementInspectorProps) {
  const { t } = useTranslation()

  if (selection.kind === 'relationship') {
    const relationship = document.relationships.find(
      (candidate) => candidate.id === selection.id,
    )
    if (!relationship) return null
    const update = (changes: {
      label?: string
      style?: Partial<typeof relationship.style>
      controlPoints?: readonly { x: number; y: number }[]
    }) =>
      onExecute({
        type: mindMapCommandTypes.updateRelationship,
        label: 'Update relationship',
        payload: { relationshipId: relationship.id, changes },
      })
    return (
      <aside
        className="topic-inspector enhancement-inspector"
        aria-label={t('enhancementInspector.relationship')}
      >
        <header>
          <p className="eyebrow">{t('enhancementInspector.relationship')}</p>
          <strong>{relationship.label}</strong>
        </header>
        <label>
          {t('enhancementInspector.text')}
          <input
            key={relationship.label}
            defaultValue={relationship.label}
            onBlur={(event) => update({ label: event.target.value })}
          />
        </label>
        <label>
          {t('enhancementInspector.shape')}
          <select
            value={relationship.style.shape}
            onChange={(event) =>
              update({
                style: {
                  shape: event.target.value as typeof relationship.style.shape,
                },
              })
            }
          >
            <option value="curve">{t('enhancementInspector.curve')}</option>
            <option value="elbow">{t('enhancementInspector.elbow')}</option>
            <option value="straight">
              {t('enhancementInspector.straight')}
            </option>
          </select>
        </label>
        <label>
          {t('enhancementInspector.pattern')}
          <select
            value={relationship.style.pattern}
            onChange={(event) =>
              update({
                style: {
                  pattern: event.target
                    .value as typeof relationship.style.pattern,
                },
              })
            }
          >
            <option value="solid">{t('enhancementInspector.solid')}</option>
            <option value="dashed">{t('enhancementInspector.dashed')}</option>
            <option value="dotted">{t('enhancementInspector.dotted')}</option>
          </select>
        </label>
        <div className="enhancement-grid">
          <label>
            {t('enhancementInspector.lineColor')}
            <input
              type="color"
              value={relationship.style.color}
              onChange={(event) =>
                update({ style: { color: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.lineWidth')}
            <input
              key={relationship.style.width}
              min={0}
              type="number"
              defaultValue={relationship.style.width}
              onBlur={(event) =>
                update({
                  style: {
                    width: numberFromInput(
                      event.target.value,
                      relationship.style.width,
                    ),
                  },
                })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.labelColor')}
            <input
              type="color"
              value={relationship.style.labelColor}
              onChange={(event) =>
                update({ style: { labelColor: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.labelSize')}
            <input
              key={relationship.style.labelFontSize}
              min={1}
              type="number"
              defaultValue={relationship.style.labelFontSize}
              onBlur={(event) =>
                update({
                  style: {
                    labelFontSize: numberFromInput(
                      event.target.value,
                      relationship.style.labelFontSize,
                    ),
                  },
                })
              }
            />
          </label>
        </div>
        <div className="enhancement-grid">
          <label>
            {t('enhancementInspector.startMarker')}
            <select
              value={relationship.style.startMarker}
              onChange={(event) =>
                update({
                  style: {
                    startMarker: event.target
                      .value as typeof relationship.style.startMarker,
                  },
                })
              }
            >
              <option value="none">{t('enhancementInspector.none')}</option>
              <option value="arrow">{t('enhancementInspector.arrow')}</option>
              <option value="dot">{t('enhancementInspector.dot')}</option>
            </select>
          </label>
          <label>
            {t('enhancementInspector.endMarker')}
            <select
              value={relationship.style.endMarker}
              onChange={(event) =>
                update({
                  style: {
                    endMarker: event.target
                      .value as typeof relationship.style.endMarker,
                  },
                })
              }
            >
              <option value="none">{t('enhancementInspector.none')}</option>
              <option value="arrow">{t('enhancementInspector.arrow')}</option>
              <option value="dot">{t('enhancementInspector.dot')}</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            update({
              controlPoints:
                relationship.controlPoints.length > 0 ? [] : [{ x: 0, y: -48 }],
            })
          }
        >
          {relationship.controlPoints.length > 0
            ? t('enhancementInspector.resetControlPoints')
            : t('enhancementInspector.addControlPoint')}
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() =>
            onExecute({
              type: mindMapCommandTypes.deleteRelationship,
              label: 'Delete relationship',
              payload: { relationshipId: relationship.id },
            })
          }
        >
          {t('enhancementInspector.delete')}
        </button>
      </aside>
    )
  }

  if (selection.kind === 'boundary') {
    const boundary = document.boundaries.find(
      (candidate) => candidate.id === selection.id,
    )
    if (!boundary) return null
    const update = (changes: {
      label?: string
      style?: Partial<typeof boundary.style>
    }) =>
      onExecute({
        type: mindMapCommandTypes.updateBoundary,
        label: 'Update boundary',
        payload: { boundaryId: boundary.id, changes },
      })
    return (
      <aside
        className="topic-inspector enhancement-inspector"
        aria-label={t('enhancementInspector.boundary')}
      >
        <header>
          <p className="eyebrow">{t('enhancementInspector.boundary')}</p>
          <strong>{boundary.label}</strong>
        </header>
        <label>
          {t('enhancementInspector.text')}
          <input
            key={boundary.label}
            defaultValue={boundary.label}
            onBlur={(event) => update({ label: event.target.value })}
          />
        </label>
        <label>
          {t('enhancementInspector.shape')}
          <select
            value={boundary.style.shape}
            onChange={(event) =>
              update({
                style: {
                  shape: event.target.value as typeof boundary.style.shape,
                },
              })
            }
          >
            <option value="rounded-rectangle">
              {t('enhancementInspector.roundedRectangle')}
            </option>
            <option value="rectangle">
              {t('enhancementInspector.rectangle')}
            </option>
            <option value="cloud">{t('enhancementInspector.cloud')}</option>
          </select>
        </label>
        <div className="enhancement-grid">
          <label>
            {t('enhancementInspector.fillColor')}
            <input
              type="color"
              value={boundary.style.fillColor}
              onChange={(event) =>
                update({ style: { fillColor: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.opacity')}
            <input
              max={1}
              min={0}
              step={0.05}
              type="number"
              value={boundary.style.fillOpacity}
              onChange={(event) =>
                update({
                  style: {
                    fillOpacity: numberFromInput(
                      event.target.value,
                      boundary.style.fillOpacity,
                    ),
                  },
                })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.borderColor')}
            <input
              type="color"
              value={boundary.style.borderColor}
              onChange={(event) =>
                update({ style: { borderColor: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.textColor')}
            <input
              type="color"
              value={boundary.style.textColor}
              onChange={(event) =>
                update({ style: { textColor: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.lineWidth')}
            <input
              key={boundary.style.borderWidth}
              min={0}
              type="number"
              defaultValue={boundary.style.borderWidth}
              onBlur={(event) =>
                update({
                  style: {
                    borderWidth: numberFromInput(
                      event.target.value,
                      boundary.style.borderWidth,
                    ),
                  },
                })
              }
            />
          </label>
        </div>
        <label>
          {t('enhancementInspector.pattern')}
          <select
            value={boundary.style.borderStyle}
            onChange={(event) =>
              update({
                style: {
                  borderStyle: event.target
                    .value as typeof boundary.style.borderStyle,
                },
              })
            }
          >
            <option value="solid">{t('enhancementInspector.solid')}</option>
            <option value="dashed">{t('enhancementInspector.dashed')}</option>
            <option value="dotted">{t('enhancementInspector.dotted')}</option>
          </select>
        </label>
        <button
          className="danger-button"
          type="button"
          onClick={() =>
            onExecute({
              type: mindMapCommandTypes.deleteBoundary,
              label: 'Delete boundary',
              payload: { boundaryId: boundary.id },
            })
          }
        >
          {t('enhancementInspector.delete')}
        </button>
      </aside>
    )
  }

  if (selection.kind === 'summary') {
    const summary = document.summaries.find(
      (candidate) => candidate.id === selection.id,
    )
    if (!summary) return null
    const update = (changes: {
      label?: string
      style?: Partial<typeof summary.style>
    }) =>
      onExecute({
        type: mindMapCommandTypes.updateSummary,
        label: 'Update summary',
        payload: { summaryId: summary.id, changes },
      })
    return (
      <aside
        className="topic-inspector enhancement-inspector"
        aria-label={t('enhancementInspector.summary')}
      >
        <header>
          <p className="eyebrow">{t('enhancementInspector.summary')}</p>
          <strong>{summary.label}</strong>
        </header>
        <label>
          {t('enhancementInspector.text')}
          <input
            key={summary.label}
            defaultValue={summary.label}
            onBlur={(event) => update({ label: event.target.value })}
          />
        </label>
        <label>
          {t('enhancementInspector.shape')}
          <select
            value={summary.style.shape}
            onChange={(event) =>
              update({
                style: {
                  shape: event.target.value as typeof summary.style.shape,
                },
              })
            }
          >
            <option value="bracket">{t('enhancementInspector.bracket')}</option>
            <option value="line">{t('enhancementInspector.line')}</option>
          </select>
        </label>
        <div className="enhancement-grid">
          <label>
            {t('enhancementInspector.lineColor')}
            <input
              type="color"
              value={summary.style.color}
              onChange={(event) =>
                update({ style: { color: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.textColor')}
            <input
              type="color"
              value={summary.style.textColor}
              onChange={(event) =>
                update({ style: { textColor: event.target.value } })
              }
            />
          </label>
          <label>
            {t('enhancementInspector.lineWidth')}
            <input
              key={summary.style.width}
              min={0}
              type="number"
              defaultValue={summary.style.width}
              onBlur={(event) =>
                update({
                  style: {
                    width: numberFromInput(
                      event.target.value,
                      summary.style.width,
                    ),
                  },
                })
              }
            />
          </label>
        </div>
        <label>
          {t('enhancementInspector.pattern')}
          <select
            value={summary.style.pattern}
            onChange={(event) =>
              update({
                style: {
                  pattern: event.target.value as typeof summary.style.pattern,
                },
              })
            }
          >
            <option value="solid">{t('enhancementInspector.solid')}</option>
            <option value="dashed">{t('enhancementInspector.dashed')}</option>
            <option value="dotted">{t('enhancementInspector.dotted')}</option>
          </select>
        </label>
        <button
          className="danger-button"
          type="button"
          onClick={() =>
            onExecute({
              type: mindMapCommandTypes.deleteSummary,
              label: 'Delete summary',
              payload: { summaryId: summary.id },
            })
          }
        >
          {t('enhancementInspector.delete')}
        </button>
      </aside>
    )
  }

  const callout = document.callouts.find(
    (candidate) => candidate.id === selection.id,
  )
  if (!callout) return null
  const updateCallout = (changes: {
    text?: string
    placement?: typeof callout.placement
    offset?: typeof callout.offset
    style?: Partial<typeof callout.style>
  }) =>
    onExecute({
      type: mindMapCommandTypes.updateCallout,
      label: 'Update callout',
      payload: { calloutId: callout.id, changes },
    })
  return (
    <aside
      className="topic-inspector enhancement-inspector"
      aria-label={t('enhancementInspector.callout')}
    >
      <header>
        <p className="eyebrow">{t('enhancementInspector.callout')}</p>
        <strong>{document.nodes[callout.ownerNodeId]?.text}</strong>
      </header>
      <label>
        {t('enhancementInspector.text')}
        <textarea
          key={callout.text}
          defaultValue={callout.text}
          onBlur={(event) => updateCallout({ text: event.target.value })}
        />
      </label>
      <label>
        {t('enhancementInspector.placement')}
        <select
          value={callout.placement}
          onChange={(event) =>
            updateCallout({
              placement: event.target.value as typeof callout.placement,
            })
          }
        >
          <option value="top">{t('enhancementInspector.top')}</option>
          <option value="right">{t('enhancementInspector.right')}</option>
          <option value="bottom">{t('enhancementInspector.bottom')}</option>
          <option value="left">{t('enhancementInspector.left')}</option>
        </select>
      </label>
      <label>
        {t('enhancementInspector.shape')}
        <select
          value={callout.style.shape}
          onChange={(event) =>
            updateCallout({
              style: {
                shape: event.target.value as typeof callout.style.shape,
              },
            })
          }
        >
          <option value="rounded-rectangle">
            {t('enhancementInspector.roundedRectangle')}
          </option>
          <option value="rectangle">
            {t('enhancementInspector.rectangle')}
          </option>
          <option value="pill">{t('enhancementInspector.pill')}</option>
        </select>
      </label>
      <div className="enhancement-grid">
        <label>
          {t('enhancementInspector.fillColor')}
          <input
            type="color"
            value={callout.style.backgroundColor}
            onChange={(event) =>
              updateCallout({
                style: { backgroundColor: event.target.value },
              })
            }
          />
        </label>
        <label>
          {t('enhancementInspector.borderColor')}
          <input
            type="color"
            value={callout.style.borderColor}
            onChange={(event) =>
              updateCallout({ style: { borderColor: event.target.value } })
            }
          />
        </label>
        <label>
          {t('enhancementInspector.textColor')}
          <input
            type="color"
            value={callout.style.textColor}
            onChange={(event) =>
              updateCallout({ style: { textColor: event.target.value } })
            }
          />
        </label>
        <label>
          {t('enhancementInspector.labelSize')}
          <input
            key={callout.style.fontSize}
            min={1}
            type="number"
            defaultValue={callout.style.fontSize}
            onBlur={(event) =>
              updateCallout({
                style: {
                  fontSize: numberFromInput(
                    event.target.value,
                    callout.style.fontSize,
                  ),
                },
              })
            }
          />
        </label>
        <label>
          {t('enhancementInspector.lineWidth')}
          <input
            key={callout.style.borderWidth}
            min={0}
            type="number"
            defaultValue={callout.style.borderWidth}
            onBlur={(event) =>
              updateCallout({
                style: {
                  borderWidth: numberFromInput(
                    event.target.value,
                    callout.style.borderWidth,
                  ),
                },
              })
            }
          />
        </label>
      </div>
      <button
        className="danger-button"
        type="button"
        onClick={() =>
          onExecute({
            type: mindMapCommandTypes.deleteCallout,
            label: 'Delete callout',
            payload: { calloutId: callout.id },
          })
        }
      >
        {t('enhancementInspector.delete')}
      </button>
    </aside>
  )
}
