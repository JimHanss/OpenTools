export function createSafeDownloadFilename(
  title: string,
  extension: 'json' | 'png' | 'svg',
): string {
  const safeCharacters = Array.from(title.trim())
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character
    })
    .join('')
  const base = safeCharacters.replace(/\s+/g, ' ').slice(0, 80)
  return `${base || 'mind-map'}.${extension}`
}

export function downloadBrowserFile(
  content: BlobPart,
  type: string,
  filename: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function readBrowserFileAsText(file: File): Promise<string> {
  return file.text()
}

export function getSvgExportSize(svg: string): {
  readonly width: number
  readonly height: number
} {
  const match = svg.match(
    /\bviewBox="[^"\d-]*[-.\d]+\s+[-.\d]+\s+([-.\d]+)\s+([-.\d]+)"/i,
  )
  const width = Number(match?.[1])
  const height = Number(match?.[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('The SVG export has no usable dimensions.')
  }
  return { width: Math.ceil(width), height: Math.ceil(height) }
}

export async function renderSvgAsPng(svg: string): Promise<Blob> {
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const { width, height } = getSvgExportSize(svg)
    if (width <= 0 || height <= 0 || width * height > 16_000_000) {
      throw new Error(
        'The map is too large to export safely as PNG. Export SVG instead.',
      )
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas export is unavailable in this browser.')
    context.drawImage(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(
                new Error(
                  'PNG export could not be completed. Export SVG instead.',
                ),
              ),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
