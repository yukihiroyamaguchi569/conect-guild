import { defineConfig, devices } from '@playwright/test';

/** A port of its own, so the tests never meet a dev server already running (5173 etc.). */
const PORT = 5196;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const ON_CI = process.env.CI !== undefined;

/**
 * The offices of other department counts (Issue #18): one server each, on the ports after PORT,
 * in the test-only mode that reads the fictional settings of e2e/settings (vite-plugin-settings.ts
 * E2E_DEPARTMENTS_MODE). Only departments.spec.ts runs against them.
 */
const OTHER_COUNTS = [2, 3, 5, 6] as const;
const portFor = (count: number): number => PORT + count - 1;
const urlFor = (count: number): string => `http://127.0.0.1:${String(portFor(count))}`;
const DEPARTMENTS_SPEC = /departments\.spec\.ts/;

/**
 * The guests (Issue #108): a server of its own in the same test-only mode, reading the fictional
 * settings with two guests (vite-plugin-settings.ts E2E_SETTINGS_FILES.guests). Only guests.spec.ts
 * runs against it.
 */
const GUESTS_PORT = PORT + 10;
const GUESTS_URL = `http://127.0.0.1:${String(GUESTS_PORT)}`;
const GUESTS_SPEC = /guests\.spec\.ts/;
/** The one guest of five departments (seven on stage): settings guests-5, guestsFive.spec.ts. */
const GUESTS_FIVE_PORT = GUESTS_PORT + 1;
const GUESTS_FIVE_URL = `http://127.0.0.1:${String(GUESTS_FIVE_PORT)}`;
const GUESTS_FIVE_SPEC = /guestsFive\.spec\.ts/;

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
  projects: [
    {
      name: 'chromium',
      testIgnore: [DEPARTMENTS_SPEC, GUESTS_SPEC, GUESTS_FIVE_SPEC],
      use: { ...devices['Desktop Chrome'] },
    },
    ...OTHER_COUNTS.map((count) => ({
      name: `departments-${String(count)}`,
      testMatch: DEPARTMENTS_SPEC,
      metadata: { departmentCount: count },
      use: { ...devices['Desktop Chrome'], baseURL: urlFor(count) },
    })),
    {
      name: 'guests',
      testMatch: GUESTS_SPEC,
      use: { ...devices['Desktop Chrome'], baseURL: GUESTS_URL },
    },
    {
      name: 'guests-5',
      testMatch: GUESTS_FIVE_SPEC,
      use: { ...devices['Desktop Chrome'], baseURL: GUESTS_FIVE_URL },
    },
  ],
  webServer: [
    {
      // The host stays 127.0.0.1 from vite.config.ts; never pass --host. `--mode e2e` keeps
      // guild.settings.json even when guild.settings.local.json exists (vite-plugin-settings.ts).
      command: `npx vite --port ${String(PORT)} --strictPort --mode e2e`,
      cwd: import.meta.dirname,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    ...OTHER_COUNTS.map((count) => ({
      command: `npx vite --port ${String(portFor(count))} --strictPort --mode e2e-departments`,
      cwd: import.meta.dirname,
      env: { GUILD_E2E_DEPARTMENTS: String(count) },
      url: urlFor(count),
      reuseExistingServer: false,
      timeout: 60_000,
    })),
    {
      command: `npx vite --port ${String(GUESTS_PORT)} --strictPort --mode e2e-departments`,
      cwd: import.meta.dirname,
      env: { GUILD_E2E_DEPARTMENTS: 'guests' },
      url: GUESTS_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${String(GUESTS_FIVE_PORT)} --strictPort --mode e2e-departments`,
      cwd: import.meta.dirname,
      env: { GUILD_E2E_DEPARTMENTS: 'guests-5' },
      url: GUESTS_FIVE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
