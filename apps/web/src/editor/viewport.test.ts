import { describe, expect, it } from 'vitest'

import {
  centerViewportOnRect,
  clampViewportZoom,
  createViewportCoordinateAdapter,
  fitViewportToRect,
  panViewport,
  zoomViewportAtPoint,
} from './viewport'

describe('editor viewport calculations', () => {
  it('bounds zoom and preserves the pointer scene point while zooming', () => {
    expect(clampViewportZoom(0)).toBe(0.25)
    expect(clampViewportZoom(20)).toBe(2.5)

    const viewport = { x: 30, y: 50, zoom: 1 }
    const point = { x: 130, y: 150 }
    const next = zoomViewportAtPoint(viewport, point, 0.5)

    expect(next).toEqual({ x: -20, y: 0, zoom: 1.5 })
    expect(panViewport(next, { x: 12, y: -8 })).toEqual({
      x: -8,
      y: -8,
      zoom: 1.5,
    })
  })

  it('converts client and scene coordinates through the viewport transform', () => {
    const adapter = createViewportCoordinateAdapter(
      { x: 40, y: 20, zoom: 2 },
      { x: 100, y: 80 },
      { x: -48, y: -24 },
    )

    expect(adapter.clientToScenePoint({ x: 180, y: 140 })).toEqual({
      x: -28,
      y: -4,
    })
    expect(adapter.sceneToClientPoint({ x: -28, y: -4 })).toEqual({
      x: 180,
      y: 140,
    })
  })

  it('centers small bounds at 100% without enlarging them', () => {
    const fitted = fitViewportToRect(
      { x: 0, y: 0, width: 800, height: 400 },
      { width: 1000, height: 700 },
    )
    expect(fitted.zoom).toBe(1)
    expect(fitted.x).toBe(100)
    expect(fitted.y).toBe(150)
  })

  it('shrinks large bounds to fit and preserves the minimum zoom', () => {
    const fitted = fitViewportToRect(
      { x: 40, y: 20, width: 1600, height: 800 },
      { width: 1000, height: 700 },
    )
    expect(fitted.zoom).toBeCloseTo(0.555)
    expect(fitted.x).toBeCloseTo(33.8)
    expect(fitted.y).toBeCloseTo(116.9)

    expect(
      fitViewportToRect(
        { x: 0, y: 0, width: 20_000, height: 10_000 },
        { width: 800, height: 600 },
      ).zoom,
    ).toBe(0.25)
  })

  it('centers a selected node at the requested zoom', () => {
    expect(
      centerViewportOnRect(
        { x: 100, y: 50, width: 40, height: 20 },
        { x: 0, y: 0, zoom: 1.5 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 220, y: 210, zoom: 1.5 })
  })
})
