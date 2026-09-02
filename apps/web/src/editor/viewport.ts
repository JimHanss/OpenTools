import type { EditorViewport } from './store'

export const minimumViewportZoom = 0.25
export const maximumViewportZoom = 2.5

export interface CanvasPoint {
  readonly x: number
  readonly y: number
}

export interface CanvasRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ViewportSize {
  readonly width: number
  readonly height: number
}

export interface ViewportCoordinateAdapter {
  clientToScenePoint(client: CanvasPoint): CanvasPoint
  sceneToClientPoint(scene: CanvasPoint): CanvasPoint
}

export function clampViewportZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(maximumViewportZoom, Math.max(minimumViewportZoom, zoom))
}

export function createViewportCoordinateAdapter(
  viewport: EditorViewport,
  canvasClientOrigin: CanvasPoint,
  sceneOrigin: CanvasPoint,
): ViewportCoordinateAdapter {
  return {
    clientToScenePoint(client) {
      return {
        x:
          (client.x - canvasClientOrigin.x - viewport.x) / viewport.zoom +
          sceneOrigin.x,
        y:
          (client.y - canvasClientOrigin.y - viewport.y) / viewport.zoom +
          sceneOrigin.y,
      }
    },
    sceneToClientPoint(scene) {
      return {
        x:
          canvasClientOrigin.x +
          viewport.x +
          (scene.x - sceneOrigin.x) * viewport.zoom,
        y:
          canvasClientOrigin.y +
          viewport.y +
          (scene.y - sceneOrigin.y) * viewport.zoom,
      }
    },
  }
}

/** Keeps the scene point below the pointer fixed while zooming. */
export function zoomViewportAtPoint(
  viewport: EditorViewport,
  point: CanvasPoint,
  zoomDelta: number,
): EditorViewport {
  const zoom = clampViewportZoom(viewport.zoom + zoomDelta)
  const scenePoint = {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  }

  return {
    x: point.x - scenePoint.x * zoom,
    y: point.y - scenePoint.y * zoom,
    zoom,
  }
}

export function panViewport(
  viewport: EditorViewport,
  delta: CanvasPoint,
): EditorViewport {
  return {
    ...viewport,
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
  }
}

export function fitViewportToRect(
  rect: CanvasRect,
  viewportSize: ViewportSize,
  padding = 56,
): EditorViewport {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2)
  const availableHeight = Math.max(1, viewportSize.height - padding * 2)
  const zoom = Math.min(
    1,
    clampViewportZoom(
      Math.min(
        availableWidth / Math.max(1, rect.width),
        availableHeight / Math.max(1, rect.height),
      ),
    ),
  )

  return {
    x: (viewportSize.width - rect.width * zoom) / 2 - rect.x * zoom,
    y: (viewportSize.height - rect.height * zoom) / 2 - rect.y * zoom,
    zoom,
  }
}

export function centerViewportOnRect(
  rect: CanvasRect,
  viewport: EditorViewport,
  viewportSize: ViewportSize,
): EditorViewport {
  return {
    ...viewport,
    x: viewportSize.width / 2 - (rect.x + rect.width / 2) * viewport.zoom,
    y: viewportSize.height / 2 - (rect.y + rect.height / 2) * viewport.zoom,
  }
}
