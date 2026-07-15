import { describe, expect, it } from 'vitest'

import { isSafeExternalLink } from './external-link'

describe('safe external links', () => {
  it('allows only explicit web and email protocols', () => {
    expect(isSafeExternalLink('https://opentools.example/map')).toBe(true)
    expect(isSafeExternalLink('mailto:hello@example.com')).toBe(true)
    expect(isSafeExternalLink('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalLink('data:text/html,unsafe')).toBe(false)
    expect(isSafeExternalLink('not a URL')).toBe(false)
  })
})
