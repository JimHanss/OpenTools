import type { MindMapDocument, MindMapLabel } from './model'

export const maximumMindMapLabelNameLength = 64

export function normalizeMindMapLabelName(name: string): string {
  return name.trim().normalize('NFKC')
}

export function getMindMapLabelComparisonKey(name: string): string {
  return normalizeMindMapLabelName(name).toLocaleLowerCase('en-US')
}

export function isValidMindMapLabel(label: MindMapLabel): boolean {
  const name = normalizeMindMapLabelName(label.name)
  return (
    label.id.trim().length > 0 &&
    name.length > 0 &&
    name.length <= maximumMindMapLabelNameLength &&
    !/[,，]/u.test(name) &&
    label.color.trim().length > 0 &&
    (label.order === undefined || Number.isFinite(label.order))
  )
}

export function sortMindMapLabelIds(
  document: Pick<MindMapDocument, 'labels'>,
  labelIds: readonly string[],
): string[] {
  return [...labelIds].sort((leftId, rightId) => {
    const left = document.labels[leftId]
    const right = document.labels[rightId]
    if (!left || !right) return leftId.localeCompare(rightId)
    const byOrder =
      (left.order ?? Number.MAX_SAFE_INTEGER) -
      (right.order ?? Number.MAX_SAFE_INTEGER)
    return byOrder === 0
      ? getMindMapLabelComparisonKey(left.name).localeCompare(
          getMindMapLabelComparisonKey(right.name),
        )
      : byOrder
  })
}
