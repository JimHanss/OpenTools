import {
  createEquationRenderCacheKey,
  mindMapEquationRendererVersion,
  type EquationRenderer,
  type EquationRenderRequest,
  type EquationRenderResult,
} from '@opentools/mindmap-renderer-svg'

interface EquationSvgEngine {
  render(source: string, fontSize: number): Promise<string>
}

export interface MathJaxEquationRendererOptions {
  readonly createEngine?: () => Promise<EquationSvgEngine>
  readonly maximumSourceLength?: number
  readonly maximumWidth?: number
  readonly maximumHeight?: number
  readonly rendererVersion?: string
}

const defaultEquationWidth = 160
const defaultEquationHeight = 48
let sharedEnginePromise: Promise<EquationSvgEngine> | undefined

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function parseSvgLength(value: string | undefined, fontSize: number) {
  if (!value) return undefined
  const match = /^([0-9]+(?:\.[0-9]+)?)(ex|em|px)?$/.exec(value.trim())
  if (!match) return undefined
  const numeric = Number(match[1])
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  switch (match[2]) {
    case 'ex':
      return numeric * fontSize * 0.5
    case 'em':
      return numeric * fontSize
    default:
      return numeric
  }
}

function getAttribute(markup: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(
    markup,
  )?.[1]
}

