import { describe, expect, it } from 'vitest'

import { getTopicDropPlacement } from './drop-placement'

const bounds = { x: 100, y: 200, width: 200, height: 100 }

describe('layout-aware topic drop placement', () => {
  it('uses vertical zones for logic and balanced layouts', () => {
    expect(
      getTopicDropPlacement('logic-left', bounds, { x: 200, y: 210 }),
    ).toBe('before')
    expect(
      getTopicDropPlacement('mind-map-balanced', bounds, { x: 200, y: 250 }),
    ).toBe('child')
    expect(
      getTopicDropPlacement('logic-right', bounds, { x: 200, y: 295 }),
    ).toBe('after')
  })

  it('uses horizontal zones for tree and org layouts', () => {
    expect(getTopicDropPlacement('tree-top', bounds, { x: 110, y: 250 })).toBe(
      'before',
    )
    expect(getTopicDropPlacement('org-top', bounds, { x: 200, y: 210 })).toBe(
      'child',
    )
    expect(getTopicDropPlacement('tree-top', bounds, { x: 295, y: 250 })).toBe(
      'after',
    )
  })
})
