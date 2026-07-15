import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  mindMapCommandTypes,
  normalizeTopLevelNodeSelection,
  type CommandResult,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapMarkerKind,
  type MindMapNode,
  type MindMapNodeStyle,
} from '@opentools/mindmap-core'

import {
  createBatchMarkerCommand,
  createBatchStyleCommand,
} from '../editor/actions'
import { useEditorUiStore } from '../editor/store'
import { toLocalizedError } from '../i18n/errors'
import {
  localizedMessage,
  translateMessage,
  type LocalizedMessage,
} from '../i18n/messages'
import {
  isSafeExternalLink,
  openSafeExternalLink,
} from '../platform/external-link'
import { createPlatformId } from '../platform/ids'

export interface TopicInspectorProps {
  readonly document: MindMapDocument
  readonly onExecute: (command: MindMapCommand) => CommandResult | undefined
}

interface StylePreset {
  readonly id: string
  readonly labelKey:
    | 'inspector.presets.default'
    | 'inspector.presets.lavender'
    | 'inspector.presets.mint'
    | 'inspector.presets.sunset'
  readonly style: Partial<MindMapNodeStyle>
}

const stylePresets: readonly StylePreset[] = [
  {
    id: 'default',
    labelKey: 'inspector.presets.default',
    style: {
      backgroundColor: '#ffffff',
      borderColor: '#8c82e7',
      textColor: '#29263f',
    },
  },
  {
    id: 'lavender',
    labelKey: 'inspector.presets.lavender',
    style: {
      backgroundColor: '#eeeaff',
      borderColor: '#7768e8',
      textColor: '#312e68',
    },
  },
  {
    id: 'mint',
    labelKey: 'inspector.presets.mint',
    style: {
      backgroundColor: '#e0f7ef',
      borderColor: '#36a47f',
      textColor: '#164f3e',
    },
  },
  {
    id: 'sunset',
    labelKey: 'inspector.presets.sunset',
    style: {
      backgroundColor: '#fff0df',
      borderColor: '#df8e49',
      textColor: '#704018',
    },
  },
]

function getMarkerValue(node: MindMapNode, kind: MindMapMarkerKind): string {
  return node.markers.find((marker) => marker.kind === kind)?.value ?? ''
}

function getSharedMarkerValue(
  nodes: readonly MindMapNode[],
  kind: MindMapMarkerKind,
): string {
  const values = [...new Set(nodes.map((node) => getMarkerValue(node, kind)))]
  return values.length === 1 ? (values[0] ?? '') : ''
}

