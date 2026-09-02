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
    throw new MindMapExportError(
      'invalid-bounds',
      'The SVG export has no usable dimensions.',
    )
  }
  return { width: Math.ceil(width), height: Math.ceil(height) }
}

export async function renderSvgAsPng(svg: string): Promise<Blob> {
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch (error) {
      throw new MindMapExportError(
        'render-failed',
        'The prepared SVG could not be decoded for PNG export.',
        { cause: error },
      )
    }
    const { width, height } = getSvgExportSize(svg)
    assertPngExportCapacity(width, height)
    const canvas = document.createElement('canvas')
    try {
      canvas.width = width
      canvas.height = height
    } catch (error) {
      throw new MindMapExportError(
        'memory-exhausted',
        'The browser could not allocate the PNG canvas.',
        { cause: error },
      )
    }
    const context = canvas.getContext('2d')
    if (!context)
      throw new MindMapExportError(
        'png-unavailable',
        'Canvas export is unavailable in this browser.',
      )
    context.drawImage(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(
                new MindMapExportError(
                  'png-encoding-failed',
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
import { assertPngExportCapacity, MindMapExportError } from './export-error'
