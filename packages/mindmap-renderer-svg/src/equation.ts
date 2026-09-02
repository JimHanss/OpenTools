export const mindMapEquationRendererVersion = 'mathjax-newcm-svg-v4.1.3'

export interface EquationRenderRequest {
  readonly source: string
  readonly displayMode: 'block'
  readonly fontSize: number
}

export interface RenderedEquation {
  readonly state: 'ready'
  readonly cacheKey: string
  /** Sanitized, self-contained SVG markup with numeric intrinsic dimensions. */
  readonly svg: string
  readonly width: number
  readonly height: number
}

export interface FailedEquationRender {
  readonly state: 'error'
  readonly cacheKey: string
  readonly error: string
  readonly width: number
  readonly height: number
}

export type EquationRenderResult = RenderedEquation | FailedEquationRender

export interface EquationRenderer {
  render(request: EquationRenderRequest): Promise<EquationRenderResult>
  clear?(): void
}

export interface RenderableMindMapEquation {
  readonly id: string
  readonly nodeId: string
  readonly blockId: string
  readonly state: 'ready' | 'loading' | 'error'
  readonly svg?: string | undefined
  readonly width: number
  readonly height: number
  readonly error?: string | undefined
}

export function createEquationRenderCacheKey(
  request: EquationRenderRequest,
  rendererVersion = mindMapEquationRendererVersion,
): string {
  return JSON.stringify([
    rendererVersion,
    request.displayMode,
    request.fontSize,
    request.source,
  ])
}

export function getMindMapEquationRenderKey(
  nodeId: string,
  blockId: string,
): string {
  return `${nodeId.length}:${nodeId}${blockId}`
}
