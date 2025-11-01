import { existsSync } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// The dev container ships Chromium at a fixed path; CI downloads its own with `playwright install`.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  resolve: { dedupe: ['lit', '@lit/context', 'react', 'react-dom'] },
  optimizeDeps: {
    include: ['lit', 'vitest/browser', 'zod'],
  },
  test: {
    include: ['test/**/*.browser.test.{ts,tsx}'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
