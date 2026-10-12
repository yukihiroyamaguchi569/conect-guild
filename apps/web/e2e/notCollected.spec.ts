// Issue #67: before the collector's first write the dev server answers /snapshot.json with 204.
// The page then plays the demo by itself and turns live once the file is there.
import type { Page } from '@playwright/test';
import { BASELINE_KEY, expect, expectNarration, test } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** Longer than one refresh (5 s), for waits on the next fetch. */
const REFRESH_TIMEOUT = 15_000;
/** The demo's first scroll is handed out about 5 s after it starts (domain/demoScript.ts). */
const FIRST_SCROLL_TIMEOUT = 20_000;
const SETUP_GUIDE = 'https://github.com/yukihiroyamaguchi569/conect-guild/blob/main/docs/setup.md';

/** Chrome logs a failed fetch as a console error: expected for the 500 test only. */
const SERVER_ERROR_LOG = /^console: Failed to load resource: .* status of 500 /;

/** Drops the expected 500 logs, so the fixture's own check sees only the others. */
function dropServerErrorLogs(pageErrors: string[]): void {
  const rest = pageErrors.filter((error) => !SERVER_ERROR_LOG.test(error));
  pageErrors.splice(0, pageErrors.length, ...rest);
}

/** Requests the page made to another origin (it must make none) and to /snapshot.json. */
function recordRequests(page: Page, origin: string) {
  const outside: string[] = [];
  let snapshotReads = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) outside.push(request.url());
    else if (url.pathname === '/snapshot.json') snapshotReads += 1;
  });
  return { outside, snapshotReads: () => snapshotReads };
}

test('a 204 plays the demo by itself, then turns live once collected, without events', async ({
  page,
  pageErrors,
  snapshotServer,
}, testInfo) => {
  const requests = recordRequests(page, String(testInfo.project.use.baseURL));
  // The fixtures fix Date, which would hold the demo's script at its start: let the time flow.
  await page.clock.setSystemTime(NOW);
  snapshotServer.failWith(204);
  await page.goto('/');

  const banner = page.getByRole('status', { name: 'デモ表示中' });
  await expect(banner).toContainText(
    'デモ表示中（架空のデータ）。データを集めると自分のリポジトリに切り替わります',
  );
  const guide = banner.getByRole('link', { name: '集め方（docs/setup.md）' });
  await expect(guide).toHaveAttribute('href', SETUP_GUIDE);
  await expect(guide).toHaveAttribute('target', '_blank');
  await expect(guide).toHaveAttribute('rel', 'noopener noreferrer');

  // The fictional script runs with no はじめる; no error, no stale mark.
  await expect(page.getByRole('button', { name: /はじめる/ })).toHaveCount(0);
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board).toContainText('10 月分の請求書を作る', { timeout: FIRST_SCROLL_TIMEOUT });
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toContainText('デモ（架空のデータ）');
  await expect(fetch).not.toContainText('取得失敗');
  await expect(fetch).not.toContainText('情報が古い');
  // Silent until the viewer turns the sound on.
  await expect(page.getByRole('button', { name: '♪ 音を出す' })).toBeVisible();
  // /snapshot.json is still read in the background; the demo keeps nothing in localStorage.
  expect(requests.snapshotReads()).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate((key) => localStorage.getItem(key), BASELINE_KEY)).toBeNull();

  // The collector writes the file: the next read turns the page live without reloading.
  snapshotServer.serve(await sampleSnapshot());
  await expect(page.getByText('#101')).toBeVisible({ timeout: REFRESH_TIMEOUT });
  await expect(banner).toHaveCount(0);
  await expect(board).not.toContainText('10 月分の請求書を作る');
  await expect(fetch).toContainText('最終取得 12:00');
  await expect(fetch).toContainText('基準を消す');
  // The first live snapshot is only the baseline: no event message, the narration.
  await expectNarration(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), BASELINE_KEY))
    .not.toBeNull();

  expect(requests.outside).toEqual([]);
  // A 204 is no failure to the browser: not one console error while the demo plays.
  expect(pageErrors).toEqual([]);
});

test('on a narrow screen the automatic demo still runs in the stacked windows', async ({
  page,
  pageErrors,
  snapshotServer,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.clock.setSystemTime(NOW);
  snapshotServer.failWith(204);
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'デモ表示中' })).toBeVisible();
  // The canvas is hidden, but the script runs: the board, the party and the messages move.
  await expect(page.getByRole('img', { name: 'ギルドの社屋' })).toBeHidden();
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board).toContainText('10 月分の請求書を作る', { timeout: FIRST_SCROLL_TIMEOUT });
  const message = page.getByRole('region', { name: 'メッセージ' });
  await expect(message).toContainText('わたした', { timeout: FIRST_SCROLL_TIMEOUT });
  await expect(page.getByRole('region', { name: 'パーティのようす' })).toContainText('作業中');
  expect(pageErrors).toEqual([]);
});

test('a 500 stays an error, never the demo', async ({
  page,
  pageErrors,
  snapshotServer,
}, testInfo) => {
  const requests = recordRequests(page, String(testInfo.project.use.baseURL));
  snapshotServer.failWith(500);
  await page.goto('/');
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toContainText('取得失敗（サーバーがエラーを返しました）');
  // Still an error after the next refresh.
  await expect.poll(requests.snapshotReads, { timeout: REFRESH_TIMEOUT }).toBeGreaterThanOrEqual(2);
  await expect(fetch).toContainText('取得失敗（サーバーがエラーを返しました）');
  await expect(page.getByRole('status', { name: 'デモ表示中' })).toHaveCount(0);
  await expect(fetch).not.toContainText('デモ（架空のデータ）');
  dropServerErrorLogs(pageErrors);
});
