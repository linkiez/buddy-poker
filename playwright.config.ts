import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4205);
const baseURL = `http://127.0.0.1:${port}`;
const isWindows = process.platform === 'win32';
const webServerCommand = isWindows
  ? `yarn build && set PORT=${port} && yarn serve:ssr:buddy-poker`
  : `yarn build && PORT=${port} yarn serve:ssr:buddy-poker`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
