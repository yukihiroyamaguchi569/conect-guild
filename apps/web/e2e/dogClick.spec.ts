import type { Page } from '@playwright/test';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import { CLICKABLES } from '../src/render/clickables.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';
import { BARK } from '../src/render/petting.ts';

/**
 * A click on the sleeping pet (Issue #186): it wakes, wags its tail and says 「わん」, and the
 * button over it does the same from the keyboard.
 */

/** How many times 「わん」 was written on the canvas so far (once per place). */
async function barks(page: Page): Promise<number> {
  return (await drawnTexts(page)).filter((text) => text === BARK).length;
}

/** The middle of the pet on the canvas, in page px. */
async function dogOnPage(page: Page): Promise<{ x: number; y: number }> {
  const dog = CLICKABLES.find((item) => item.id === 'dog');
  const box = await page.locator('canvas').boundingBox();
  if (dog === undefined || box === null) throw new Error('no pet or no canvas');
  const { rect } = dog;
  return {
    x: box.x + (((rect.left + rect.right) / 2) * box.width) / LOGICAL_WIDTH,
    y: box.y + (((rect.top + rect.bottom) / 2) * box.height) / LOGICAL_HEIGHT,
  };
}

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasTextRecorder);
  snapshotServer.serve(await sampleSnapshot());
  await page.goto('/');
  await waitForRoom(page);
});

test('the pet says 「わん」 when clicked', async ({ page }) => {
  const canvas = page.locator('canvas');
  expect(await barks(page)).toBe(0);
  const at = await dogOnPage(page);
  await page.mouse.move(at.x, at.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => barks(page)).toBe(1);
});

test('the pet says 「わん」 from the keyboard', async ({ page }) => {
  expect(await barks(page)).toBe(0);
  const button = page.getByRole('button', { name: '犬をなでる' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => barks(page)).toBe(1);
});
