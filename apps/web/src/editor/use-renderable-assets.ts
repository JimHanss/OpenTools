import { useEffect, useMemo, useState } from 'react'

import {
  getReferencedMindMapAssetIds,
  type MindMapDocument,
} from '@opentools/mindmap-core'
import type { RenderableMindMapAsset } from '@opentools/mindmap-renderer-svg'
import type { MindMapAssetRepository } from '@opentools/mindmap-storage'

import { loadRenderableMindMapAssets } from '../platform/asset-transfer'

export function useRenderableMindMapAssets(
  document: MindMapDocument,
  repository: MindMapAssetRepository,
): Readonly<Record<string, RenderableMindMapAsset>> {
  const assetIds = useMemo(
    () => [...getReferencedMindMapAssetIds(document)].sort(),
    [document],
  )
  const assetKey = assetIds.join('|')
  const [assets, setAssets] = useState<
    Readonly<Record<string, RenderableMindMapAsset>>
  >({})

  useEffect(() => {
    let active = true
    let dispose: () => void = () => undefined
    setAssets(
      Object.fromEntries(
        assetIds.map((id) => [id, { id, state: 'loading' } as const]),
      ),
    )
    void loadRenderableMindMapAssets(
      repository,
      document.id,
      assetIds,
      'object-url',
    ).then((loaded) => {
      if (!active) {
        loaded.dispose()
        return
      }
      dispose = loaded.dispose
      setAssets(loaded.assets)
    })
    return () => {
      active = false
      // Passive-effect cleanup can run while the previous image element is
      // still completing its final load. Revoke after React commits the next
      // asset state to avoid a transient ERR_FILE_NOT_FOUND in the browser.
      window.setTimeout(dispose, 0)
    }
  }, [assetKey, document.id, repository])

  return assets
}
