import { useEffect, useMemo, useState } from 'react'

import type { MindMapDocument } from '@opentools/mindmap-core'
import {
  getMindMapEquationRenderKey,
  type EquationRenderer,
  type RenderableMindMapEquation,
} from '@opentools/mindmap-renderer-svg'

interface EquationRequirement {
  readonly id: string
  readonly nodeId: string
  readonly blockId: string
  readonly source: string
  readonly displayMode: 'block'
  readonly fontSize: number
  readonly fallbackWidth: number
  readonly fallbackHeight: number
}

function getEquationRequirements(
  document: MindMapDocument,
): EquationRequirement[] {
  return Object.values(document.nodes)
    .flatMap((node) =>
      node.contentBlocks.flatMap((block) =>
        block.type === 'equation'
          ? [
              {
                id: getMindMapEquationRenderKey(node.id, block.id),
                nodeId: node.id,
                blockId: block.id,
                source: block.source,
                displayMode: block.displayMode,
                fontSize: node.style.fontSize,
                fallbackWidth: block.width ?? 160,
                fallbackHeight: block.height ?? 48,
              },
            ]
          : [],
      ),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
}

export async function loadRenderableMindMapEquations(
  document: MindMapDocument,
  renderer: EquationRenderer,
): Promise<Readonly<Record<string, RenderableMindMapEquation>>> {
  const entries = await Promise.all(
    getEquationRequirements(document).map(async (requirement) => {
      const result = await renderer.render(requirement)
      const renderable: RenderableMindMapEquation = {
        id: requirement.id,
        nodeId: requirement.nodeId,
        blockId: requirement.blockId,
        state: result.state,
        width:
          result.state === 'ready' ? result.width : requirement.fallbackWidth,
        height:
          result.state === 'ready' ? result.height : requirement.fallbackHeight,
        ...(result.state === 'ready'
          ? { svg: result.svg }
          : { error: result.error }),
      }
      return [requirement.id, renderable] as const
    }),
  )
  return Object.fromEntries(entries)
}

export function useRenderableMindMapEquations(
  document: MindMapDocument,
  renderer: EquationRenderer,
): Readonly<Record<string, RenderableMindMapEquation>> {
  const requirements = useMemo(
    () => getEquationRequirements(document),
    [document],
  )
  const requirementsKey = JSON.stringify(requirements)
  const [equations, setEquations] = useState<
    Readonly<Record<string, RenderableMindMapEquation>>
  >({})

  useEffect(() => {
    let active = true
    setEquations(
      Object.fromEntries(
        requirements.map((requirement) => [
          requirement.id,
          {
            id: requirement.id,
            nodeId: requirement.nodeId,
            blockId: requirement.blockId,
            state: 'loading',
            width: requirement.fallbackWidth,
            height: requirement.fallbackHeight,
          } satisfies RenderableMindMapEquation,
        ]),
      ),
    )
    void loadRenderableMindMapEquations(document, renderer).then((loaded) => {
      if (active) setEquations(loaded)
    })
    return () => {
      active = false
    }
  }, [document, renderer, requirementsKey])

  return equations
}
