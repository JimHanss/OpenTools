import { describe, expect, it, vi } from 'vitest'

import {
  MathJaxEquationRenderer,
  sanitizeMathJaxSvg,
} from './equation-renderer'

const safeSvg =
  '<svg width="12ex" height="3ex" role="img" focusable="false" viewBox="0 -1000 12000 3000"><defs><path id="MJX-A" d="M0 0" /></defs><use href="#MJX-A" /></svg>'

describe('MathJaxEquationRenderer', () => {
  it('loads lazily, caches by semantic request and normalizes safe SVG', async () => {
    const render = vi.fn(async () => safeSvg)
    const createEngine = vi.fn(async () => ({ render }))
    const renderer = new MathJaxEquationRenderer({ createEngine })
    const request = {
      source: String.raw`E = mc^2`,
      displayMode: 'block' as const,
      fontSize: 16,
    }

    expect(createEngine).not.toHaveBeenCalled()
    const [first, second] = await Promise.all([
      renderer.render(request),
      renderer.render(request),
    ])
    expect(first).toEqual(second)
    expect(createEngine).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(1)
    expect(first.state).toBe('ready')
    if (first.state === 'ready') {
      expect(first).toMatchObject({ width: 96, height: 24 })
      expect(first.svg).toContain('width="96" height="24"')
      expect(first.svg).not.toContain('style=')
      expect(first.svg.match(/\srole=/g)).toHaveLength(1)
      expect(first.svg).toMatch(/id="equation-[^-]+-MJX-A"/)
      expect(first.svg).toMatch(/href="#equation-[^-]+-MJX-A"/)
    }

    await renderer.render({ ...request, fontSize: 18 })
    await renderer.render({ ...request, source: String.raw`a^2+b^2=c^2` })
    expect(render).toHaveBeenCalledTimes(3)
  })

  it('returns stable safe errors for bad input, load failure and unsafe SVG', async () => {
    const renderer = new MathJaxEquationRenderer({
      createEngine: async () => ({
        render: async () => '<svg><script>alert(1)</script></svg>',
      }),
    })
    await expect(
      renderer.render({ source: ' ', displayMode: 'block', fontSize: 16 }),
    ).resolves.toMatchObject({ state: 'error', width: 160, height: 48 })
    await expect(
      renderer.render({ source: 'x', displayMode: 'block', fontSize: 16 }),
    ).resolves.toMatchObject({
      state: 'error',
      error: 'The equation could not be rendered.',
    })

    const failedLoad = new MathJaxEquationRenderer({
      createEngine: async () => {
        throw new Error('network details must not leak')
      },
    })
    await expect(
      failedLoad.render({ source: 'x', displayMode: 'block', fontSize: 16 }),
    ).resolves.toMatchObject({
      state: 'error',
      error: 'The equation could not be rendered.',
    })
  })

  it('bounds extreme dimensions and rejects external SVG references', () => {
    expect(
      sanitizeMathJaxSvg(
        '<svg width="1000ex" height="500ex" viewBox="0 0 1000 500"></svg>',
        16,
        'huge',
        { width: 400, height: 200 },
      ),
    ).toMatchObject({ width: 400, height: 200 })
    expect(() =>
      sanitizeMathJaxSvg(
        '<svg width="1ex" height="1ex"><use href="https://example.com/a" /></svg>',
        16,
        'external',
        { width: 400, height: 200 },
      ),
    ).toThrowError('unsafe SVG')
  })
})
