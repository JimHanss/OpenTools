import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { defaultNamespace, resources } from './resources'

export const supportedLocales = ['zh-CN', 'en'] as const
export type SupportedLocale = (typeof supportedLocales)[number]
export const languageStorageKey = 'opentools.locale'

function normalizeLocale(
  language: string | null | undefined,
): SupportedLocale | null {
  const normalized = language?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('en')) return 'en'
  return null
}

export function resolveSupportedLocale(
  storedLanguage: string | null,
  browserLanguages: readonly string[],
): SupportedLocale {
  const storedLocale = normalizeLocale(storedLanguage)
  if (storedLocale) return storedLocale

  for (const language of browserLanguages) {
    const locale = normalizeLocale(language)
    if (locale) return locale
  }

  return 'en'
}

function readStoredLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(languageStorageKey) ?? null
  } catch {
    return null
  }
}

function writeStoredLanguage(language: string): void {
  try {
    globalThis.localStorage?.setItem(languageStorageKey, language)
  } catch {
    // Language switching still works when storage is unavailable.
  }
}

function detectLocale(): SupportedLocale {
  const browserLanguages = globalThis.navigator?.languages ?? []
  return resolveSupportedLocale(readStoredLanguage(), browserLanguages)
}

const detector = new LanguageDetector()
detector.addDetector({
  name: 'opentoolsLanguage',
  lookup: detectLocale,
  cacheUserLanguage: writeStoredLanguage,
})

function syncDocumentMetadata(): void {
  if (typeof document === 'undefined') return
  const locale = getCurrentLocale()
  document.documentElement.lang = locale
  document.title = i18n.t('meta.title')
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', i18n.t('meta.description'))
}

export async function initializeI18n(): Promise<void> {
  if (!i18n.isInitialized) {
    await i18n
      .use(detector)
      .use(initReactI18next)
      .init({
        defaultNS: defaultNamespace,
        detection: {
          order: ['opentoolsLanguage'],
          caches: ['opentoolsLanguage'],
        },
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        resources,
        returnNull: false,
        supportedLngs: [...supportedLocales],
      })
    i18n.on('languageChanged', syncDocumentMetadata)
  }
  syncDocumentMetadata()
}

export function getCurrentLocale(): SupportedLocale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? 'en'
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  writeStoredLanguage(locale)
  await i18n.changeLanguage(locale)
}

export function toIntlLocale(locale = getCurrentLocale()): string {
  return locale === 'zh-CN' ? 'zh-CN' : 'en'
}

export default i18n
