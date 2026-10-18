import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import { MONTH_EVENT_DAY_KEY } from '../src/render/monthEvent.ts';

/**
 * The month's gathering (Issue #214): from 15 o'clock (Tokyo time, playwright.config.ts) those with
 * nothing to do gather in front of the month's ornament and one says the word of October, once that
 * day (the date is kept in localStorage).
 */

const AFTERNOON = Date.parse('2026-10-14T06:30:00.000Z');
const WORD = 'トリックオア…';

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.clock.setFixedTime(AFTERNOON);
  snapshotServer.serve(await sampleSnapshot(AFTERNOON));
  await page.addInitScript(installCanvasImageRecorder);
  await page.addInitScript(installCanvasTextRecorder);
});

test('those free gather at the ornament and say the month’s word, once a day', async ({ page }) => {
  await page.goto('/');
  await waitForRoom(page);
  await expect
    .poll(async () => (await drawnTexts(page)).includes(WORD), { timeout: 20_000 })
    .toBe(true);
  const kept = await page.evaluate((key) => localStorage.getItem(key), MONTH_EVENT_DAY_KEY);
  expect(kept).toBe('"2026-10-14"');
});

test('no gathering again the same day after a reload', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, '"2026-10-14"');
  }, MONTH_EVENT_DAY_KEY);
  await page.goto('/');
  await waitForRoom(page);
  // The members are drawn on the frames that would start the gathering too (as toast.spec.ts).
  await expect.poll(async () => (await drawnImages(page, 'minori')).length).toBeGreaterThan(0);
  expect(await drawnTexts(page)).not.toContain(WORD);
});
