import type { MindMapMarkerKind } from '@opentools/mindmap-core'
import type {
  MindMapSvgScene,
  SvgSceneMarker,
} from '@opentools/mindmap-renderer-svg'
import type { TFunction } from 'i18next'

function getStatusLabel(value: string, t: TFunction): string {
  switch (value) {
    case 'todo':
      return t('inspector.statusTodo')
    case 'doing':
      return t('inspector.statusDoing')
    case 'done':
      return t('inspector.statusDone')
    default:
      return value
  }
}

export function getLocalizedMarkerLabel(
  marker: Pick<SvgSceneMarker, 'kind' | 'label' | 'value'>,
  t: TFunction,
): string {
  return marker.kind === 'status'
    ? getStatusLabel(marker.value, t)
    : marker.label
}

export function getLocalizedMarkerAriaLabel(
  kind: MindMapMarkerKind,
  value: string,
  t: TFunction,
): string {
  const kindLabel =
    kind === 'priority'
      ? t('inspector.priority')
      : kind === 'status'
        ? t('inspector.status')
        : t('inspector.icon')
  const valueLabel = kind === 'status' ? getStatusLabel(value, t) : value
  return t('canvas.marker', { kind: kindLabel, value: valueLabel })
}

export function localizeMindMapSvgScene(
  scene: MindMapSvgScene,
  t: TFunction,
): MindMapSvgScene {
  return {
    ...scene,
    nodes: scene.nodes.map((node) => ({
      ...node,
      markers: node.markers.map((marker) => ({
        ...marker,
        label: getLocalizedMarkerLabel(marker, t),
      })),
    })),
  }
}
