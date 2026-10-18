import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { DECOR, DECOR_TILE_SIZE } from '../../../assets/decor/decor';
import { drawnImages, forgetDrawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot, withClosedIssues } from './sampleSnapshot.ts';
import { DEFAULT_SEATS } from '../src/render/scenes.ts';
import { SELECTED_LAYOUT } from '../src/render/layouts/index.ts';
import { rewardOnDesk } from '../src/render/rewardDesk.ts';
import { LOGICAL_WIDTH } from '../src/render/map.ts';

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

/** True once the medal has been drawn on みのり's desk, half as big again as its own size. */
async function medalDrawn(page: Page): Promise<boolean> {
  if (PLACED === null) throw new Error('no desk for みのり');
  const piece = DECOR.medal;
  return (await drawnImages(page, 'decor')).some(
    (image) =>
      image.sx === piece.col * DECOR_TILE_SIZE &&
      image.sy === piece.row * DECOR_TILE_SIZE &&
      image.dx === PLACED.x &&
      image.dy === PLACED.y &&
      image.dw === DECOR_TILE_SIZE * PLACED.scale &&
      image.dh === DECOR_TILE_SIZE * PLACED.scale,
  );
}

const DECOR_SHEET = `data:image/png;base64,${readFileSync(
  path.resolve(import.meta.dirname, '../../../assets/decor/decor.png'),
).toString('base64')}`;

/**
 * The mean brightness of the opaque pixels of the lower half of the medal's picture (away from the
 * ✦), as the canvas shows them when the picture is drawn 1.5 times its size at PLACED, and in the
 * sheet. Issue #208: drawn over the shade of the time of day, nothing darkens them at night.
 */
async function medalBrightness(page: Page): Promise<{ drawn: number; own: number }> {
  if (PLACED === null) throw new Error('no desk for みのり');
  const piece = DECOR.medal;
  return page.getByRole('img', { name: 'ギルドの社屋' }).evaluate(
    async (element, input) => {
      if (!(element instanceof HTMLCanvasElement)) throw new Error('not a canvas');
      const sheet = new Image();
      sheet.src = input.sheet;
      await sheet.decode();
      const scratch = document.createElement('canvas');
      scratch.width = input.size;
      scratch.height = input.size;
      const cut = scratch.getContext('2d');
      const stage = element.getContext('2d');
      if (cut === null || stage === null) throw new Error('no 2d context');
      cut.drawImage(
        sheet,
        input.sx,
        input.sy,
        input.size,
        input.size,
        0,
        0,
        input.size,
        input.size,
      );
      const own = cut.getImageData(0, 0, input.size, input.size).data;
      const light = (d: ArrayLike<number>, i: number) =>
        0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      const scale = element.width / input.logicalWidth;
      const sums = { drawn: 0, own: 0, count: 0 };
      for (let y = input.size / 2; y < input.size; y += 1) {
        for (let x = 0; x < input.size; x += 1) {
          const i = (y * input.size + x) * 4;
          if (own[i + 3] !== 255) continue;
          const lx = input.x + (x + 0.5) * input.scale;
          const ly = input.y + (y + 0.5) * input.scale;
          const drawn = stage.getImageData(Math.floor(lx * scale), Math.floor(ly * scale), 1, 1);
          sums.drawn += light(drawn.data, 0);
          sums.own += light(own, i);
          sums.count += 1;
        }
      }
      if (sums.count === 0) throw new Error('no opaque pixel in the medal');
      return { drawn: sums.drawn / sums.count, own: sums.own / sums.count };
    },
    {
      sheet: DECOR_SHEET,
      sx: piece.col * DECOR_TILE_SIZE,
      sy: piece.row * DECOR_TILE_SIZE,
      size: DECOR_TILE_SIZE,
      x: PLACED.x,
      y: PLACED.y,
      scale: PLACED.scale,
      logicalWidth: LOGICAL_WIDTH,
    },
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

test('at night the medal is drawn half as big again, in its own colours over the shade', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasImageRecorder);
  await page.clock.setFixedTime(at('22:00:00'));
  snapshotServer.serve(await snapshotAt('22:00:00'));
  await page.goto('/');
  await waitForRoom(page);
  await expect.poll(() => medalDrawn(page)).toBe(true);
  const { drawn, own } = await medalBrightness(page);
  expect(Math.abs(drawn - own)).toBeLessThan(own * 0.05);
});
