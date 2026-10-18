import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import { PROPS, PROPS_TILE_SIZE } from '../../../assets/props/props.ts';
import { TOAST_DAY_KEY } from '../src/render/toastStage.ts';

/**
 * The Friday evening toast (Issue #193): from 18 o'clock (Tokyo time, playwright.config.ts) those
 * with nothing to do raise a tankard in front of the counter and one says 「かんぱーい！」, once
 * that Friday (the date is kept in localStorage).
 */

const FRIDAY_EVENING = Date.parse('2026-10-16T09:30:00.000Z');
const TANKARD_SX = PROPS.tankard.col * PROPS_TILE_SIZE;

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.clock.setFixedTime(FRIDAY_EVENING);
  snapshotServer.serve(await sampleSnapshot(FRIDAY_EVENING));
  await page.addInitScript(installCanvasImageRecorder);
  await page.addInitScript(installCanvasTextRecorder);
});

test('those free raise a tankard on a Friday evening, and the date is kept', async ({ page }) => {
  await page.goto('/');
  await waitForRoom(page);
  await expect
    .poll(async () => (await drawnTexts(page)).includes('かんぱーい！'), { timeout: 20_000 })
    .toBe(true);
  const props = await drawnImages(page, 'props');
  expect(props.some((image) => image.sx === TANKARD_SX)).toBe(true);
  const kept = await page.evaluate((key) => localStorage.getItem(key), TOAST_DAY_KEY);
  expect(kept).toBe('"2026-10-16"');
});

test('no toast again the same Friday after a reload', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, '"2026-10-16"');
  }, TOAST_DAY_KEY);
  await page.goto('/');
  await waitForRoom(page);
  // The members are drawn on the frames that would start the toast too.
  await expect.poll(async () => (await drawnImages(page, 'minori')).length).toBeGreaterThan(0);
  expect((await drawnImages(page, 'props')).filter((image) => image.sx === TANKARD_SX)).toEqual([]);
  expect(await drawnTexts(page)).not.toContain('かんぱーい！');
});
