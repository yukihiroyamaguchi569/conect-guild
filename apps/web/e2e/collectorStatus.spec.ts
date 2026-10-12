// Issue #74: while nothing is collected (204), the automatic demo's banner tells whether the
// collector runs and fails, from /collector-status.json.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** Longer than one refresh (5 s), for waits on the next fetch. */
const REFRESH_TIMEOUT = 15_000;
const DEMO_BANNER = 'デモ表示中（架空のデータ）。データを集めると自分のリポジトリに切り替わります';
const FAILURE_BANNER =
  'デモ表示中（架空のデータ）。collector が失敗しています（認証・取得）。ターミナルを確認してください';
const FAILURE_WARNING =
  '[conect-guild] collector が失敗しています（認証・取得）。ターミナルを確認してください（gh-failed）';
const MINUTE_MS = 60_000;

/** The page's console.info and console.warn lines, and how often it read the status. */
function recordConsole(page: Page) {
  const info: string[] = [];
  const warnings: string[] = [];
  let statusReads = 0;
  page.on('console', (message) => {
    if (message.type() === 'info') info.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/collector-status.json') statusReads += 1;
  });
  return { info, warnings, statusReads: () => statusReads };
}

/** Waits until the page has read the status `count` times (the start, then every 5 s). */
async function readsOfStatus(logs: ReturnType<typeof recordConsole>, count: number) {
  await expect
    .poll(logs.statusReads, { timeout: REFRESH_TIMEOUT * 2 })
    .toBeGreaterThanOrEqual(count);
}

function ghFailed(attemptedAt: number) {
  return {
    ok: false,
    attemptedAt: new Date(attemptedAt).toISOString(),
    kind: 'gh-failed',
  } as const;
}

test('a failing collector shows on the banner and in one console warning', async ({
  page,
  pageErrors,
  snapshotServer,
  collectorStatus,
}) => {
  const logs = recordConsole(page);
  await page.clock.setSystemTime(NOW);
  snapshotServer.failWith(204);
  collectorStatus.report(ghFailed(NOW));
  await page.goto('/');

  const banner = page.getByRole('status', { name: 'デモ表示中' });
  await expect(banner).toContainText(FAILURE_BANNER);
  await expect(banner.getByRole('link', { name: '集め方（docs/setup.md）' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toBeVisible();
  // Still failing on the next reads: one warning only, and the start's hint once.
  await expect.poll(() => logs.info.length).toBe(1);
  await readsOfStatus(logs, 3);
  await expect(banner).toContainText(FAILURE_BANNER);
  expect(logs.warnings).toEqual([FAILURE_WARNING]);
  expect(logs.info[0]).toContain('デモ（架空のデータ）を表示しています');

  // The collector succeeds: the page turns live as before.
  collectorStatus.report({ ok: true, attemptedAt: new Date(NOW).toISOString() });
  snapshotServer.serve(await sampleSnapshot());
  await expect(page.getByText('#101')).toBeVisible({ timeout: REFRESH_TIMEOUT });
  await expect(banner).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('with no status (the collector never ran) the banner stays as before', async ({
  page,
  pageErrors,
  snapshotServer,
}) => {
  const logs = recordConsole(page);
  await page.clock.setSystemTime(NOW);
  snapshotServer.failWith(204);
  await page.goto('/');
  const banner = page.getByRole('status', { name: 'デモ表示中' });
  await expect(banner).toContainText(DEMO_BANNER);
  await expect.poll(() => logs.info.length).toBe(1);
  await readsOfStatus(logs, 2);
  await expect(banner).toContainText(DEMO_BANNER);
  expect(logs.warnings).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('a failure from long ago (the collector stopped) keeps the banner as before', async ({
  page,
  snapshotServer,
  collectorStatus,
}) => {
  const logs = recordConsole(page);
  await page.clock.setSystemTime(NOW);
  snapshotServer.failWith(204);
  collectorStatus.report(ghFailed(NOW - 10 * MINUTE_MS));
  await page.goto('/');
  const banner = page.getByRole('status', { name: 'デモ表示中' });
  await expect(banner).toContainText(DEMO_BANNER);
  await expect.poll(() => logs.info.length).toBe(1);
  await readsOfStatus(logs, 2);
  await expect(banner).toContainText(DEMO_BANNER);
  expect(logs.warnings).toEqual([]);
});
