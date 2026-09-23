import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const port = Number(process.env.E2E_PORT ?? 4205);
const baseURL = `http://127.0.0.1:${port}`;
const isWindows = process.platform === 'win32';
const webServerCommand = isWindows
  ? `yarn build && set PORT=${port} && yarn serve:ssr:buddy-poker`
  : `yarn build && PORT=${port} yarn serve:ssr:buddy-poker`;
const localBrowserPath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/snap/bin/chromium']
    .find((path) => existsSync(path));

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(localBrowserPath ? { launchOptions: { executablePath: localBrowserPath } } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
