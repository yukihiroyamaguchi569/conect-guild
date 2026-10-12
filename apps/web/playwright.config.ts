import { defineConfig, devices } from '@playwright/test';

/** A port of its own, so the tests never meet a dev server already running (5173 etc.). */
const PORT = 5196;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const ON_CI = process.env.CI !== undefined;

export default defineConfig({
  testDir: './e2e',
  // One at a time: the tests wait on the app's real 5-second refresh, which load could delay.
  fullyParallel: false,
  workers: 1,
  forbidOnly: ON_CI,
  retries: ON_CI ? 1 : 0,
  // Next to this file, where the CI job uploads it from on failure.
  reporter: ON_CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The host stays 127.0.0.1 from vite.config.ts; never pass --host. `--mode e2e` keeps
    // guild.settings.json even when guild.settings.local.json exists (vite-plugin-settings.ts).
    command: `npx vite --port ${String(PORT)} --strictPort --mode e2e`,
    cwd: import.meta.dirname,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
