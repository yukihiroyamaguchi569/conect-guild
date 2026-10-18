import type { Page } from '@playwright/test';
import { DECOR, DECOR_TILE_SIZE } from '../../../assets/decor/decor';
import { drawnImages, forgetDrawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';
import { CLICKABLES } from '../src/render/clickables.ts';
import { decorPoint } from '../src/render/decorPoint.ts';
import { SELECTED_LAYOUT } from '../src/render/layouts/index.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';
import { ornamentOf, ornamentPlacement } from '../src/render/ornament.ts';

/**
 * The month's ornament (Issue #192): October's pumpkin stands in the room and tells what it is when
 * clicked; once the month turns, the page left open, November's stands there and tells its own.
 */

const ORNAMENT = CLICKABLES.find((item) => item.id === 'thing' && item.thing === 'ornament');

/** True once the ornament of `month` has been drawn at its place. */
async function drawn(page: Page, month: number): Promise<boolean> {
  const placement = ornamentPlacement(SELECTED_LAYOUT.ornamentSpot, month);
  const { x, y } = decorPoint(placement);
  const piece = DECOR[placement.name];
  return (await drawnImages(page, 'decor')).some(
    (image) =>
      image.sx === piece.col * DECOR_TILE_SIZE &&
      image.sy === piece.row * DECOR_TILE_SIZE &&
      image.dx === x &&
      image.dy === y,
  );
}

/** Clicks the ornament, and says what the message window tells then. */
async function clickOrnament(page: Page): Promise<string> {
  if (ORNAMENT === undefined) throw new Error('no ornament');
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const { rect } = ORNAMENT;
  await page.mouse.click(
    box.x + (((rect.left + rect.right) / 2) * box.width) / LOGICAL_WIDTH,
    box.y + (((rect.top + rect.bottom) / 2) * box.height) / LOGICAL_HEIGHT,
  );
  const text = await page.getByRole('region', { name: 'メッセージ' }).locator('p').textContent();
  return (text ?? '').trim();
}

test('the month’s ornament stands, tells what it is, and changes with the month', async ({
  page,
  snapshotServer,
}) => {
  await page.addInitScript(installCanvasImageRecorder);
  snapshotServer.serve(await sampleSnapshot());
  await page.goto('/');
  await waitForRoom(page);

  // NOW is in October (Tokyo): the pumpkin.
  await expect.poll(() => drawn(page, 10)).toBe(true);
  await expect.poll(() => clickOrnament(page)).toBe(ornamentOf(10).line);

  // The page left open past midnight into November (Tokyo), with a snapshot of then.
  const november = Date.parse('2026-11-01T00:00:05+09:00');
  expect(november).toBeGreaterThan(NOW);
  await page.clock.setFixedTime(november);
  snapshotServer.serve(await sampleSnapshot(november));
  await expect.poll(() => drawn(page, 11)).toBe(true);
  // From then on the frames draw November's alone: October's is gone.
  await forgetDrawnImages(page);
  await expect.poll(() => drawn(page, 11)).toBe(true);
  expect(await drawn(page, 10)).toBe(false);
  await expect.poll(() => clickOrnament(page)).toBe(ornamentOf(11).line);
});

test('the ornament is one of the room’s things for the keyboard', async ({
  page,
  snapshotServer,
}) => {
  snapshotServer.serve(await sampleSnapshot());
  await page.goto('/');
  await waitForRoom(page);
  const group = page.getByRole('group', { name: 'へやの こもの' });
  await group.getByRole('button', { name: 'かざりを しらべる' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'メッセージ' }).locator('p')).toHaveText(
    ornamentOf(10).line,
  );
});
