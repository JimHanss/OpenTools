import type {
  MindMapTopicTextMeasure,
  MindMapTopicTextMeasureStyle,
} from '@opentools/mindmap-layout'

const measurementCache = new Map<string, number>()
let measurementContext: CanvasRenderingContext2D | null = null

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (measurementContext) return measurementContext
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas text measurement is unavailable.')
  measurementContext = context
  return context
}

function toCanvasFont(style: MindMapTopicTextMeasureStyle): string {
  const weight = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  }[style.fontWeight]
  return `${style.fontStyle} ${weight} ${style.fontSize}px ${style.fontFamily}`
}

export const measureBrowserMindMapTopicText: MindMapTopicTextMeasure = (
  text,
  style,
) => {
  const font = toCanvasFont(style)
  const cacheKey = `${font}\u0000${text}`
  const cached = measurementCache.get(cacheKey)
  if (cached !== undefined) return cached

  const context = getMeasurementContext()
  if (!context) {
    return Array.from(text).reduce((width, character) => {
      const codePoint = character.codePointAt(0) ?? 0
      const isWide =
        (codePoint >= 0x2e80 && codePoint <= 0xfaff) ||
        (codePoint >= 0xff01 && codePoint <= 0xffe6) ||
        (codePoint >= 0x1f300 && codePoint <= 0x1faff)
      return width + style.fontSize * (isWide ? 1 : 0.54)
    }, 0)
  }
  context.font = font
  const width = context.measureText(text).width
  if (measurementCache.size >= 4096) measurementCache.clear()
  measurementCache.set(cacheKey, width)
  return width
}
