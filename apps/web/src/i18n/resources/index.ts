import { en } from './en'
import { zhCN } from './zh-CN'

export const defaultNamespace = 'translation'

export const resources = {
  en: { [defaultNamespace]: en },
  'zh-CN': { [defaultNamespace]: zhCN },
} as const

export { en, zhCN }
