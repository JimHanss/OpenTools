import { defineConfig, devices } from '@playwright/test'

import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  fullyParallel: true,
  outputDir: './output/playwright/browser-acceptance',
  reporter: 'list',
  use: {
    ...baseConfig.use,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-acceptance',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'edge-acceptance',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
})
