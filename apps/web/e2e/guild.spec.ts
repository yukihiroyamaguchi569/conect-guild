import { installFakeAudio } from './fakeAudio.ts';
import {
  BASELINE_KEY,
  expect,
  expectNarration,
  test,
  waitForBaseline,
  waitForRoom,
} from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';

/** Longer than one refresh (5 s), for waits on the next fetch. */
const REFRESH_TIMEOUT = 15_000;

test('opens without console or page errors', async ({ page, pageErrors }) => {
  await page.goto('/');
  await expect(page.getByText('#101')).toBeVisible();
  await waitForRoom(page);
  await waitForBaseline(page);
  expect(pageErrors).toEqual([]);
});

test('the board, the party and the message window show the snapshot', async ({ page }) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board.getByRole('listitem')).toHaveCount(4);
  await expect(board).toContainText('架空商事への請求書を作る');
  await expect(board).toContainText('複数部門');
  // #98 is closed: no longer on the board.
  await expect(board).not.toContainText('#98');

  const party = page.getByRole('region', { name: 'パーティのようす' });
  await expect(party.getByRole('listitem')).toHaveCount(6);
  for (const name of ['かなめ', 'みのり', 'ひびき', 'ひらめ', 'ささえ', 'ゆきひろ'])
    await expect(party).toContainText(name);

  // No events on the first load: the window tells the narration.
  await expectNarration(page);

  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toContainText('最終取得 12:00');
  await expect(fetch).not.toContainText('情報が古い');
});

test('the fetch status is the tab on the message window, out of the column (Issue #132)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toContainText('最終取得 12:00');
  await expect(fetch).toHaveClass(/fetch--tab/);
  await expect(
    page.locator('.stage__side').getByRole('region', { name: '取得のようす' }),
  ).toHaveCount(0);
  // On the message window's top edge, its bottom on the window's top.
  const tab = await fetch.boundingBox();
  const message = await page.getByRole('region', { name: 'メッセージ' }).boundingBox();
  if (tab === null || message === null) throw new Error('the tab or the message window has no box');
  expect(tab.y + tab.height).toBeCloseTo(message.y, 0);
  expect(tab.x + tab.width).toBeCloseTo(message.x + message.width, 0);
});

test('the canvas draws the room, not a blank or single colour', async ({ page }) => {
  await page.goto('/');
  const stats = await waitForRoom(page);
  expect(stats.colors).toBeGreaterThan(50);
  expect(stats.brightness).toBeGreaterThan(10);
  expect(stats.brightness).toBeLessThan(245);
});

test('day and night are drawn differently (?hour)', async ({ page }) => {
  await page.goto('/?hour=12');
  const day = await waitForRoom(page);
  await page.goto('/?hour=21.5');
  const night = await waitForRoom(page);
  expect(day.brightness - night.brightness).toBeGreaterThan(20);
});

test('the sound button and the volume switch', async ({ page }) => {
  await page.addInitScript(installFakeAudio);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '♪ 音を出す' });
  const volume = page.getByRole('button', { name: /^音量 2/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(volume).toHaveText('音量 ■■□');

  await toggle.click();
  const on = page.getByRole('button', { name: '♪ 音を消す' });
  await expect(on).toHaveAttribute('aria-pressed', 'true');
  // Turning it on unlocks the audio with the click and blips once.
  await expect.poll(() => page.evaluate(() => window.e2eStartedTones)).toBeGreaterThan(0);

  await page.getByRole('button', { name: /^音量/ }).click();
  await expect(page.getByRole('button', { name: /^音量/ })).toHaveText('音量 ■■■');
  await page.getByRole('button', { name: /^音量/ }).click();
  await expect(page.getByRole('button', { name: /^音量/ })).toHaveText('音量 ■□□');

  // Kept on this device only.
  await page.reload();
  await expect(page.getByRole('button', { name: '♪ 音を消す' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^音量/ })).toHaveText('音量 ■□□');
});

test('「基準を消す」 removes the baseline and the next fetch stores a new one', async ({
  page,
}) => {
  await page.goto('/');
  await waitForBaseline(page);
  // Hold the next refresh in flight (the app fetches one at a time), so no fetch can store a new
  // baseline before the check below.
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held: () => void = () => undefined;
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  await page.route('**/snapshot.json', async (route) => {
    held();
    await gate;
    // On to the fixture's context route (continue() would go to the dev server).
    await route.fallback();
  });
  await holding;
  await page.getByRole('button', { name: '基準を消す' }).click();
  await expect(page.getByText('基準を消しました')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), BASELINE_KEY)).toBeNull();
  // The next refresh counts as the first load: a new baseline, no events.
  release();
  await waitForBaseline(page, REFRESH_TIMEOUT);
  await expectNarration(page);
});

test('below 760px the windows stack and the canvas is hidden', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'ギルドの社屋' })).toBeHidden();

  const box = async (name: string) => {
    const region = page.getByRole('region', { name });
    await expect(region).toBeVisible();
    const found = await region.boundingBox();
    if (found === null) throw new Error(`${name} has no box`);
    return found;
  };
  const board = await box('クエスト掲示板');
  const message = await box('メッセージ');
  const party = await box('パーティのようす');
  // Top to bottom in document order, each in the full width.
  expect(board.y + board.height).toBeLessThanOrEqual(message.y);
  expect(message.y + message.height).toBeLessThanOrEqual(party.y);
  for (const window of [board, message, party]) expect(window.width).toBeGreaterThan(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(700);
});

test('a snapshot of another repository halts the screen', async ({ page, snapshotServer }) => {
  snapshotServer.serve({ ...(await sampleSnapshot()), repo: 'someone/else' });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('収集の対象と設定が違います');
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toHaveCount(0);
});
