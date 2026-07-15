const safeProtocols = new Set(['http:', 'https:', 'mailto:'])

export function isSafeExternalLink(value: string): boolean {
  try {
    const url = new URL(value)
    return safeProtocols.has(url.protocol)
  } catch {
    return false
  }
}

export function openSafeExternalLink(value: string): boolean {
  if (!isSafeExternalLink(value)) return false
  const popup = window.open(value, '_blank', 'noopener,noreferrer')
  if (popup) popup.opener = null
  return Boolean(popup)
}
