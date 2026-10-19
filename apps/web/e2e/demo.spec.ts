// The demo mode (Issue #49) on its own: not the shared fixtures, which serve /snapshot.json and
// expect it to be read. Here any request for it fails the test.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { installFakeAudio } from './fakeAudio.ts';
import { LINE_BOOK } from '../src/render/lineBook.ts';

/** The first scroll is handed out about 5 s after はじめる (domain/demoScript.ts). */
const FIRST_EVENT_TIMEOUT = 15_000;
/** The first scroll's lines: handed out about 5 s in, walked over in about 8 s more. */
const LINES_TIMEOUT = 25_000;
/** The king's call (summon, audio/scores.ts): D4 then G4, in Hz rounded. */
const SUMMON_TONES = [294, 392];

/** Errors of the page and every request for a snapshot, checked at the end of each test. */
async function openDemo(page: Page, context: BrowserContext) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`page: ${error.message}`);
  });
  // Answered here (never by the dev server, which would read apps/web/.data) and counted.
  const snapshotRequests: string[] = [];
  await context.route('**/snapshot*.json', (route) => {
    snapshotRequests.push(route.request().url());
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(installFakeAudio);
  await page.addInitScript(installCanvasTextRecorder);
  await page.goto('/?demo=1');
  return { errors, snapshotRequests };
}

test('the demo has no show mode: no button, and its titles stay even when the live screen masks (Issue #144)', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem('conect-guild:mask', '{"on":true}');
  });
  const { errors } = await openDemo(page, context);
  await page.getByRole('button', { name: '▶ はじめる' }).click();
  await expect(page.getByRole('region', { name: 'メッセージ' })).toContainText(
    '「10 月分の請求書を作る」',
    { timeout: FIRST_EVENT_TIMEOUT },
  );
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).not.toContainText('＊');
  await expect(page.getByRole('button', { name: /^(見せる|もどす)$/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '取得のようす' })).not.toContainText('伏せ中');
  expect(errors).toEqual([]);
});

test('?demo=1 plays the fictional script with sound, never reading /snapshot.json', async ({
  page,
  context,
}) => {
  const { errors, snapshotRequests } = await openDemo(page, context);
  const start = page.getByRole('button', { name: '▶ はじめる' });
  await expect(start).toBeVisible();
  const fetchStatus = page.getByRole('region', { name: '取得のようす' });
  await expect(fetchStatus).toContainText('デモ（架空のデータ）');
  await expect(fetchStatus).not.toContainText('情報が古い');

  await start.click();
  await expect(start).toBeHidden();
  // First the king's order to かなめ (Issue #28): her session works, the king murmurs, one answer.
  const rows = page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem');
  await expect(rows.nth(0)).toContainText('かなめ');
  await expect(rows.nth(0)).toContainText('いま作業中');
  await expect.poll(() => drawnTexts(page)).toContain('ゴニョゴニョ');
  await expect
    .poll(async () => (await drawnTexts(page)).filter((t) => t === 'はっ！'))
    .toEqual(['はっ！']);
  // Its sound is the first to ring, on a running AudioContext (the click let the browser play).
  await expect
    .poll(() => page.evaluate(() => window.e2eToneFrequencies?.slice(0, 2)))
    .toEqual(SUMMON_TONES);
  expect(await page.evaluate(() => window.e2eAudioStates?.[0])).toBe('running');

  const message = page.getByRole('region', { name: 'メッセージ' });
  await expect(message).toContainText('「10 月分の請求書を作る」', {
    timeout: FIRST_EVENT_TIMEOUT,
  });
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toContainText(
    '10 月分の請求書を作る',
  );
  // The scroll's sound follows the call's.
  await expect.poll(() => page.evaluate(() => window.e2eStartedTones)).toBeGreaterThan(2);

  // The levels (Issue #19) come from the demo's made-up history: everybody but the king has one.
  await expect(rows).toHaveCount(6);
  for (const i of [0, 1, 2, 3, 4]) await expect(rows.nth(i)).toContainText(/Lv \d+/);
  await expect(rows.nth(5)).toContainText('おうさま');

  // Nothing of the demo is kept in localStorage.
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.filter((key) => key.startsWith('conect-guild:'))).toEqual([]);
  await expect(fetchStatus).not.toContainText('情報が古い');
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('in the demo the members say their lines with the scenes (Issue #47)', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const { errors, snapshotRequests } = await openDemo(page, context);
  await page.getByRole('button', { name: '▶ はじめる' }).click();
  // The first scroll goes to 経理 (quest1 of the even loops): かなめ hands it over or tosses it,
  // then みのり says hers as she holds it up.
  const kaname: readonly string[] = [...LINE_BOOK.kaname.handOver, ...LINE_BOOK.kaname.toss];
  const minori: readonly string[] = LINE_BOOK.minori.takeScroll;
  await expect
    .poll(async () => (await drawnTexts(page)).some((text) => kaname.includes(text)), {
      timeout: LINES_TIMEOUT,
    })
    .toBe(true);
  await expect
    .poll(async () => (await drawnTexts(page)).some((text) => minori.includes(text)), {
      timeout: LINES_TIMEOUT,
    })
    .toBe(true);
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('on a narrow screen (the room hidden) はじめる waits until the screen is wider', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  const { errors, snapshotRequests } = await openDemo(page, context);
  const blocked = page.getByRole('button', { name: 'がめんを ひろげてください' });
  await expect(blocked).toBeVisible();
  await expect(blocked).toBeDisabled();

  // Wider: the room shows, and the demo can start with the king's call.
  await page.setViewportSize({ width: 1280, height: 720 });
  const start = page.getByRole('button', { name: '▶ はじめる' });
  await expect(start).toBeEnabled();
  await start.click();
  await expect
    .poll(() => page.evaluate(() => window.e2eToneFrequencies?.slice(0, 2)))
    .toEqual(SUMMON_TONES);
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

/** Plays the demo from はじめる until かなめ's level-up shows, "LEVEL UP" on the canvas with it. */
async function expectFirstLevelUp(page: Page, context: BrowserContext) {
  const { errors, snapshotRequests } = await openDemo(page, context);
  await page.getByRole('button', { name: '▶ はじめる' }).click();
  const message = page.getByRole('region', { name: 'メッセージ' });
  await expect(message).toContainText('かなめは レベル 6 に あがった！', { timeout: 60_000 });
  await expect.poll(() => drawnTexts(page)).toContain('LEVEL UP');
  await expect(
    page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem').nth(0),
  ).toContainText('Lv 6');
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
}

test('the first loop of the demo shows a level-up (Issue #19)', async ({ page, context }) => {
  // かなめ goes up with her second scroll (13.5 s), and the message waits until she is back
  // from handing it over: well within the first loop, with the room's scenes in real time.
  test.setTimeout(90_000);
  await expectFirstLevelUp(page, context);
});

/**
 * In the hours of a gathering the free hands are in it when the demo starts (Issue #224): a scene
 * waits for its cast to walk back, and the message queue waits with it, so the level-up's message
 * and "LEVEL UP" still come together. Tokyo time (playwright.config.ts); the clock runs on.
 */
const GATHERING_TIMES = [
  { name: 'the month’s gathering (a Monday, 15:30)', at: '2026-10-19T06:30:00.000Z' },
  { name: 'the Friday toast (18:30)', at: '2026-10-16T09:30:00.000Z' },
] as const;

for (const { name, at } of GATHERING_TIMES) {
  test(`the level-up shows with its message in the hours of ${name} (Issue #224)`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await page.clock.install({ time: Date.parse(at) });
    await expectFirstLevelUp(page, context);
  });
}
