import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createMindMapBoundary,
  createMindMapCallout,
  createMindMapRelationship,
  createMindMapSummary,
  mindMapCommandTypes,
  normalizeTopLevelNodeSelection,
  type CommandResult,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapMarkerKind,
  type MindMapNode,
} from '@opentools/mindmap-core'
import {
  getMindMapEquationRenderKey,
  type EquationRenderer,
  type RenderableMindMapAsset,
  type RenderableMindMapEquation,
} from '@opentools/mindmap-renderer-svg'

import { createBatchMarkerCommand } from '../editor/actions'
import {
  editorActionIds,
  type EditorActionDispatcher,
} from '../editor/action-registry'
import {
  getSelectedTopicIds,
  reconcileEditorSelection,
} from '../editor/selection'
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
import { SemanticInspector } from './semantic-inspector'
import { EnhancementInspector } from './enhancement-inspector'
import { TopicStyleInspector } from './topic-style-inspector'
import type { EquationEditorValue } from './equation-editor-dialog'

const EquationEditorDialog = lazy(() =>
  import('./equation-editor-dialog').then(({ EquationEditorDialog }) => ({
    default: EquationEditorDialog,
  })),
)

export interface TopicInspectorProps {
  readonly actionDispatcher: EditorActionDispatcher
  readonly assets?: Readonly<Record<string, RenderableMindMapAsset>>
  readonly document: MindMapDocument
  readonly equationRenderer?: EquationRenderer | undefined
  readonly equations?:
    Readonly<Record<string, RenderableMindMapEquation>> | undefined
  readonly isImageBusy?: boolean
  readonly onExecute: (command: MindMapCommand) => CommandResult | undefined
  readonly onInsertImage?: (nodeId: string, source: Blob) => Promise<void>
}

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
export function TopicInspector({
  actionDispatcher,
  assets = {},
  document,
  equationRenderer,
  equations = {},
  isImageBusy = false,
  onExecute,
  onInsertImage,
}: TopicInspectorProps) {
  const { t } = useTranslation()
  const selection = useEditorUiStore((state) => state.selection)
  const setSelection = useEditorUiStore((state) => state.setSelection)
  const selectedNodeIds = getSelectedTopicIds(
    reconcileEditorSelection(document, selection),
  )
  const selectedNodes = useMemo(
    () =>
      normalizeTopLevelNodeSelection(document, selectedNodeIds)
        .map((nodeId) => document.nodes[nodeId])
        .filter((node): node is MindMapNode => Boolean(node)),
    [document, selectedNodeIds],
  )
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const [notes, setNotes] = useState('')
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const imageButtonRef = useRef<HTMLButtonElement | null>(null)
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [relationshipLabel, setRelationshipLabel] = useState('')
  const [boundaryLabel, setBoundaryLabel] = useState('')
  const [summaryLabel, setSummaryLabel] = useState('')
  const [error, setError] = useState<LocalizedMessage | null>(null)
  const [equationEditor, setEquationEditor] = useState<{
    readonly blockId?: string | undefined
    readonly initialSource: string
  } | null>(null)

  useEffect(() => {
    setNotes(selectedNode?.notes ?? '')
    setLinkLabel('')
    setLinkUrl('')
    setEditingLinkIndex(null)
    setError(null)
    setEquationEditor(null)
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
  const selectedCallout = selectedNode
    ? document.callouts.find(
        (callout) => callout.ownerNodeId === selectedNode.id,
      )
    : undefined

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

  if (
    selection.kind === 'relationship' ||
    selection.kind === 'boundary' ||
    selection.kind === 'summary' ||
    selection.kind === 'callout'
  ) {
    return (
      <EnhancementInspector
        document={document}
        selection={selection}
        onExecute={onExecute}
      />
    )
  }

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
      return onExecute(command)
    } catch (commandError) {
      setError(toLocalizedError(commandError, 'errors.topicUpdateFailed'))
    }
    return undefined
  }

  function createOrSelectCallout() {
    if (!selectedNode) return
    if (selectedCallout) {
      setSelection({ kind: 'callout', id: selectedCallout.id })
      return
    }
    const calloutId = createPlatformId('callout')
    const result = execute({
      type: mindMapCommandTypes.createCallout,
      label: 'Create callout',
      payload: {
        callout: createMindMapCallout({
          id: calloutId,
          ownerNodeId: selectedNode.id,
          text: t('defaults.callout'),
        }),
      },
    })
    if (result) setSelection({ kind: 'callout', id: calloutId })
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
    execute({
      type: selectedRelationship
        ? mindMapCommandTypes.updateRelationship
        : mindMapCommandTypes.createRelationship,
      label: selectedRelationship
        ? 'Update relationship'
        : 'Create relationship',
      payload: selectedRelationship
        ? {
            relationshipId: selectedRelationship.id,
            changes: {
              label: relationshipLabel.trim() || t('defaults.related'),
            },
          }
        : {
            relationship: createMindMapRelationship({
              id: createPlatformId('relationship'),
              fromNodeId: selectedTopicIds[0]!,
              toNodeId: selectedTopicIds[1]!,
              label: relationshipLabel.trim() || t('defaults.related'),
            }),
          },
    } as MindMapCommand)
  }

  function deleteRelationship() {
    if (!selectedRelationship) return
    execute({
      type: mindMapCommandTypes.deleteRelationship,
      label: 'Delete relationship',
      payload: { relationshipId: selectedRelationship.id },
    })
  }

  function saveGrouping(kind: 'boundary' | 'summary') {
    if (selectedTopicIds.length < 2) return
    const label = (kind === 'boundary' ? boundaryLabel : summaryLabel).trim()
    if (kind === 'boundary') {
      execute({
        type: selectedBoundary
          ? mindMapCommandTypes.updateBoundary
          : mindMapCommandTypes.createBoundary,
        label: selectedBoundary ? 'Update boundary' : 'Create boundary',
        payload: selectedBoundary
          ? {
              boundaryId: selectedBoundary.id,
              changes: { label: label || selectedBoundary.label },
            }
          : {
              boundary: createMindMapBoundary({
                id: createPlatformId('boundary'),
                nodeIds: selectedTopicIds,
                label: label || t('defaults.boundary'),
              }),
            },
      } as MindMapCommand)
      return
    }

    execute({
      type: selectedSummary
        ? mindMapCommandTypes.updateSummary
        : mindMapCommandTypes.createSummary,
      label: selectedSummary ? 'Update summary' : 'Create summary',
      payload: selectedSummary
        ? {
            summaryId: selectedSummary.id,
            changes: { label: label || selectedSummary.label },
          }
        : {
            summary: createMindMapSummary({
              id: createPlatformId('summary'),
              nodeIds: selectedTopicIds,
              label: label || t('defaults.summary'),
            }),
          },
    } as MindMapCommand)
  }

  function deleteGrouping(kind: 'boundary' | 'summary') {
    const existing = kind === 'boundary' ? selectedBoundary : selectedSummary
    if (!existing) return
    execute(
      kind === 'boundary'
        ? {
            type: mindMapCommandTypes.deleteBoundary,
            label: 'Delete boundary',
            payload: { boundaryId: existing.id },
          }
        : {
            type: mindMapCommandTypes.deleteSummary,
            label: 'Delete summary',
            payload: { summaryId: existing.id },
          },
    )
  }

  function updateImageBlock(
    blockId: string,
    changes: {
      readonly width?: number
      readonly height?: number
      readonly altText?: string
      readonly preserveAspectRatio?: boolean
    },
  ) {
    if (!selectedNode) return
    execute({
      type: mindMapCommandTypes.updateImageContentBlock,
      label: 'Update topic image',
      payload: { nodeId: selectedNode.id, blockId, changes },
    })
  }

  function saveEquation(value: EquationEditorValue) {
    if (!selectedNode || !equationEditor) return
    if (equationEditor.blockId) {
      execute({
        type: mindMapCommandTypes.updateEquationContentBlock,
        label: 'Update topic equation',
        payload: {
          nodeId: selectedNode.id,
          blockId: equationEditor.blockId,
          changes: {
            source: value.source,
            displayMode: 'block',
            width: value.width,
            height: value.height,
          },
        },
      })
    } else {
      execute({
        type: mindMapCommandTypes.createEquationContentBlock,
        label: 'Add topic equation',
        payload: {
          nodeId: selectedNode.id,
          block: {
            id: createPlatformId('equation-block'),
            type: 'equation',
            source: value.source,
            displayMode: 'block',
            width: value.width,
            height: value.height,
          },
        },
      })
    }
    setEquationEditor(null)
  }

  async function insertImage(source: Blob) {
    if (!selectedNode || !onInsertImage) return
    try {
      await onInsertImage(selectedNode.id, source)
    } finally {
      imageButtonRef.current?.focus()
    }
  }

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
          <button
            data-action-id={editorActionIds.collapse}
            type="button"
            onClick={() =>
              void actionDispatcher.dispatch(editorActionIds.collapse)
            }
          >
            {selectedNode.collapsed
              ? t('inspector.expandBranch')
              : t('inspector.collapseBranch')}
          </button>
        ) : null}
      </header>

      <TopicStyleInspector
        document={document}
        selectedNodeIds={selectedNodeIds}
        onExecute={execute}
      />

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

      <SemanticInspector
        document={document}
        selectedNodes={selectedNodes}
        onExecute={execute}
      />

      {selectedNode ? (
        <section aria-label={t('enhancementInspector.callout')}>
          <h2>{t('enhancementInspector.callout')}</h2>
          <button type="button" onClick={createOrSelectCallout}>
            {selectedCallout
              ? t('semantic.editCallout')
              : t('semantic.addCallout')}
          </button>
        </section>
      ) : null}

      {selectedNode ? (
        <section aria-label={t('image.section')} className="image-inspector">
          <div className="inspector-section-heading">
            <h2>{t('image.section')}</h2>
            <input
              ref={imageInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
              aria-label={t('image.file')}
              className="sr-only"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void insertImage(file)
              }}
            />
            <button
              ref={imageButtonRef}
              disabled={isImageBusy || !onInsertImage}
              type="button"
              onClick={() => imageInputRef.current?.click()}
            >
              {isImageBusy ? t('image.inserting') : t('image.add')}
            </button>
          </div>
          <p className="inspector-help">{t('image.pasteHint')}</p>
          <ul className="topic-image-list">
            {selectedNode.contentBlocks.flatMap((block) => {
              if (block.type !== 'image') return []
              const metadata = document.assets[block.assetId]
              const renderable = assets[block.assetId]
              return [
                <li key={block.id}>
                  {renderable?.state === 'ready' && renderable.href ? (
                    <img
                      alt={block.altText}
                      src={renderable.href}
                      style={{ maxWidth: Math.min(220, block.width) }}
                    />
                  ) : (
                    <div className="topic-image-placeholder">
                      {renderable?.state === 'loading'
                        ? t('image.loading')
                        : block.altText || t('image.unavailable')}
                    </div>
                  )}
                  <label>
                    {t('image.width')}
                    <input
                      key={`${block.id}-width-${block.width}`}
                      aria-label={`${t('image.width')} ${block.altText}`}
                      defaultValue={Math.round(block.width)}
                      min={32}
                      max={4096}
                      type="number"
                      onBlur={(event) => {
                        const width = Number(event.currentTarget.value)
                        if (!Number.isFinite(width) || width <= 0) return
                        const height =
                          block.preserveAspectRatio && metadata
                            ? width *
                              (metadata.intrinsicHeight /
                                metadata.intrinsicWidth)
                            : block.height
                        updateImageBlock(block.id, {
                          width,
                          ...(height ? { height } : {}),
                        })
                      }}
                    />
                  </label>
                  <label>
                    {t('image.altText')}
                    <input
                      key={`${block.id}-alt-${block.altText}`}
                      aria-label={t('image.altText')}
                      defaultValue={block.altText}
                      onBlur={(event) =>
                        updateImageBlock(block.id, {
                          altText: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <div>
                    <button
                      disabled={!metadata}
                      type="button"
                      onClick={() => {
                        if (!metadata) return
                        updateImageBlock(block.id, {
                          height:
                            block.width *
                            (metadata.intrinsicHeight /
                              metadata.intrinsicWidth),
                          preserveAspectRatio: true,
                        })
                      }}
                    >
                      {t('image.restoreRatio')}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        execute({
                          type: mindMapCommandTypes.deleteImageContentBlock,
                          label: 'Delete topic image',
                          payload: {
                            nodeId: selectedNode.id,
                            blockId: block.id,
                          },
                        })
                      }
                    >
                      {t('image.remove')}
                    </button>
                  </div>
                </li>,
              ]
            })}
          </ul>
        </section>
      ) : null}

      {selectedNode && equationRenderer ? (
        <section
          aria-label={t('equation.section')}
          className="equation-inspector"
        >
          <div className="inspector-section-heading">
            <h2>{t('equation.section')}</h2>
            <button
              type="button"
              onClick={() =>
                setEquationEditor({
                  initialSource: String.raw`E = mc^2`,
                })
              }
            >
              {t('equation.add')}
            </button>
          </div>
          <ul className="topic-equation-list">
            {selectedNode.contentBlocks.flatMap((block) => {
              if (block.type !== 'equation') return []
              const renderable =
                equations[
                  getMindMapEquationRenderKey(selectedNode.id, block.id)
                ]
              return [
                <li key={block.id}>
                  <div
                    aria-label={block.source}
                    className="topic-equation-preview"
                    role="img"
                  >
                    {renderable?.state === 'ready' && renderable.svg ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: renderable.svg }}
                      />
                    ) : (
                      <span>
                        {renderable?.state === 'loading'
                          ? t('equation.loading')
                          : t('equation.unavailable')}
                      </span>
                    )}
                  </div>
                  <code className="topic-equation-source">{block.source}</code>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setEquationEditor({
                          blockId: block.id,
                          initialSource: block.source,
                        })
                      }
                    >
                      {t('equation.edit')}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        execute({
                          type: mindMapCommandTypes.deleteEquationContentBlock,
                          label: 'Delete topic equation',
                          payload: {
                            nodeId: selectedNode.id,
                            blockId: block.id,
                          },
                        })
                      }
                    >
                      {t('equation.remove')}
                    </button>
                  </div>
                </li>,
              ]
            })}
          </ul>
        </section>
      ) : null}

      {equationEditor && equationRenderer ? (
        <Suspense
          fallback={
            <div className="equation-dialog-backdrop">
              <div
                aria-live="polite"
                className="equation-dialog-card"
                role="status"
              >
                {t('equation.loading')}
              </div>
            </div>
          }
        >
          <EquationEditorDialog
            key={`${selectedNode?.id ?? 'none'}-${equationEditor.blockId ?? 'new'}`}
            initialSource={equationEditor.initialSource}
            isEditing={Boolean(equationEditor.blockId)}
            renderer={equationRenderer}
            onCancel={() => setEquationEditor(null)}
            onSave={saveEquation}
          />
        </Suspense>
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
