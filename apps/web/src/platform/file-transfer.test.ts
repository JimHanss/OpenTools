import { describe, expect, it } from 'vitest'

import { createSafeDownloadFilename, getSvgExportSize } from './file-transfer'

describe('browser file transfer helpers', () => {
  it('creates bounded filesystem-safe export names', () => {
    expect(createSafeDownloadFilename(' Team: Plan / Q3 ', 'json')).toBe(
      'Team- Plan - Q3.json',
    )
    expect(createSafeDownloadFilename('   ', 'svg')).toBe('mind-map.svg')
  })

  it('uses the full SVG viewbox rather than browser image defaults for PNG', () => {
    expect(
      getSvgExportSize('<svg viewBox="-48 -48 1240.5 680.25"></svg>'),
    ).toEqual({ width: 1241, height: 681 })
  })
})
