import { expect, test, type Download, type Page } from '@playwright/test'

const languageStorageKey = 'opentools.locale'
const databaseName = 'opentools-mindmaps'

const legacyV2Fixture = {
  schemaVersion: 2,
  id: 'e2e-legacy-v2-map',
  title: 'E2E legacy V2 map',
  rootNodeId: 'root',
  nodes: {
    root: {
      id: 'root',
      parentId: null,
      childIds: ['child'],
      text: 'E2E legacy V2 map',
      collapsed: false,
      markers: [{ kind: 'priority', value: '1' }],
      notes: 'Migrated root note',
      links: [],
      style: {
        backgroundColor: '#ffffff',
        borderColor: '#7c6ff2',
        textColor: '#1e1b4b',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        shape: 'pill',
      },
    },
    child: {
      id: 'child',
      parentId: 'root',
      childIds: [],
      text: 'Migrated child',
      collapsed: false,
      markers: [{ kind: 'icon', value: 'star' }],
      notes: '',
      links: [{ label: 'Reference', url: 'https://example.test' }],
      style: {
        backgroundColor: '#eefbf6',
        borderColor: '#20a779',
        textColor: '#0d5f46',
      },
    },
  },
  relationships: [
    {
      id: 'legacy-relationship',
      fromNodeId: 'root',
      toNodeId: 'child',
      label: 'supports',
    },
  ],
  boundaries: [
    { id: 'legacy-boundary', nodeIds: ['root', 'child'], label: 'Scope' },
  ],
  summaries: [
    { id: 'legacy-summary', nodeIds: ['root', 'child'], label: 'Summary' },
  ],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
} as const

const largeLegacyV2Fixture = (() => {
  const childIds = Array.from({ length: 24 }, (_, index) => `child-${index}`)
  return {
    ...legacyV2Fixture,
    id: 'e2e-large-v2-map',
    title: 'E2E large map',
    nodes: {
      root: {
        ...legacyV2Fixture.nodes.root,
        childIds,
        text: 'E2E large map',
      },
      ...Object.fromEntries(
        childIds.map((id, index) => [
          id,
          {
            ...legacyV2Fixture.nodes.child,
            id,
            parentId: 'root',
            text: `Large topic ${index + 1}`,
            links: [],
            markers: [],
          },
        ]),
      ),
    },
    relationships: [],
    boundaries: [],
    summaries: [],
  }
})()

async function openStarterMap(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /My first mind map Updated/ }).click()
  await expect(
    page.getByRole('region', { name: 'Mind map editor' }),
  ).toBeVisible()
}

async function importJson(page: Page, value: unknown): Promise<void> {
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click()
  await page.getByLabel('JSON file to import').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  })
}

async function readDownloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function hasLoadedResource(
  page: Page,
  fragment: string,
): Promise<boolean> {
  return page.evaluate(
    (resourceFragment) =>
      performance
        .getEntriesByType('resource')
        .some(({ name }) => name.includes(resourceFragment)),
    fragment,
  )
}

async function runToolbarAction(
  page: Page,
  actionId: string,
  preferredMenu: 'Topic' | 'Insert' | 'Structure' | 'Style' | 'More',
): Promise<void> {
  const toolbar = page.getByRole('toolbar', {
    name: 'Basic mind map editing toolbar',
  })
  const action = toolbar.locator(`[data-action-id="${actionId}"]`)
  if (await action.isVisible()) {
    await action.click()
    return
  }

  const preferredTrigger = toolbar.getByRole('button', {
    name: preferredMenu,
    exact: true,
  })
  if (await preferredTrigger.isVisible()) await preferredTrigger.click()
  else await toolbar.getByRole('button', { name: 'More', exact: true }).click()
  await expect(action).toBeVisible()
  await action.click()
}

