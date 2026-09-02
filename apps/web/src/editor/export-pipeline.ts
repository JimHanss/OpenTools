import {
  getComputedMindMapNodeStyle,
  getReferencedMindMapAssetIds,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import {
  defaultLayoutConfig,
  estimateMindMapNodeSize,
  layoutMindMap,
  measureMindMapTopicText,
} from '@opentools/mindmap-layout'
import {
  createMindMapSvgScene,
  serializeMindMapSvgScene,
  type EquationRenderer,
  type MindMapSvgScene,
} from '@opentools/mindmap-renderer-svg'
import type { MindMapAssetRepository } from '@opentools/mindmap-storage'

import { loadRenderableMindMapAssets } from '../platform/asset-transfer'
import { MindMapExportError } from '../platform/export-error'
import { editorCanvasBackgroundColor } from './presentation'
import { loadRenderableMindMapEquations } from './use-renderable-equations'
import { measureBrowserMindMapTopicText } from '../platform/text-measurement'

export interface PreparedMindMapExport {
  /** The full-document scene. Viewport, focus and filter state are intentionally absent. */
  readonly scene: MindMapSvgScene
  readonly svg: string
}

export interface PrepareMindMapExportOptions {
  readonly assetRepository: MindMapAssetRepository
  readonly document: MindMapDocument
  readonly equationRenderer: EquationRenderer
  readonly transformScene?: (scene: MindMapSvgScene) => MindMapSvgScene
}

function assertFiniteSceneBounds(scene: MindMapSvgScene): void {
  const { x, y, width, height } = scene.bounds
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new MindMapExportError(
      'invalid-bounds',
      'The complete mind-map export has invalid bounds.',
    )
  }
}

function unavailableResourceIds(
  expectedAssetIds: ReadonlySet<string>,
  assets: Readonly<
    Record<
      string,
      { readonly state: string; readonly href?: string | undefined }
    >
  >,
  equations: Readonly<
    Record<
      string,
      { readonly state: string; readonly svg?: string | undefined }
    >
  >,
): string[] {
  const missingAssets = [...expectedAssetIds].filter((assetId) => {
    const resource = assets[assetId]
    return resource?.state !== 'ready' || !resource.href?.startsWith('data:')
  })
  const missingEquations = Object.entries(equations)
    .filter(([, resource]) => resource.state !== 'ready' || !resource.svg)
    .map(([resourceId]) => `equation:${resourceId}`)
  return [...missingAssets, ...missingEquations]
}

/**
 * Resolves every asynchronous resource and builds one self-contained full-map
 * SVG. The caller can reuse this exact SVG for PNG fallback.
 */
export async function prepareMindMapExport({
  assetRepository,
  document,
  equationRenderer,
  transformScene = (scene) => scene,
}: PrepareMindMapExportOptions): Promise<PreparedMindMapExport> {
  const referencedAssetIds = getReferencedMindMapAssetIds(document)
  let loadedAssets: Awaited<ReturnType<typeof loadRenderableMindMapAssets>>
  let equations: Awaited<ReturnType<typeof loadRenderableMindMapEquations>>

  try {
    ;[loadedAssets, equations] = await Promise.all([
      loadRenderableMindMapAssets(
        assetRepository,
        document.id,
        referencedAssetIds,
        'data-uri',
      ),
      loadRenderableMindMapEquations(document, equationRenderer),
    ])
  } catch (error) {
    throw new MindMapExportError(
      'resource-unavailable',
      'A referenced image or equation could not be prepared for export.',
      { cause: error },
    )
  }

  try {
    const unavailable = unavailableResourceIds(
      referencedAssetIds,
      loadedAssets.assets,
      equations,
    )
    if (unavailable.length > 0) {
      throw new MindMapExportError(
        'resource-unavailable',
        'A referenced image or equation is unavailable.',
        { resourceIds: unavailable },
      )
    }

    try {
      const measuredNodes = Object.fromEntries(
        Object.values(document.nodes).map((node) => [
          node.id,
          {
            ...node,
            style: getComputedMindMapNodeStyle(document, node.id),
          },
        ]),
      )
      const nodeSizes = Object.fromEntries(
        Object.values(measuredNodes).map((node) => [
          node.id,
          estimateMindMapNodeSize(
            node,
            defaultLayoutConfig,
            measureBrowserMindMapTopicText,
          ),
        ]),
      )
      const textMetricsByNodeId = Object.fromEntries(
        Object.values(measuredNodes).map((node) => [
          node.id,
          measureMindMapTopicText(
            node,
            nodeSizes[node.id]?.width ?? defaultLayoutConfig.nodeWidth,
            defaultLayoutConfig,
            measureBrowserMindMapTopicText,
          ),
        ]),
      )
      const layout = layoutMindMap(document, { nodeSizes })
      const scene = transformScene(
        createMindMapSvgScene(document, layout, {
          assets: loadedAssets.assets,
          backgroundColor: editorCanvasBackgroundColor,
          equations,
          textMetricsByNodeId,
        }),
      )
      assertFiniteSceneBounds(scene)
      return { scene, svg: serializeMindMapSvgScene(scene) }
    } catch (error) {
      if (error instanceof MindMapExportError) throw error
      if (error instanceof RangeError) {
        throw new MindMapExportError(
          'memory-exhausted',
          'The browser ran out of memory while preparing the export.',
          { cause: error },
        )
      }
      throw new MindMapExportError(
        'render-failed',
        'The complete mind-map scene could not be rendered.',
        { cause: error },
      )
    }
  } finally {
    loadedAssets.dispose()
  }
}