function replaceReferencedIds(markup: string, prefix: string): string {
  const ids = new Map<string, string>()
  for (const match of markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    const id = match[1]
    if (id) ids.set(id, `${prefix}-${id}`)
  }
  let result = markup.replace(
    /\bid\s*=\s*(["'])([^"']+)\1/gi,
    (attribute, quote: string, id: string) =>
      ids.has(id) ? `id=${quote}${ids.get(id)}${quote}` : attribute,
  )
  result = result.replace(
    /\b(xlink:href|href)\s*=\s*(["'])#([^"']+)\2/gi,
    (attribute, name: string, quote: string, id: string) =>
      ids.has(id) ? `${name}=${quote}#${ids.get(id)}${quote}` : attribute,
  )
  return result.replace(/url\(#([^)]+)\)/gi, (attribute, id: string) =>
    ids.has(id) ? `url(#${ids.get(id)})` : attribute,
  )
}

export function sanitizeMathJaxSvg(
  sourceMarkup: string,
  fontSize: number,
  cacheKey: string,
  limits: { readonly width: number; readonly height: number },
): { readonly svg: string; readonly width: number; readonly height: number } {
  const markup = sourceMarkup.trim()
  if (!/^<svg(?:\s|>)/i.test(markup) || !/<\/svg>$/i.test(markup)) {
    throw new Error('MathJax did not return a complete SVG element.')
  }
  if (
    /<(?:script|foreignObject|iframe|object|embed|image|a)(?:\s|>)/i.test(
      markup,
    ) ||
    /\bon[a-z]+\s*=/i.test(markup) ||
    /\b(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(markup) ||
    /\burl\s*\(\s*["']?(?!#)/i.test(markup)
  ) {
    throw new Error('MathJax returned unsafe SVG markup.')
  }

  const viewBox = getAttribute(markup, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  let width = parseSvgLength(getAttribute(markup, 'width'), fontSize)
  let height = parseSvgLength(getAttribute(markup, 'height'), fontSize)
  if ((!width || !height) && viewBox?.length === 4) {
    width ||= Math.abs(viewBox[2] ?? 0) * (fontSize / 1000)
    height ||= Math.abs(viewBox[3] ?? 0) * (fontSize / 1000)
  }
  if (
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error('MathJax returned invalid SVG dimensions.')
  }
  const scale = Math.min(1, limits.width / width, limits.height / height)
  width = Math.max(16, Math.round(width * scale * 100) / 100)
  height = Math.max(16, Math.round(height * scale * 100) / 100)

  let safeMarkup = markup
    .replace(/\sstyle\s*=\s*(["'])[^"']*\1/gi, '')
    .replace(/\s(?:width|height)\s*=\s*(["'])[^"']*\1/gi, '')
    .replace(/\sfocusable\s*=\s*(["'])[^"']*\1/gi, '')
    .replace(/\srole\s*=\s*(["'])[^"']*\1/gi, '')
  safeMarkup = replaceReferencedIds(
    safeMarkup,
    `equation-${stableHash(cacheKey)}`,
  )
  safeMarkup = safeMarkup.replace(
    /^<svg\b/i,
    `<svg width="${width}" height="${height}" role="img" focusable="false"`,
  )
  if (!/\bxmlns=/.test(safeMarkup.slice(0, safeMarkup.indexOf('>')))) {
    safeMarkup = safeMarkup.replace(
      /^<svg\b/,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    )
  }
  return { svg: safeMarkup, width, height }
}

async function createMathJaxSvgEngine(): Promise<EquationSvgEngine> {
  const [
    { mathjax },
    { TeX },
    { SVG },
    { liteAdaptor },
    { RegisterHTMLHandler },
    { MathJaxNewcmFont },
  ] = await Promise.all([
    import('@mathjax/src/mjs/mathjax.js'),
    import('@mathjax/src/mjs/input/tex.js'),
    import('@mathjax/src/mjs/output/svg.js'),
    import('@mathjax/src/mjs/adaptors/liteAdaptor.js'),
    import('@mathjax/src/mjs/handlers/html.js'),
    import('@mathjax/mathjax-newcm-font/js/svg.js'),
    import('@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js'),
    import('@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js'),
  ])
  const adaptor = liteAdaptor()
  RegisterHTMLHandler(adaptor)
  const input = new TeX({
    packages: ['base', 'ams', 'newcommand'],
    formatError: (_jax: unknown, error: { readonly message?: string }) => {
      throw new Error(error.message ?? 'Invalid LaTeX')
    },
  })
  const output = new SVG({ fontCache: 'local', fontData: MathJaxNewcmFont })
  const mathDocument = mathjax.document('', {
    InputJax: input,
    OutputJax: output,
  })
  return {
    async render(source, fontSize) {
      const container = await mathjax.handleRetriesFor(() =>
        mathDocument.convert(source, {
          display: true,
          em: fontSize,
          ex: fontSize / 2,
          containerWidth: 1200,
        }),
      )
      const svg = adaptor.tags(container, 'svg')[0]
      if (!svg) throw new Error('MathJax returned no SVG output.')
      return adaptor.serializeXML(svg)
    },
  }
}

function getSharedMathJaxEngine(): Promise<EquationSvgEngine> {
  sharedEnginePromise ??= createMathJaxSvgEngine()
  return sharedEnginePromise
}

export class MathJaxEquationRenderer implements EquationRenderer {
  readonly #cache = new Map<string, Promise<EquationRenderResult>>()
  readonly #createEngine: () => Promise<EquationSvgEngine>
  readonly #maximumSourceLength: number
  readonly #maximumWidth: number
  readonly #maximumHeight: number
  readonly #rendererVersion: string

  constructor(options: MathJaxEquationRendererOptions = {}) {
    this.#createEngine = options.createEngine ?? getSharedMathJaxEngine
    this.#maximumSourceLength = options.maximumSourceLength ?? 10_000
    this.#maximumWidth = options.maximumWidth ?? 1600
    this.#maximumHeight = options.maximumHeight ?? 800
    this.#rendererVersion =
      options.rendererVersion ?? mindMapEquationRendererVersion
  }

  render(request: EquationRenderRequest): Promise<EquationRenderResult> {
    const cacheKey = createEquationRenderCacheKey(
      request,
      this.#rendererVersion,
    )
    const cached = this.#cache.get(cacheKey)
    if (cached) return cached

    const pending = this.#renderUncached(request, cacheKey)
    this.#cache.set(cacheKey, pending)
    return pending
  }

  clear(): void {
    this.#cache.clear()
  }

  async #renderUncached(
    request: EquationRenderRequest,
    cacheKey: string,
  ): Promise<EquationRenderResult> {
    const fontSize = request.fontSize
    if (
      request.displayMode !== 'block' ||
      request.source.trim().length === 0 ||
      request.source.length > this.#maximumSourceLength ||
      !Number.isFinite(fontSize) ||
      fontSize < 8 ||
      fontSize > 96
    ) {
      return {
        state: 'error',
        cacheKey,
        error:
          'The equation source or font size is outside the supported range.',
        width: defaultEquationWidth,
        height: defaultEquationHeight,
      }
    }
    try {
      const engine = await this.#createEngine()
      const markup = await engine.render(request.source, fontSize)
      return {
        state: 'ready',
        cacheKey,
        ...sanitizeMathJaxSvg(markup, fontSize, cacheKey, {
          width: this.#maximumWidth,
          height: this.#maximumHeight,
        }),
      }
    } catch {
      return {
        state: 'error',
        cacheKey,
        error: 'The equation could not be rendered.',
        width: defaultEquationWidth,
        height: defaultEquationHeight,
      }
    }
  }
}
