import type { Page } from '@playwright/test';
import { DECOR, DECOR_TILE_SIZE } from '../../../assets/decor/decor';
import { drawnImages, forgetDrawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot, withClosedIssues } from './sampleSnapshot.ts';
import { DEFAULT_SEATS } from '../src/render/scenes.ts';
import { SELECTED_LAYOUT } from '../src/render/layouts/index.ts';
import { rewardOnDesk } from '../src/render/rewardDesk.ts';

/**
 * The king's reward of the day (Issue #194): みのり (経理) cleared the one quest of the day before
 * 17:00 (Tokyo, the browser's time zone in playwright.config.ts). On 2026-10-12 the day's kind is
 * the medal (domain/dailyReward.ts dayRandom).
 */

const at = (time: string): number => Date.parse(`2026-10-12T${time}+09:00`);
const LINE = 'おうさまから みのりに ほうびの くんしょうが とどいた！';
const PLACED = rewardOnDesk(SELECTED_LAYOUT, DEFAULT_SEATS.minori, 'medal');

/** The sample at `time`, with #101 (経理) cleared at 10:00. */
async function snapshotAt(time: string) {
  return withClosedIssues(await sampleSnapshot(at(time)), [101], at('10:00:00'));
}

/** True once the medal has been drawn on みのり's desk. */
async function medalDrawn(page: Page): Promise<boolean> {
  if (PLACED === null) throw new Error('no desk for みのり');
  const piece = DECOR.medal;
  return (await drawnImages(page, 'decor')).some(
    (image) =>
      image.sx === piece.col * DECOR_TILE_SIZE &&
      image.sy === piece.row * DECOR_TILE_SIZE &&
      image.dx === PLACED.x &&
      image.dy === PLACED.y,
  );
}

const windowText = (page: Page) =>
  page.getByRole('region', { name: 'メッセージ' }).locator('p').textContent();

test('the reward comes at 17:00 with a line, and stays on the desk', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasImageRecorder);
  await page.clock.setFixedTime(at('16:59:50'));
  snapshotServer.serve(await snapshotAt('16:59:50'));
  await page.goto('/');
  await waitForRoom(page);
  expect(await medalDrawn(page)).toBe(false);

  await page.clock.setFixedTime(at('17:00:10'));
  snapshotServer.serve(await snapshotAt('17:00:10'));
  await expect(page.getByRole('region', { name: 'メッセージ' })).toContainText(LINE, {
    timeout: 15_000,
  });
  await expect.poll(() => medalDrawn(page)).toBe(true);
});

test('a screen opened after 17:00 has the reward on the desk already, untold', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasImageRecorder);
  await page.clock.setFixedTime(at('18:00:00'));
  snapshotServer.serve(await snapshotAt('18:00:00'));
  await page.goto('/');
  await waitForRoom(page);
  await expect.poll(() => medalDrawn(page)).toBe(true);
  expect(await windowText(page)).not.toContain('ほうび');
});

test('the desk is cleared at midnight, even while the fetches fail', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasImageRecorder);
  await page.clock.setFixedTime(at('23:59:50'));
  snapshotServer.serve(await snapshotAt('23:59:50'));
  await page.goto('/');
  await waitForRoom(page);
  await expect.poll(() => medalDrawn(page)).toBe(true);

  snapshotServer.failWith(500);
  await page.clock.setFixedTime(Date.parse('2026-10-13T00:00:10+09:00'));
  // The frames drawn from then on have no medal.
  await forgetDrawnImages(page);
  await expect.poll(async () => (await drawnImages(page, 'decor')).length).toBeGreaterThan(0);
  expect(await medalDrawn(page)).toBe(false);
});
