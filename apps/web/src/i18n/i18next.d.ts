import 'i18next'

import type { en } from './resources'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    parseInterpolation: false
    returnNull: false
    resources: {
      translation: typeof en
    }
  }
}
