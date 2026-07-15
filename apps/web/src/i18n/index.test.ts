import { describe, expect, it } from 'vitest'

import { resolveSupportedLocale } from './index'
import { en, zhCN } from './resources'

function collectLeafKeys(
  value: Readonly<Record<string, unknown>>,
  prefix = '',
): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === 'string'
      ? [path]
      : collectLeafKeys(child as Readonly<Record<string, unknown>>, path)
  })
}

describe('web internationalization', () => {
  it('prefers a supported stored locale, then normalizes browser languages', () => {
    expect(resolveSupportedLocale('en-US', ['zh-CN'])).toBe('en')
    expect(resolveSupportedLocale('zh-TW', ['en-US'])).toBe('zh-CN')
    expect(resolveSupportedLocale(null, ['fr-FR', 'zh-Hans-CN'])).toBe('zh-CN')
    expect(resolveSupportedLocale(null, ['fr-FR', 'en-GB'])).toBe('en')
    expect(resolveSupportedLocale(null, ['fr-FR'])).toBe('en')
  })

  it('keeps English and Simplified Chinese resource keys in sync', () => {
    expect(collectLeafKeys(zhCN).sort()).toEqual(collectLeafKeys(en).sort())
  })
})
