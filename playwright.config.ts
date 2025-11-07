import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The dev container ships Chromium at a fixed path; CI installs its own with `playwright install`.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Tests tagged @network load map tiles and geocode over the internet; CI skips them by default.
  grep: process.env.NETWORK_E2E ? undefined : /^(?!.*@network)/,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'pnpm --filter playground build && pnpm --filter playground preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
