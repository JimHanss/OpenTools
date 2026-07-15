import { expect, test } from '@playwright/test'

const languageStorageKey = 'opentools.locale'

test.describe('web mind-map MVP', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, 'en')
    }, languageStorageKey)
  })

  test('supports keyboard editing, history, collapse/search, persistence and complete exports', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()

    await page.keyboard.press('Enter')
    await page.getByRole('textbox', { name: 'Edit topic text' }).fill('Plan')
    await page.keyboard.press('Control+Enter')
    await expect(
      page.getByRole('button', { name: 'Topic: Plan' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Undo last edit' }).click()
    await expect(
      page.getByRole('button', { name: 'Topic: New topic' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Redo last edit' }).click()
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

  test('rejects invalid JSON without overwriting the open map', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
    const before = await page
      .getByRole('textbox', { name: 'Mind map title' })
      .inputValue()

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
    await page.goto('/')
    await page
      .getByRole('button', { name: /My first mind map Updated/ })
      .click()
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