test.describe('web mind-map MVP', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, 'en')
    }, languageStorageKey)
    // Every Playwright test receives a new browser context. Assert the named
    // database starts absent so fixtures cannot leak between scenarios.
    await page.addInitScript((name) => {
      if (window.sessionStorage.getItem('opentools.e2e-db-reset')) return
      window.sessionStorage.setItem('opentools.e2e-db-reset', 'true')
      void indexedDB.deleteDatabase(name)
    }, databaseName)
  })

  test('supports keyboard editing, history, collapse/search, persistence and complete exports', async ({
    page,
  }) => {
    await openStarterMap(page)

    await page.keyboard.press('Enter')
    await page.getByRole('textbox', { name: 'Edit topic text' }).fill('Plan')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: Plan' }),
    ).toBeVisible()

    await page.locator('[data-action-id="history.undo"]').click()
    await expect(
      page.getByRole('button', { name: 'Topic: New topic' }),
    ).toBeVisible()
    await page.locator('[data-action-id="history.redo"]').click()
    await expect(
      page.getByRole('button', { name: 'Topic: Plan' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Topic: My first mind map' }).click()
    await page.getByRole('button', { name: 'Collapse branch' }).click()
    await expect(page.getByRole('button', { name: 'Topic: Plan' })).toHaveCount(
      0,
    )
    await page.getByRole('button', { name: 'Expand branch' }).click()

    await page.getByRole('textbox', { name: 'Search topics' }).fill('PLAN')
    await expect(page.getByRole('search')).toContainText('1/1')

    const jsonDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    await expect(jsonDownload).resolves.toBeTruthy()
    const svgDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export SVG' }).click()
    await expect(svgDownload).resolves.toBeTruthy()

    await page.waitForTimeout(350)
    await page.reload()
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
    await expect(
      page.getByRole('button', { name: 'Topic: Plan' }),
    ).toBeVisible()
  })

  test('migrates V2 and round-trips structures, floating topics, semantics, callout and style', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await openStarterMap(page)
    await importJson(page, legacyV2Fixture)

    await expect(page.getByLabel('Mind map title')).toHaveValue(
      'E2E legacy V2 map',
    )
    await expect(
      page.getByRole('button', { name: 'Topic: Migrated child' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Relationship: supports' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Boundary: Scope' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Summary: Summary' }),
    ).toBeVisible()

    for (const actionId of [
      'structure.logic-right',
      'structure.logic-left',
      'structure.mind-map-balanced',
      'structure.tree-top',
      'structure.org-top',
    ]) {
      await runToolbarAction(page, actionId, 'Structure')
    }

    await runToolbarAction(page, 'insert.floating-topic', 'Insert')
    const floatingEditor = page.getByRole('textbox', {
      name: 'Edit topic text',
    })
    await floatingEditor.fill('Floating V2 topic')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: Floating V2 topic' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Topic: Migrated child' }).click()
    await page.getByLabel('Label name').first().fill('Roadmap')
    await page.getByRole('button', { name: 'Add label' }).click()
    await page
      .locator('.label-catalog-list input[type="checkbox"]')
      .first()
      .check()
    await page
      .locator('.semantic-inspector select')
      .selectOption('decimal-hierarchical')
    await runToolbarAction(page, 'insert.callout', 'Insert')
    await expect(
      page.getByRole('button', { name: 'Callout: Additional note' }),
    ).toBeVisible()
    await runToolbarAction(page, 'topic.convert-to-floating', 'Topic')
    await runToolbarAction(page, 'style.theme-forest', 'Style')

    const jsonDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
    const exported = JSON.parse(
      await readDownloadText(await jsonDownloadPromise),
    ) as {
      schemaVersion: number
      defaultStructure: string
      floatingTopics: Record<string, unknown>
      labels: Record<string, { name: string }>
      nodes: Record<string, { numbering?: unknown }>
      callouts: unknown[]
      theme: { id: string }
    }
    expect(exported.schemaVersion).toBe(3)
    expect(exported.defaultStructure).toBe('org-top')
    expect(Object.keys(exported.floatingTopics)).toHaveLength(2)
    expect(Object.values(exported.labels).map((label) => label.name)).toContain(
      'Roadmap',
    )
    expect(
      Object.values(exported.nodes).some(
        (node) => node.numbering !== undefined,
      ),
    ).toBe(true)
    expect(exported.callouts).toHaveLength(1)
    expect(exported.theme.id).toBe('forest')

    const svgDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
    const svg = await readDownloadText(await svgDownloadPromise)
    expect(svg).toContain('supports')
    expect(svg).toContain('Scope')
    expect(svg).toContain('Summary')
    expect(svg).toContain('Floating V2 topi')
    expect(svg).toMatch(/viewBox="[-.\d ]+"/)

    await page.waitForTimeout(400)
    await page.reload()
    await page
      .getByRole('button', { name: /E2E legacy V2 map Updated/ })
      .click()
    await expect(
      page.getByRole('button', { name: 'Topic: Floating V2 topic' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Callout: Additional note' }),
    ).toBeVisible()
  })

  test('round-trips an image and MathJax equation through JSON, SVG and PNG', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openStarterMap(page)
    const png = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 2
        canvas.height = 2
        const context = canvas.getContext('2d')!
        context.fillStyle = '#7c3aed'
        context.fillRect(0, 0, 2, 2)
        return canvas.toDataURL('image/png').split(',')[1]!
      }),
      'base64',
    )

    await page.getByLabel('Image file').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: png,
    })
    const altText = page.getByLabel('Alternative text')
    await expect(altText).toBeVisible()
    await altText.fill('E2E pixel')
    await altText.press('Tab')
    const width = page.getByLabel(/^Display width/)
    await width.fill('196')
    await width.press('Tab')
    await expect(page.getByAltText('E2E pixel')).toBeVisible()

    await page.getByRole('button', { name: 'Add equation' }).click()
    const source = page.getByLabel('LaTeX source')
    await source.fill(String.raw`\frac{a+b}{2}`)
    const saveEquation = page.getByRole('button', { name: 'Save equation' })
    await expect(saveEquation).toBeEnabled({ timeout: 30_000 })
    await saveEquation.click()
    await expect(
      page
        .getByRole('region', { name: 'Equations' })
        .getByRole('img', { name: String.raw`\frac{a+b}{2}` }),
    ).toBeVisible({ timeout: 30_000 })

    const jsonDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
    const bundle = JSON.parse(
      await readDownloadText(await jsonDownloadPromise),
    ) as {
      kind: string
      document: {
        nodes: Record<string, { contentBlocks: Array<{ type: string }> }>
      }
      assets: Array<{ data: string; mimeType: string }>
    }
    expect(bundle.kind).toBe('opentools-mindmap-bundle')
    expect(bundle.assets).toHaveLength(1)
    expect(bundle.assets[0]).toMatchObject({ mimeType: 'image/png' })
    expect(bundle.assets[0]?.data.length).toBeGreaterThan(20)
    expect(
      Object.values(bundle.document.nodes).flatMap((node) =>
        node.contentBlocks.map((block) => block.type),
      ),
    ).toEqual(['image', 'equation'])

    const svgDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
    const svg = await readDownloadText(await svgDownloadPromise)
    expect(svg).toContain('data:image/png;base64,')
    expect(svg).toContain('E2E pixel')
    expect(svg).toContain('data-equation-id=')

    const pngDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click()
    const pngDownload = await pngDownloadPromise
    expect(pngDownload.suggestedFilename()).toMatch(/\.(png|svg)$/)
    if (pngDownload.suggestedFilename().endsWith('.svg')) {
      await expect(page.locator('.export-notice')).toContainText(
        'An editable SVG was downloaded instead',
      )
    }

    await page.waitForTimeout(400)
    await page.reload()
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
    await expect(page.getByAltText('E2E pixel')).toBeVisible()
    await expect(
      page
        .getByRole('region', { name: 'Equations' })
        .getByRole('img', { name: String.raw`\frac{a+b}{2}` }),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('supports keyboard-only toolbar, disabled reasons, overflow focus restore and IME guard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 680, height: 860 })
    await openStarterMap(page)
    const toolbar = page.getByRole('toolbar', {
      name: 'Basic mind map editing toolbar',
    })

    const undo = toolbar.locator('[data-action-id="history.undo"]')
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await undo.click({ force: true })
    await expect(toolbar.getByRole('status')).toHaveText(
      'There is nothing to undo.',
    )

    const deleteAction = toolbar.locator('[data-action-id="topic.delete"]')
    await expect(deleteAction).toHaveAttribute('aria-disabled', 'true')
    await deleteAction.click({ force: true })
    await expect(toolbar.getByRole('status')).toHaveText(
      'This operation is not available for the root topic.',
    )

    const more = toolbar.getByRole('button', { name: 'More', exact: true })
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(toolbar.getByRole('menu', { name: 'More' })).toBeVisible()
    await expect(toolbar.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(toolbar.getByRole('menuitem').last()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()

    await page.getByRole('button', { name: 'Topic: My first mind map' }).click()
    await page.keyboard.press('F2')
    const editor = page.getByRole('textbox', { name: 'Edit topic text' })
    await editor.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: '中' }),
      )
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          isComposing: true,
          key: 'Enter',
        }),
      )
    })
    await expect(editor).toBeVisible()
    await editor.fill('中文输入测试')
    await editor.evaluate((element) => {
      element.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '试' }),
      )
    })
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: 中文输入测试' }),
    ).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(editor).toHaveValue('New topic')
    await editor.fill('Keyboard child')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: Keyboard child' }),
    ).toBeVisible()

    await page.setViewportSize({ width: 520, height: 860 })
    await expect(more).toBeVisible()
    await expect(
      toolbar.getByRole('button', { name: 'Structure', exact: true }),
    ).toHaveCount(0)
  })

  test('dismisses each local popover outside and swaps toolbar menus naturally', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStarterMap(page)
    const toolbar = page.getByRole('toolbar', {
      name: 'Basic mind map editing toolbar',
    })

    await toolbar.getByRole('button', { name: 'Topic', exact: true }).click()
    const topicMenu = toolbar.getByRole('menu', { name: 'Topic' })
    await expect(topicMenu).toBeVisible()

    await toolbar.getByRole('button', { name: 'Insert', exact: true }).click()
    await expect(topicMenu).toHaveCount(0)
    const insertMenu = toolbar.getByRole('menu', { name: 'Insert' })
    await expect(insertMenu).toBeVisible()
    await insertMenu.click({ position: { x: 4, y: 4 } })
    await expect(insertMenu).toBeVisible()

    await page.locator('.editor-secondary-bar > p').click()
    await expect(insertMenu).toHaveCount(0)

    const filter = page.locator('.filter-panel')
    await filter.locator('summary').click()
    await expect(filter).toHaveAttribute('open', '')
    await toolbar.getByRole('button', { name: 'Style', exact: true }).click()
    await expect(filter).not.toHaveAttribute('open', '')
    const styleMenu = toolbar.getByRole('menu', { name: 'Style' })
    await expect(styleMenu).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(styleMenu).toHaveCount(0)
  })

  test('loads the editor, equation dialog and export pipeline only when requested', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: /My first mind map Updated/ }),
    ).toBeVisible()
    expect(await hasLoadedResource(page, '/components/editor-shell.tsx')).toBe(
      false,
    )
    expect(
      await hasLoadedResource(page, '/components/equation-editor-dialog.tsx'),
    ).toBe(false)
    expect(await hasLoadedResource(page, '/editor/export-pipeline.ts')).toBe(
      false,
    )

    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
    await expect(
      page.getByRole('region', { name: 'Mind map editor' }),
    ).toBeVisible()
    expect(await hasLoadedResource(page, '/components/editor-shell.tsx')).toBe(
      true,
    )
    expect(
      await hasLoadedResource(page, '/components/equation-editor-dialog.tsx'),
    ).toBe(false)

    await page.getByRole('button', { name: 'Add equation' }).click()
    await expect(page.getByLabel('LaTeX source')).toBeVisible()
    expect(
      await hasLoadedResource(page, '/components/equation-editor-dialog.tsx'),
    ).toBe(true)
    await page.getByRole('button', { name: 'Cancel' }).click()

    expect(await hasLoadedResource(page, '/editor/export-pipeline.ts')).toBe(
      false,
    )
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
    await downloadPromise
    expect(await hasLoadedResource(page, '/editor/export-pipeline.ts')).toBe(
      true,
    )
  })

  test('recovers from denied clipboard, storage quota and corrupt import without losing the map', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: () =>
            Promise.reject(
              new DOMException('Denied by E2E', 'NotAllowedError'),
            ),
          writeText: () =>
            Promise.reject(
              new DOMException('Denied by E2E', 'NotAllowedError'),
            ),
        },
      })
    })
    await openStarterMap(page)
    const title = await page.getByLabel('Mind map title').inputValue()

    await page.getByRole('button', { name: 'Topic: My first mind map' }).click()
    await page.keyboard.press('Control+C')
    await expect(page.locator('.canvas-notice')).toContainText(
      'Topics are still available inside OpenTools',
    )
    await page.keyboard.press('Control+V')
    await expect(
      page.getByRole('button', { name: 'Topic: My first mind map' }),
    ).toHaveCount(2)

    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put
      Reflect.set(window, '__opentoolsE2eOriginalIdbPut', original)
      Object.defineProperty(IDBObjectStore.prototype, 'put', {
        configurable: true,
        value: function quotaLimitedPut(
          this: IDBObjectStore,
          value: unknown,
          key?: IDBValidKey,
        ) {
          if (this.name === 'assets') {
            throw new DOMException(
              'Simulated browser storage quota',
              'QuotaExceededError',
            )
          }
          return Reflect.apply(
            original,
            this,
            key === undefined ? [value] : [value, key],
          )
        },
      })
    })
    const png = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 16
        canvas.height = 16
        canvas.getContext('2d')!.fillRect(0, 0, 16, 16)
        return canvas.toDataURL('image/png').split(',')[1]!
      }),
      'base64',
    )
    await page.getByLabel('Image file').setInputFiles({
      name: 'quota.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await expect(page.getByRole('alert')).toContainText(
      'does not have enough storage space',
    )
    await expect(page.getByLabel('Mind map title')).toHaveValue(title)
    await expect(page.getByLabel('Alternative text')).toHaveCount(0)
    await page.evaluate(() => {
      const original = Reflect.get(window, '__opentoolsE2eOriginalIdbPut')
      Object.defineProperty(IDBObjectStore.prototype, 'put', {
        configurable: true,
        value: original,
      })
    })

    await page.getByRole('button', { name: 'Import JSON', exact: true }).click()
    await page.getByLabel('JSON file to import').setInputFiles({
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not valid json'),
    })
    await expect(
      page.getByRole('alert').filter({ hasText: 'not valid JSON' }),
    ).toBeVisible()
    await expect(page.getByLabel('Mind map title')).toHaveValue(title)
  })

  test('rejects invalid JSON without overwriting the open map', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
    const titleInput = page.getByRole('textbox', { name: 'Mind map title' })
    await expect(titleInput).toHaveValue('My first mind map')
    const before = await titleInput.inputValue()

    await page.getByRole('button', { name: 'Import JSON' }).click()
    await page.setInputFiles('input[type="file"]', {
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not valid json'),
    })

    await expect(page.getByRole('alert')).toContainText('not valid JSON')
    await expect(
      page.getByRole('textbox', { name: 'Mind map title' }),
    ).toHaveValue(before)
  })

  test('does not move a topic into itself or one of its descendants', async ({
    page,
  }) => {
    await openStarterMap(page)
    await page.keyboard.press('Enter')
    await page.getByRole('textbox', { name: 'Edit topic text' }).fill('Parent')
    await page.keyboard.press('Control+Enter')
    await page.keyboard.press('Tab')
    await page.getByRole('textbox', { name: 'Edit topic text' }).fill('Child')
    await page.keyboard.press('Control+Enter')

    const parent = page.getByRole('button', { name: 'Topic: Parent' })
    const child = page.getByRole('button', { name: 'Topic: Child' })
    await child.dragTo(parent)
    await expect(child).toBeVisible()
    await expect(parent).toBeVisible()
  })

  test('fills the desktop viewport and stacks the inspector without horizontal overflow', async ({
    page,
  }) => {
    await openStarterMap(page)

    const viewports = [
      { width: 2048, height: 986 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 1280, height: 600 },
      { width: 960, height: 800 },
      { width: 900, height: 800 },
      { width: 800, height: 800 },
      { width: 721, height: 800 },
      { width: 720, height: 800 },
      { width: 390, height: 844 },
    ]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.waitForTimeout(50)
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const bounds = document
            .querySelector(selector)
            ?.getBoundingClientRect()
          if (!bounds) throw new Error(`Missing ${selector}`)
          return {
            bottom: bounds.bottom,
            height: bounds.height,
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
          }
        }
        return {
          bodyScrollHeight: document.body.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          canvas: rect('.mind-map-canvas'),
          content: rect('.editor-content'),
          documentScrollHeight: document.documentElement.scrollHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
          inspector: rect('.topic-inspector'),
          workspace: rect('.editor-workspace'),
        }
      })

      expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(
        geometry.innerWidth + 1,
      )
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
        geometry.innerWidth + 1,
      )
      if (viewport.width > 960) {
        expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(
          geometry.innerHeight + 1,
        )
        expect(geometry.documentScrollHeight).toBeLessThanOrEqual(
          geometry.innerHeight + 1,
        )
        expect(
          Math.abs(geometry.workspace.bottom - geometry.innerHeight),
        ).toBeLessThan(1)
        expect(
          Math.abs(geometry.content.bottom - (geometry.innerHeight - 24)),
        ).toBeLessThan(1)
        expect(geometry.canvas.bottom).toBeLessThanOrEqual(
          geometry.innerHeight + 1,
        )
        expect(geometry.canvas.height).toBeGreaterThan(250)
        expect(
          Math.abs(geometry.inspector.top - geometry.canvas.top),
        ).toBeLessThan(1)
        expect(
          Math.abs(geometry.inspector.height - geometry.canvas.height),
        ).toBeLessThan(1)
      } else {
        expect(geometry.canvas.height).toBeGreaterThanOrEqual(520)
        expect(geometry.inspector.top).toBeGreaterThanOrEqual(
          geometry.canvas.bottom,
        )
      }
    }

    await page.setViewportSize({ width: 900, height: 800 })
    await expect(page.locator('.header-file-actions')).toBeHidden()
    const toolbar = page.getByRole('toolbar', {
      name: 'Basic mind map editing toolbar',
    })
    await toolbar.getByRole('button', { name: 'More', exact: true }).click()
    const moreMenu = toolbar.getByRole('menu', { name: 'More' })
    for (const label of [
      'Import JSON',
      'Export JSON',
      'Export SVG',
      'Export PNG',
    ]) {
      await expect(
        moreMenu.getByRole('menuitem', { name: label, exact: true }),
      ).toBeVisible()
    }
  })

  test('starts maps centered at 100% and fits large maps without enlarging small ones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2048, height: 986 })
    await openStarterMap(page)
    const toolbar = page.getByRole('toolbar', {
      name: 'Basic mind map editing toolbar',
    })
    const zoomValue = toolbar.locator('.toolbar-zoom-value')
    const rootTopic = page.getByRole('button', {
      name: 'Topic: My first mind map',
    })

    await expect(zoomValue).toHaveText('100%')
    await expect
      .poll(async () => {
        const canvas = await page.locator('.mind-map-scroll').boundingBox()
        const root = await rootTopic.boundingBox()
        if (!canvas || !root) return Number.POSITIVE_INFINITY
        return Math.hypot(
          root.x + root.width / 2 - (canvas.x + canvas.width / 2),
          root.y + root.height / 2 - (canvas.y + canvas.height / 2),
        )
      })
      .toBeLessThan(2)

    await toolbar.locator('[data-action-id="view.fit"]').click()
    await expect(zoomValue).toHaveText('100%')
    await toolbar.locator('[data-action-id="view.zoom-in"]').click()
    await expect(zoomValue).toHaveText('110%')
    await page.keyboard.press('Enter')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('No recenter')
    await page.keyboard.press('Control+Enter')
    await expect(zoomValue).toHaveText('110%')

    await importJson(page, largeLegacyV2Fixture)
    await expect(page.getByLabel('Mind map title')).toHaveValue('E2E large map')
    await expect(zoomValue).toHaveText('100%')
    await expect
      .poll(async () => {
        const canvas = await page.locator('.mind-map-scroll').boundingBox()
        const root = await page
          .getByRole('button', { name: 'Topic: E2E large map' })
          .boundingBox()
        if (!canvas || !root) return Number.POSITIVE_INFINITY
        return Math.hypot(
          root.x + root.width / 2 - (canvas.x + canvas.width / 2),
          root.y + root.height / 2 - (canvas.y + canvas.height / 2),
        )
      })
      .toBeLessThan(2)

    await toolbar.locator('[data-action-id="view.fit"]').click()
    await expect
      .poll(async () =>
        Number.parseInt((await zoomValue.textContent()) ?? '100'),
      )
      .toBeLessThan(100)
    const canvas = await page.locator('.mind-map-scroll').boundingBox()
    const stage = await page.locator('.mind-map-stage').boundingBox()
    expect(canvas).not.toBeNull()
    expect(stage).not.toBeNull()
    expect(stage!.x).toBeGreaterThanOrEqual(canvas!.x)
    expect(stage!.x + stage!.width).toBeLessThanOrEqual(
      canvas!.x + canvas!.width + 1,
    )
    expect(stage!.y).toBeGreaterThanOrEqual(canvas!.y)
    expect(stage!.y + stage!.height).toBeLessThanOrEqual(
      canvas!.y + canvas!.height + 1,
    )
  })

  test('drags topics without selecting rendered text and keeps editor text selectable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStarterMap(page)
    await page.keyboard.press('Enter')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('Drag source')
    await page.keyboard.press('Control+Enter')
    await page.keyboard.press('Enter')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('Drop target')
    await page.keyboard.press('Control+Enter')

    const source = page.getByRole('button', { name: 'Topic: Drag source' })
    const target = page.getByRole('button', { name: 'Topic: Drop target' })
    const contentBeforeDrag = await page
      .locator('.editor-content')
      .boundingBox()
    expect(contentBeforeDrag).not.toBeNull()
    const sourceText = source.locator('text').filter({ hasText: 'Drag source' })
    const sourceTextBox = await sourceText.boundingBox()
    const targetBox = await target.boundingBox()
    expect(sourceTextBox).not.toBeNull()
    expect(targetBox).not.toBeNull()
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.mouse.move(
      sourceTextBox!.x + sourceTextBox!.width / 2,
      sourceTextBox!.y + sourceTextBox!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height - 2,
      { steps: 12 },
    )
    await expect(page.locator('[data-topic-drag-ghost="true"]')).toBeVisible()
    await expect(source).toHaveCSS('opacity', '0.58')
    await page.mouse.up()
    await expect(page.locator('[data-topic-drag-ghost="true"]')).toHaveCount(0)

    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
      .toBe('')
    await expect
      .poll(async () => {
        const movedSource = await source.boundingBox()
        const currentTarget = await target.boundingBox()
        return Boolean(
          movedSource && currentTarget && movedSource.y > currentTarget.y,
        )
      })
      .toBe(true)

    const contentAfterDrag = await page.locator('.editor-content').boundingBox()
    expect(contentAfterDrag).not.toBeNull()
    expect(
      Math.abs(contentAfterDrag!.height - contentBeforeDrag!.height),
    ).toBeLessThan(1)
    expect(Math.abs(contentAfterDrag!.y - contentBeforeDrag!.y)).toBeLessThan(1)
    expect(
      Math.abs(contentAfterDrag!.y + contentAfterDrag!.height - (900 - 24)),
    ).toBeLessThan(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)

    const sourceBeforeEditing = await source.boundingBox()
    const sourceFill = await source.locator('rect').first().getAttribute('fill')
    await source.dblclick()
    const editor = page.getByRole('textbox', { name: 'Edit topic text' })
    await expect(editor).toBeVisible()
    await expect
      .poll(() =>
        editor.evaluate((element) => ({
          end: (element as HTMLTextAreaElement).selectionEnd,
          start: (element as HTMLTextAreaElement).selectionStart,
          valueLength: (element as HTMLTextAreaElement).value.length,
        })),
      )
      .toEqual({ start: 0, end: 11, valueLength: 11 })
    const editorBox = await editor.boundingBox()
    expect(sourceBeforeEditing).not.toBeNull()
    expect(editorBox).not.toBeNull()
    // SVG bounding boxes include the selected topic's outer stroke while the
    // transparent editor follows the topic's layout box. Allow only that
    // sub-pixel/stroke edge difference so a real layout jump still fails.
    expect(Math.abs(editorBox!.x - sourceBeforeEditing!.x)).toBeLessThan(2)
    expect(Math.abs(editorBox!.y - sourceBeforeEditing!.y)).toBeLessThan(2)
    expect(
      Math.abs(editorBox!.width - sourceBeforeEditing!.width),
    ).toBeLessThan(2)
    expect(
      Math.abs(editorBox!.height - sourceBeforeEditing!.height),
    ).toBeLessThan(2)
    expect(
      await editor.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow,
          paddingTop: style.paddingTop,
        }
      }),
    ).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderTopWidth: '0px',
      boxShadow: 'none',
      paddingTop: '20px',
    })
    await expect(source.locator('rect').first()).toHaveAttribute(
      'fill',
      sourceFill!,
    )
    await editor.fill('Selectable topic text')
    await editor.press('Home')
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')
    await expect
      .poll(() =>
        editor.evaluate(
          (element) =>
            (element as HTMLTextAreaElement).selectionEnd -
            (element as HTMLTextAreaElement).selectionStart,
        ),
      )
      .toBe(3)
  })

  test('uses a white board, left-button panning and Alt plus left marquee selection', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStarterMap(page)
    await page.keyboard.press('Enter')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('Marquee first')
    await page.keyboard.press('Control+Enter')
    await page.keyboard.press('Enter')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('Marquee second')
    await page.keyboard.press('Control+Enter')

    const canvas = page.locator('.mind-map-scroll')
    await expect(canvas).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(canvas).toHaveCSS('background-image', 'none')
    await expect(page.locator('[data-map-background="true"]')).toHaveAttribute(
      'fill',
      '#ffffff',
    )
    const first = page.getByRole('button', { name: 'Topic: Marquee first' })
    const second = page.getByRole('button', { name: 'Topic: Marquee second' })
    const firstBox = await first.boundingBox()
    const secondBox = await second.boundingBox()
    expect(firstBox).not.toBeNull()
    expect(secondBox).not.toBeNull()
    expect(firstBox!.width).toBeLessThanOrEqual(350)
    await expect(first.locator('rect').first()).toHaveAttribute('rx', '10')

    const start = {
      x: Math.min(firstBox!.x, secondBox!.x) - 12,
      y: Math.min(firstBox!.y, secondBox!.y) - 12,
    }
    const end = {
      x:
        Math.max(
          firstBox!.x + firstBox!.width,
          secondBox!.x + secondBox!.width,
        ) + 12,
      y:
        Math.max(
          firstBox!.y + firstBox!.height,
          secondBox!.y + secondBox!.height,
        ) + 12,
    }
    await page.mouse.move(start.x, start.y)
    await expect(canvas).toHaveCSS('cursor', 'grab')
    await page.keyboard.down('Alt')
    await expect(canvas).toHaveCSS('cursor', 'crosshair')
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 8 })
    await expect(page.locator('[data-selection-marquee="true"]')).toBeVisible()
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await expect(canvas).toHaveCSS('cursor', 'grab')
    await expect(page.locator('[data-selection-marquee="true"]')).toHaveCount(0)
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveAttribute('aria-pressed', 'true')

    const transformBefore = await page
      .locator('.mind-map-viewport-layer')
      .evaluate((element) => getComputedStyle(element).transform)
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    const panStart = {
      x: canvasBox!.x + canvasBox!.width - 80,
      y: canvasBox!.y + canvasBox!.height - 80,
    }
    await page.mouse.move(panStart.x, panStart.y)
    await page.mouse.down()
    await page.mouse.move(panStart.x - 90, panStart.y - 60, { steps: 8 })
    await page.mouse.up()
    await expect
      .poll(() =>
        page
          .locator('.mind-map-viewport-layer')
          .evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(transformBefore)
    await expect(page.locator('.canvas-context-menu')).toHaveCount(0)

    await second.click({ button: 'right' })
    await expect(page.locator('.canvas-context-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.canvas-context-menu')).toHaveCount(0)
  })

  test('offers stable selected-topic quick creation and on-demand collapse controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openStarterMap(page)
    await expect(
      page.getByRole('button', { name: 'Create child topic' }),
    ).toHaveCount(0)

    await page.keyboard.press('Enter')
    const editor = page.getByRole('textbox', { name: 'Edit topic text' })
    await editor.fill('Quick topic')
    await page.keyboard.press('Control+Enter')

    await expect(
      page.getByRole('button', { name: 'Create child topic' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create next sibling topic' }),
    ).toBeVisible()
    const childQuickCreate = page.getByRole('button', {
      name: 'Create child topic',
    })
    const siblingQuickCreate = page.getByRole('button', {
      name: 'Create next sibling topic',
    })
    await expect(childQuickCreate).toHaveCSS('width', '20px')
    await expect(childQuickCreate).toHaveCSS('height', '20px')
    await expect(siblingQuickCreate).toHaveCSS('width', '20px')
    await expect(siblingQuickCreate).toHaveCSS('height', '20px')

    const parent = page.getByRole('button', { name: 'Topic: Quick topic' })
    const readTopicVisual = () =>
      parent
        .locator('rect')
        .first()
        .evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            bounds: {
              height: rect.height,
              width: rect.width,
              x: rect.x,
              y: rect.y,
            },
            filter: style.filter,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
          }
        })
    await page.getByRole('button', { name: 'Topic: My first mind map' }).click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(150)
    const unselectedVisual = await readTopicVisual()
    await parent.click()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(150)
    expect(await readTopicVisual()).toEqual(unselectedVisual)

    await page.getByRole('button', { name: 'Create child topic' }).click()
    await expect(editor).toBeVisible()
    await expect
      .poll(() =>
        editor.evaluate((element) => ({
          end: (element as HTMLTextAreaElement).selectionEnd,
          start: (element as HTMLTextAreaElement).selectionStart,
          valueLength: (element as HTMLTextAreaElement).value.length,
        })),
      )
      .toEqual({ start: 0, end: 9, valueLength: 9 })
    await editor.fill('1123新主题')
    await page.keyboard.press('Control+Enter')

    const mixedWidthTopic = page.getByRole('button', {
      name: 'Topic: 1123新主题',
    })
    const mixedWidthShape = mixedWidthTopic.locator('rect').first()
    const mixedWidthText = mixedWidthTopic.locator('text').first()
    const [shapeBox, textBox] = await Promise.all([
      mixedWidthShape.boundingBox(),
      mixedWidthText.boundingBox(),
    ])
    expect(shapeBox).not.toBeNull()
    expect(textBox).not.toBeNull()
    expect(textBox!.x).toBeGreaterThanOrEqual(shapeBox!.x)
    expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(
      shapeBox!.x + shapeBox!.width,
    )

    await mixedWidthTopic.dblclick()
    const wrappingText =
      'OpenTools 思维导图1231231231继续输入更多文字检查编辑换行规则一致'
    await editor.fill(wrappingText)
    const editorBox = await editor.boundingBox()
    const editingShapeBox = await mixedWidthShape.boundingBox()
    expect(editorBox).not.toBeNull()
    expect(editingShapeBox).not.toBeNull()
    expect(
      Math.abs(editorBox!.width - editingShapeBox!.width),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(editorBox!.height - editingShapeBox!.height),
    ).toBeLessThanOrEqual(1)
    const editingLineCount = await editor.evaluate((element) => {
      const style = getComputedStyle(element)
      const verticalPadding =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom)
      return Math.round(
        (element.scrollHeight - verticalPadding) /
          Number.parseFloat(style.lineHeight),
      )
    })
    expect(editingLineCount).toBeGreaterThan(1)
    await page.keyboard.press('Control+Enter')
    const wrappedTopic = page.getByRole('button', {
      name: `Topic: ${wrappingText}`,
    })
    await expect(wrappedTopic.locator('text')).toHaveCount(editingLineCount)

    await expect(
      page.getByRole('button', { name: 'Collapse Quick topic' }),
    ).toHaveCount(0)
    const beforeHover = await parent.boundingBox()
    await parent.hover()
    const afterHover = await parent.boundingBox()
    expect(beforeHover).toEqual(afterHover)

    await parent.click()
    await expect(
      page.getByRole('button', { name: 'Collapse Quick topic' }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Create next sibling topic' })
      .click()
    await editor.fill('Quick sibling')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: Quick sibling' }),
    ).toBeVisible()
    await page.keyboard.press('Control+z')
    await expect(
      page.getByRole('button', { name: 'Topic: Quick sibling' }),
    ).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(
      page.getByRole('button', { name: 'Topic: Quick sibling' }),
    ).toBeVisible()
  })

  test('detects Chinese, switches languages, persists the choice and preserves map content', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'zh-CN' })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(
      page.getByRole('heading', { name: '思维导图库' }),
    ).toBeVisible()
    await expect(page).toHaveTitle('OpenTools 思维导图')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /OpenTools 本地优先/,
    )

    const starterTitle = '我的第一张思维导图'
    await expect(
      page.getByRole('button', { name: new RegExp(`${starterTitle} 更新于`) }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(
      page.getByRole('heading', { name: 'Mind map library' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: new RegExp(`${starterTitle} Updated`) }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          (storageKey) => localStorage.getItem(storageKey),
          languageStorageKey,
        ),
      )
      .toBe('en')

    await page
      .getByRole('button', { name: new RegExp(`${starterTitle} Updated`) })
      .click()
    await expect(
      page.getByRole('button', { name: `Topic: ${starterTitle}` }),
    ).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('textbox', { name: 'Edit topic text' }),
    ).toHaveValue('New topic')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: New topic' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Topic: New topic' }).click()
    await page.keyboard.press('F2')
    await page
      .getByRole('textbox', { name: 'Edit topic text' })
      .fill('User content')
    await page.keyboard.press('Control+Enter')

    await page.getByRole('button', { name: '中文' }).click()
    await expect(
      page.getByRole('button', { name: '主题：User content' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: `主题：${starterTitle}` }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Mind map library' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await context.close()
  })
})
