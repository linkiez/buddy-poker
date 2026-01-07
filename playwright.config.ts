import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4205);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: `yarn build && PORT=${port} yarn serve:ssr:buddy-poker`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
