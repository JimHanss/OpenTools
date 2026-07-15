import { useTranslation } from 'react-i18next'

import { getCurrentLocale, setLocale, type SupportedLocale } from '../i18n'

const localeOptions: readonly {
  locale: SupportedLocale
  label: string
  titleKey: 'app.languageChinese' | 'app.languageEnglish'
}[] = [
  { locale: 'zh-CN', label: '中文', titleKey: 'app.languageChinese' },
  { locale: 'en', label: 'EN', titleKey: 'app.languageEnglish' },
]

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLocale = getCurrentLocale()

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t('app.languageSwitcher')}
    >
      {localeOptions.map(({ locale, label, titleKey }) => (
        <button
          key={locale}
          aria-pressed={currentLocale === locale}
          className={currentLocale === locale ? 'is-active' : undefined}
          title={t(titleKey)}
          type="button"
          onClick={() => {
            if (i18n.resolvedLanguage !== locale) void setLocale(locale)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
