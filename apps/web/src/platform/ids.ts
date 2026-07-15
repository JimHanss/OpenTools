export function createPlatformId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.()
  return value
    ? `${prefix}-${value}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