/** Inspector for command-backed styles, metadata and safe external links. */
export function TopicInspector({ document, onExecute }: TopicInspectorProps) {
  const { t } = useTranslation()
  const selectedNodeIds = useEditorUiStore((state) => state.selectedNodeIds)
  const selectedNodes = useMemo(
    () =>
      normalizeTopLevelNodeSelection(document, selectedNodeIds)
        .map((nodeId) => document.nodes[nodeId])
        .filter((node): node is MindMapNode => Boolean(node)),
    [document, selectedNodeIds],
  )
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const [notes, setNotes] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [relationshipLabel, setRelationshipLabel] = useState('')
  const [boundaryLabel, setBoundaryLabel] = useState('')
  const [summaryLabel, setSummaryLabel] = useState('')
  const [error, setError] = useState<LocalizedMessage | null>(null)

  useEffect(() => {
    setNotes(selectedNode?.notes ?? '')
    setLinkLabel('')
    setLinkUrl('')
    setEditingLinkIndex(null)
    setError(null)
  }, [selectedNode?.id, selectedNode?.notes])

  const selectedTopicIds = selectedNodes.map((node) => node.id)
  const selectedRelationship =
    selectedTopicIds.length === 2
      ? document.relationships.find(
          (relationship) =>
            relationship.fromNodeId === selectedTopicIds[0] &&
            relationship.toNodeId === selectedTopicIds[1],
        )
      : undefined
  const selectedTopicKey = selectedTopicIds.join('|')
  const matchesSelectedTopics = (nodeIds: readonly string[]) =>
    nodeIds.length === selectedTopicIds.length &&
    nodeIds.every((nodeId) => selectedTopicIds.includes(nodeId))
  const selectedBoundary = document.boundaries.find((boundary) =>
    matchesSelectedTopics(boundary.nodeIds),
  )
  const selectedSummary = document.summaries.find((summary) =>
    matchesSelectedTopics(summary.nodeIds),
  )

  useEffect(() => {
    setRelationshipLabel(selectedRelationship?.label ?? '')
    setBoundaryLabel(selectedBoundary?.label ?? '')
    setSummaryLabel(selectedSummary?.label ?? '')
  }, [
    selectedBoundary?.id,
    selectedBoundary?.label,
    selectedRelationship?.id,
    selectedRelationship?.label,
    selectedSummary?.id,
    selectedSummary?.label,
    selectedTopicKey,
  ])

  if (selectedNodes.length === 0) {
    return (
      <aside className="topic-inspector" aria-label={t('inspector.label')}>
        <p>{t('inspector.empty')}</p>
      </aside>
    )
  }

  function execute(command: MindMapCommand) {
    setError(null)
    try {
      onExecute(command)
    } catch (commandError) {
      setError(toLocalizedError(commandError, 'errors.topicUpdateFailed'))
    }
  }

  function applyStyle(style: Partial<MindMapNodeStyle>) {
    execute(createBatchStyleCommand(document, selectedNodeIds, style))
  }

  function applyMarker(kind: MindMapMarkerKind, value: string) {
    execute(
      createBatchMarkerCommand(document, selectedNodeIds, kind, value || null),
    )
  }

  function saveNotes() {
    if (!selectedNode || notes === selectedNode.notes) return
    execute({
      type: mindMapCommandTypes.updateNodeNotes,
      label: 'Update topic notes',
      payload: { nodeId: selectedNode.id, notes },
    })
  }

  function removeNotes() {
    if (!selectedNode || selectedNode.notes.length === 0) return
    setNotes('')
    execute({
      type: mindMapCommandTypes.updateNodeNotes,
      label: 'Remove topic notes',
      payload: { nodeId: selectedNode.id, notes: '' },
    })
  }

  function toggleCollapse() {
    if (!selectedNode || selectedNode.childIds.length === 0) return
    execute({
      type: mindMapCommandTypes.setNodeCollapse,
      label: selectedNode.collapsed ? 'Expand topic' : 'Collapse topic',
      payload: { nodeId: selectedNode.id, collapsed: !selectedNode.collapsed },
    })
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedNode) return
    if (!isSafeExternalLink(linkUrl)) {
      setError(localizedMessage('errors.invalidLink'))
      return
    }

    const links = [...selectedNode.links]
    const link = { label: linkLabel.trim() || linkUrl, url: linkUrl }
    if (editingLinkIndex === null) links.push(link)
    else links.splice(editingLinkIndex, 1, link)

    execute({
      type: mindMapCommandTypes.updateNodeLinks,
      label: editingLinkIndex === null ? 'Add topic link' : 'Update topic link',
      payload: { nodeId: selectedNode.id, links },
    })
    setLinkLabel('')
    setLinkUrl('')
    setEditingLinkIndex(null)
  }

  function removeLink(index: number) {
    if (!selectedNode) return
    execute({
      type: mindMapCommandTypes.updateNodeLinks,
      label: 'Remove topic link',
      payload: {
        nodeId: selectedNode.id,
        links: selectedNode.links.filter((_, linkIndex) => linkIndex !== index),
      },
    })
  }

  function saveRelationship() {
    if (selectedTopicIds.length !== 2) return
    const next = selectedRelationship
      ? document.relationships.map((relationship) =>
          relationship.id === selectedRelationship.id
            ? {
                ...relationship,
                label: relationshipLabel.trim() || t('defaults.related'),
              }
            : relationship,
        )
      : [
          ...document.relationships,
          {
            id: createPlatformId('relationship'),
            fromNodeId: selectedTopicIds[0]!,
            toNodeId: selectedTopicIds[1]!,
            label: relationshipLabel.trim() || t('defaults.related'),
          },
        ]
    execute({
      type: mindMapCommandTypes.updateRelationships,
      label: selectedRelationship
        ? 'Update relationship'
        : 'Create relationship',
      payload: { relationships: next },
    })
  }

  function deleteRelationship() {
    if (!selectedRelationship) return
    execute({
      type: mindMapCommandTypes.updateRelationships,
      label: 'Delete relationship',
      payload: {
        relationships: document.relationships.filter(
          (relationship) => relationship.id !== selectedRelationship.id,
        ),
      },
    })
  }

  function saveGrouping(kind: 'boundary' | 'summary') {
    if (selectedTopicIds.length < 2) return
    const records =
      kind === 'boundary' ? document.boundaries : document.summaries
    const label = (kind === 'boundary' ? boundaryLabel : summaryLabel).trim()
    const existing = kind === 'boundary' ? selectedBoundary : selectedSummary
    const next = existing
      ? records.map((record) =>
          record.id === existing.id
            ? { ...record, label: label || existing.label }
            : record,
        )
      : [
          ...records,
          {
            id: createPlatformId(kind),
            nodeIds: selectedTopicIds,
            label:
              label ||
              (kind === 'boundary'
                ? t('defaults.boundary')
                : t('defaults.summary')),
          },
        ]
    execute(
      kind === 'boundary'
        ? {
            type: mindMapCommandTypes.updateBoundaries,
            label: existing ? 'Update boundary' : 'Create boundary',
            payload: { boundaries: next },
          }
        : {
            type: mindMapCommandTypes.updateSummaries,
            label: existing ? 'Update summary' : 'Create summary',
            payload: { summaries: next },
          },
    )
  }

  function deleteGrouping(kind: 'boundary' | 'summary') {
    const existing = kind === 'boundary' ? selectedBoundary : selectedSummary
    if (!existing) return
    execute(
      kind === 'boundary'
        ? {
            type: mindMapCommandTypes.updateBoundaries,
            label: 'Delete boundary',
            payload: {
              boundaries: document.boundaries.filter(
                (boundary) => boundary.id !== existing.id,
              ),
            },
          }
        : {
            type: mindMapCommandTypes.updateSummaries,
            label: 'Delete summary',
            payload: {
              summaries: document.summaries.filter(
                (summary) => summary.id !== existing.id,
              ),
            },
          },
    )
  }

  const sharedStyle = selectedNodes[0]?.style

  return (
    <aside className="topic-inspector" aria-label={t('inspector.label')}>
      <header>
        <p className="eyebrow">{t('inspector.label')}</p>
        <strong>
          {selectedNodes.length === 1
            ? selectedNode?.text
            : t('inspector.selectedCount', { count: selectedNodes.length })}
        </strong>
        {selectedNode && selectedNode.childIds.length > 0 ? (
          <button type="button" onClick={toggleCollapse}>
            {selectedNode.collapsed
              ? t('inspector.expandBranch')
              : t('inspector.collapseBranch')}
          </button>
        ) : null}
      </header>

      <section aria-label={t('inspector.styleLabel')}>
        <h2>{t('inspector.style')}</h2>
        <div className="style-presets">
          {stylePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyStyle(preset.style)}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
        <div className="color-controls">
          <label>
            {t('inspector.fill')}
            <input
              aria-label={t('inspector.fillColor')}
              type="color"
              value={sharedStyle?.backgroundColor ?? '#ffffff'}
              onChange={(event) =>
                applyStyle({ backgroundColor: event.target.value })
              }
            />
          </label>
          <label>
            {t('inspector.border')}
            <input
              aria-label={t('inspector.borderColor')}
              type="color"
              value={sharedStyle?.borderColor ?? '#8c82e7'}
              onChange={(event) =>
                applyStyle({ borderColor: event.target.value })
              }
            />
          </label>
          <label>
            {t('inspector.text')}
            <input
              aria-label={t('inspector.textColor')}
              type="color"
              value={sharedStyle?.textColor ?? '#29263f'}
              onChange={(event) =>
                applyStyle({ textColor: event.target.value })
              }
            />
          </label>
        </div>
      </section>

      <section aria-label={t('inspector.markersLabel')}>
        <h2>{t('inspector.markers')}</h2>
        <label>
          {t('inspector.priority')}
          <select
            aria-label={t('inspector.priorityMarker')}
            value={getSharedMarkerValue(selectedNodes, 'priority')}
            onChange={(event) => applyMarker('priority', event.target.value)}
          >
            <option value="">{t('inspector.noneOrMixed')}</option>
            <option value="1">
              {t('inspector.priorityValue', { value: 1 })}
            </option>
            <option value="2">
              {t('inspector.priorityValue', { value: 2 })}
            </option>
            <option value="3">
              {t('inspector.priorityValue', { value: 3 })}
            </option>
          </select>
        </label>
        <label>
          {t('inspector.status')}
          <select
            aria-label={t('inspector.statusMarker')}
            value={getSharedMarkerValue(selectedNodes, 'status')}
            onChange={(event) => applyMarker('status', event.target.value)}
          >
            <option value="">{t('inspector.noneOrMixed')}</option>
            <option value="todo">{t('inspector.statusTodo')}</option>
            <option value="doing">{t('inspector.statusDoing')}</option>
            <option value="done">{t('inspector.statusDone')}</option>
          </select>
        </label>
        <label>
          {t('inspector.icon')}
          <select
            aria-label={t('inspector.iconMarker')}
            value={getSharedMarkerValue(selectedNodes, 'icon')}
            onChange={(event) => applyMarker('icon', event.target.value)}
          >
            <option value="">{t('inspector.noneOrMixed')}</option>
            <option value="★">{t('inspector.iconStar')}</option>
            <option value="✓">{t('inspector.iconCheck')}</option>
            <option value="!">{t('inspector.iconImportant')}</option>
          </select>
        </label>
      </section>

      {selectedTopicIds.length >= 2 ? (
        <section aria-label={t('inspector.structureLabel')}>
          <h2>{t('inspector.structure')}</h2>
          {selectedTopicIds.length === 2 ? (
            <div className="structure-control">
              <label>
                {t('inspector.relationshipLabel')}
                <input
                  aria-label={t('inspector.relationshipLabel')}
                  placeholder={t('defaults.related')}
                  value={relationshipLabel}
                  onChange={(event) => setRelationshipLabel(event.target.value)}
                />
              </label>
              <div>
                <button type="button" onClick={saveRelationship}>
                  {selectedRelationship
                    ? t('inspector.saveRelationship')
                    : t('inspector.addRelationship')}
                </button>
                {selectedRelationship ? (
                  <button type="button" onClick={deleteRelationship}>
                    {t('inspector.deleteRelationship')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="structure-control">
            <label>
              {t('inspector.boundaryLabel')}
              <input
                aria-label={t('inspector.boundaryLabel')}
                placeholder={t('defaults.boundary')}
                value={boundaryLabel}
                onChange={(event) => setBoundaryLabel(event.target.value)}
              />
            </label>
            <div>
              <button type="button" onClick={() => saveGrouping('boundary')}>
                {selectedBoundary
                  ? t('inspector.saveBoundary')
                  : t('inspector.addBoundary')}
              </button>
              {selectedBoundary ? (
                <button
                  type="button"
                  onClick={() => deleteGrouping('boundary')}
                >
                  {t('inspector.deleteBoundary')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="structure-control">
            <label>
              {t('inspector.summaryLabel')}
              <input
                aria-label={t('inspector.summaryLabel')}
                placeholder={t('defaults.summary')}
                value={summaryLabel}
                onChange={(event) => setSummaryLabel(event.target.value)}
              />
            </label>
            <div>
              <button type="button" onClick={() => saveGrouping('summary')}>
                {selectedSummary
                  ? t('inspector.saveSummary')
                  : t('inspector.addSummary')}
              </button>
              {selectedSummary ? (
                <button type="button" onClick={() => deleteGrouping('summary')}>
                  {t('inspector.deleteSummary')}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {selectedNode ? (
        <>
          <section aria-label={t('inspector.notesLabel')}>
            <div className="inspector-section-heading">
              <h2>{t('inspector.notes')}</h2>
              <button type="button" onClick={removeNotes}>
                {t('inspector.clear')}
              </button>
            </div>
            <textarea
              aria-label={t('inspector.notesLabel')}
              placeholder={t('inspector.notesPlaceholder')}
              value={notes}
              onBlur={saveNotes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </section>

          <section aria-label={t('inspector.linksLabel')}>
            <h2>{t('inspector.links')}</h2>
            <ul className="topic-link-list">
              {selectedNode.links.map((link, index) => (
                <li key={`${link.url}-${index}`}>
                  <span>{link.label}</span>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!openSafeExternalLink(link.url)) {
                          setError(localizedMessage('errors.unsafeLink'))
                        }
                      }}
                    >
                      {t('inspector.open')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLinkIndex(index)
                        setLinkLabel(link.label)
                        setLinkUrl(link.url)
                      }}
                    >
                      {t('inspector.edit')}
                    </button>
                    <button type="button" onClick={() => removeLink(index)}>
                      {t('inspector.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <form className="topic-link-form" onSubmit={submitLink}>
              <input
                aria-label={t('inspector.linkLabel')}
                placeholder={t('inspector.linkLabelPlaceholder')}
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
              />
              <input
                aria-label={t('inspector.linkUrl')}
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <button type="submit">
                {editingLinkIndex === null
                  ? t('inspector.addLink')
                  : t('inspector.saveLink')}
              </button>
            </form>
          </section>
        </>
      ) : null}
      {error ? (
        <p className="inspector-error" role="alert">
          {translateMessage(t, error)}
        </p>
      ) : null}
    </aside>
  )
}
