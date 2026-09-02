import type {
  MindMapDocument,
  MindMapNodeId,
  MindMapNumberingPolicy,
  MindMapNumberingStyle,
} from './model'
import { getRootNodeIdsInDocumentOrder } from './traversal'

export interface DerivedMindMapNumbering {
  readonly nodeId: MindMapNodeId
  readonly label: string
  readonly segments: readonly number[]
  readonly ownerNodeId: MindMapNodeId
}

function formatAlpha(value: number): string {
  let current = value
  let result = ''
  while (current > 0) {
    current -= 1
    result = String.fromCharCode(65 + (current % 26)) + result
    current = Math.floor(current / 26)
  }
  return result
}

function formatRoman(value: number): string {
  const numerals: readonly [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let current = value
  let result = ''
  for (const [amount, symbol] of numerals) {
    while (current >= amount) {
      result += symbol
      current -= amount
    }
  }
  return result
}

export function formatMindMapNumber(
  value: number,
  style: MindMapNumberingStyle,
): string {
  switch (style) {
    case 'decimal':
      return String(value)
    case 'alpha':
      return formatAlpha(value)
    case 'roman':
      return formatRoman(value)
  }
}

interface ActiveNumbering {
  readonly ownerNodeId: MindMapNodeId
  readonly policy: MindMapNumberingPolicy
  readonly prefix: readonly number[]
}

export function deriveMindMapNumbering(
  document: MindMapDocument,
): Readonly<Record<MindMapNodeId, DerivedMindMapNumbering>> {
  const derived: Record<MindMapNodeId, DerivedMindMapNumbering> = {}

  const visit = (nodeId: MindMapNodeId, inherited?: ActiveNumbering): void => {
    const node = document.nodes[nodeId]
    if (!node) return
    const active = node.numbering
      ? { ownerNodeId: node.id, policy: node.numbering, prefix: [] }
      : inherited
    let value = active?.policy.startAt ?? 1
    for (const childId of node.childIds) {
      if (active?.policy.restartAtNodeId === childId) {
        value = active.policy.startAt
      }
      const segments = active
        ? active.policy.mode === 'hierarchical'
          ? [...active.prefix, value]
          : [value]
        : []
      if (active) {
        derived[childId] = {
          nodeId: childId,
          ownerNodeId: active.ownerNodeId,
          segments,
          label: segments
            .map((segment) => formatMindMapNumber(segment, active.policy.style))
            .join('.'),
        }
      }
      visit(
        childId,
        active?.policy.mode === 'hierarchical'
          ? { ...active, prefix: segments }
          : undefined,
      )
      value += 1
    }
  }

  for (const rootNodeId of getRootNodeIdsInDocumentOrder(document)) {
    visit(rootNodeId)
  }
  return derived
}

export function isValidMindMapNumberingPolicy(
  document: MindMapDocument,
  ownerNodeId: MindMapNodeId,
  policy: MindMapNumberingPolicy,
): boolean {
  const descendants = new Set<MindMapNodeId>()
  const stack = [...(document.nodes[ownerNodeId]?.childIds ?? [])]
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || descendants.has(nodeId)) continue
    descendants.add(nodeId)
    stack.push(...(document.nodes[nodeId]?.childIds ?? []))
  }
  return (
    ['decimal', 'alpha', 'roman'].includes(policy.style) &&
    ['siblings', 'hierarchical'].includes(policy.mode) &&
    Number.isInteger(policy.startAt) &&
    policy.startAt >= 1 &&
    policy.startAt <= 3999 &&
    (policy.restartAtNodeId === undefined ||
      descendants.has(policy.restartAtNodeId))
  )
}
