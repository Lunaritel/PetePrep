import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173/PetePrep/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-14', use: { ...devices['iPhone 14'], browserName: 'webkit' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // Older iOS Safari cannot `for await` over a ReadableStream; Playwright's WebKit can, so remove it.
    { name: 'iphone-older-safari', use: { ...devices['iPhone 14'], browserName: 'webkit' }, metadata: { noStreamIteration: true } },
  ],
  webServer: {
    command: 'npm run build:web && npm run preview:web',
    url: 'http://127.0.0.1:4173/PetePrep/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
