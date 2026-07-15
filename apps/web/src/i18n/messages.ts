import type { TFunction } from 'i18next'

import type { en } from './resources'

type LeafPaths<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string
    ? Key
    : Value[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${LeafPaths<Value[Key]>}`
      : never
}[keyof Value & string]

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

type PluralBaseKey<Key extends string> =
  Key extends `${infer Base}_${PluralSuffix}` ? Base : never

type ResourceTranslationKey = LeafPaths<typeof en>

export type TranslationKey =
  ResourceTranslationKey | PluralBaseKey<ResourceTranslationKey>

export interface LocalizedMessage {
  readonly key: TranslationKey
  readonly values?: Readonly<Record<string, string | number>>
}

export function localizedMessage(
  key: TranslationKey,
  values?: Readonly<Record<string, string | number>>,
): LocalizedMessage {
  return values ? { key, values } : { key }
}

export function translateMessage(
  t: TFunction,
  message: LocalizedMessage,
): string {
  return t(message.key, message.values ?? {})
}
