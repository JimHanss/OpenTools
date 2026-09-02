import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  mindMapCommandTypes,
  sortMindMapLabelIds,
  type MindMapCommand,
  type MindMapDocument,
  type MindMapNode,
  type MindMapNumberingPolicy,
  type SingleMindMapCommand,
} from '@opentools/mindmap-core'

import { createPlatformId } from '../platform/ids'

export interface SemanticInspectorProps {
  readonly document: MindMapDocument
  readonly selectedNodes: readonly MindMapNode[]
  readonly onExecute: (command: MindMapCommand) => unknown
}

type NumberingChoice =
  | 'none'
  | 'decimal-siblings'
  | 'decimal-hierarchical'
  | 'alpha-siblings'
  | 'alpha-hierarchical'
  | 'roman-siblings'
  | 'roman-hierarchical'
  | 'mixed'

function numberingChoice(node: MindMapNode): NumberingChoice {
  return node.numbering
    ? `${node.numbering.style}-${node.numbering.mode}`
    : 'none'
}

function policyFromChoice(
  choice: Exclude<NumberingChoice, 'none' | 'mixed'>,
  startAt: number,
): MindMapNumberingPolicy {
  const [style, mode] = choice.split('-') as [
    MindMapNumberingPolicy['style'],
    MindMapNumberingPolicy['mode'],
  ]
  return { style, mode, startAt }
}

export function SemanticInspector({
  document,
  selectedNodes,
  onExecute,
}: SemanticInspectorProps) {
  const { t } = useTranslation()
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#7c3aed')
  const sortedLabelIds = sortMindMapLabelIds(
    document,
    Object.keys(document.labels),
  )
  const choices = [...new Set(selectedNodes.map(numberingChoice))]
  const sharedChoice: NumberingChoice =
    choices.length === 1 ? (choices[0] ?? 'none') : 'mixed'
  const starts = [
    ...new Set(selectedNodes.map((node) => node.numbering?.startAt ?? 1)),
  ]
  const sharedStartAt = starts.length === 1 ? (starts[0] ?? 1) : 1

  const executeCommands = (
    label: string,
    commands: readonly SingleMindMapCommand[],
  ) => {
    if (commands.length === 0) return
    onExecute(
      commands.length === 1
        ? commands[0]!
        : {
            type: mindMapCommandTypes.batch,
            label,
            payload: { commands },
          },
    )
  }

  const createLabel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onExecute({
      type: mindMapCommandTypes.upsertLabel,
      label: 'Create label',
      payload: {
        value: {
          id: createPlatformId('label'),
          name: newLabelName,
          color: newLabelColor,
          order: Object.keys(document.labels).length,
        },
      },
    })
    setNewLabelName('')
  }

  const toggleLabel = (labelId: string, apply: boolean) => {
    executeCommands(
      'Update selected topic labels',
      selectedNodes.map((node) => ({
        type: mindMapCommandTypes.setNodeLabels,
        label: 'Update topic labels',
        payload: {
          nodeId: node.id,
          labelIds: apply
            ? [...new Set([...node.labelIds, labelId])]
            : node.labelIds.filter((candidate) => candidate !== labelId),
          sortMode: node.labelSortMode,
        },
      })),
    )
  }

  const setNumbering = (choice: NumberingChoice, startAt = sharedStartAt) => {
    if (choice === 'mixed') return
    executeCommands(
      'Update selected branch numbering',
      selectedNodes.map((node) => ({
        type: mindMapCommandTypes.setNodeNumbering,
        label: 'Update branch numbering',
        payload: {
          nodeId: node.id,
          numbering:
            choice === 'none' ? null : policyFromChoice(choice, startAt),
        },
      })),
    )
  }

  return (
    <section className="semantic-inspector" aria-label={t('semantic.labels')}>
      <h2>{t('semantic.labels')}</h2>
      <p>{t('semantic.selectedScope', { count: selectedNodes.length })}</p>
      <form className="label-create-form" onSubmit={createLabel}>
        <input
          aria-label={t('semantic.labelName')}
          maxLength={64}
          required
          value={newLabelName}
          onChange={(event) => setNewLabelName(event.target.value)}
        />
        <input
          aria-label={t('semantic.labelColor')}
          type="color"
          value={newLabelColor}
          onChange={(event) => setNewLabelColor(event.target.value)}
        />
        <button type="submit">{t('semantic.addLabel')}</button>
      </form>
      <ul className="label-catalog-list">
        {sortedLabelIds.map((labelId) => {
          const label = document.labels[labelId]!
          const selectedCount = selectedNodes.filter((node) =>
            node.labelIds.includes(label.id),
          ).length
          const checked = selectedCount === selectedNodes.length
          const partial = selectedCount > 0 && !checked
          return (
            <li key={label.id}>
              <label>
                <input
                  aria-describedby={partial ? `${label.id}-partial` : undefined}
                  checked={checked}
                  type="checkbox"
                  onChange={(event) =>
                    toggleLabel(label.id, event.target.checked)
                  }
                />
                <input
                  key={label.name}
                  aria-label={t('semantic.labelName')}
                  defaultValue={label.name}
                  maxLength={64}
                  onBlur={(event) => {
                    if (event.target.value === label.name) return
                    onExecute({
                      type: mindMapCommandTypes.upsertLabel,
                      label: 'Rename label',
                      payload: {
                        value: { ...label, name: event.target.value },
                      },
                    })
                  }}
                />
                <input
                  aria-label={t('semantic.labelColor')}
                  type="color"
                  value={label.color}
                  onChange={(event) =>
                    onExecute({
                      type: mindMapCommandTypes.upsertLabel,
                      label: 'Change label color',
                      payload: {
                        value: { ...label, color: event.target.value },
                      },
                    })
                  }
                />
              </label>
              {partial ? (
                <small id={`${label.id}-partial`}>
                  {t('semantic.partial')}
                </small>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  onExecute({
                    type: mindMapCommandTypes.deleteLabel,
                    label: 'Delete label',
                    payload: { labelId: label.id },
                  })
                }
              >
                {t('semantic.deleteLabel')}
              </button>
            </li>
          )
        })}
      </ul>
      <h2>{t('semantic.numbering')}</h2>
      <label>
        {t('semantic.numbering')}
        <select
          value={sharedChoice}
          onChange={(event) =>
            setNumbering(event.target.value as NumberingChoice)
          }
        >
          {sharedChoice === 'mixed' ? (
            <option disabled value="mixed">
              {t('inspector.noneOrMixed')}
            </option>
          ) : null}
          <option value="none">{t('semantic.numberingNone')}</option>
          <option value="decimal-siblings">
            {t('semantic.decimalSiblings')}
          </option>
          <option value="decimal-hierarchical">
            {t('semantic.decimalHierarchical')}
          </option>
          <option value="alpha-siblings">{t('semantic.alphaSiblings')}</option>
          <option value="alpha-hierarchical">
            {t('semantic.alphaHierarchical')}
          </option>
          <option value="roman-siblings">{t('semantic.romanSiblings')}</option>
          <option value="roman-hierarchical">
            {t('semantic.romanHierarchical')}
          </option>
        </select>
      </label>
      <label>
        {t('semantic.startAt')}
        <input
          disabled={sharedChoice === 'none' || sharedChoice === 'mixed'}
          max={3999}
          min={1}
          type="number"
          value={sharedStartAt}
          onChange={(event) =>
            setNumbering(sharedChoice, Number(event.target.value))
          }
        />
      </label>
    </section>
  )
}
