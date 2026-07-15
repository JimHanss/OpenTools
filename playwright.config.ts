import { defineConfig, devices } from '@playwright/test'

const webServerCommand =
  process.platform === 'win32'
    ? 'npm.cmd run dev --workspace @opentools/web -- --host 127.0.0.1 --port 4173'
    : 'npm run dev --workspace @opentools/web -- --host 127.0.0.1 --port 4173'

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: webServerCommand,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
