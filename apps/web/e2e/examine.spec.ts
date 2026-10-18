import type { Page } from '@playwright/test';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import { CLICKABLES, type Clickable } from '../src/render/clickables.ts';
import { THINGS } from '../src/render/examine.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';

/**
 * A click on a thing of the room (Issue #190): the message window tells what was found in it, and
 * the row of buttons over the things does the same from the keyboard (one stop of Tab, the arrows
 * along it).
 */

const ITEMS = CLICKABLES.filter((item) => item.id === 'thing');

/** Every line examining `item` may tell. */
function linesOf(item: Clickable): readonly string[] {
  if (item.id !== 'thing') throw new Error('not a thing');
  const { usual, rare } = THINGS[item.thing];
  return [...usual, ...rare];
}

/** The middle of `item` on the canvas, in page px. */
async function onPage(page: Page, item: Clickable): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const { rect } = item;
  return {
    x: box.x + (((rect.left + rect.right) / 2) * box.width) / LOGICAL_WIDTH,
    y: box.y + (((rect.top + rect.bottom) / 2) * box.height) / LOGICAL_HEIGHT,
  };
}

/** True when the message window tells one of the lines of examining `item`. */
async function tells(page: Page, item: Clickable): Promise<boolean> {
  const text = await page.getByRole('region', { name: 'メッセージ' }).locator('p').textContent();
  return linesOf(item).includes((text ?? '').trim());
}

test.beforeEach(async ({ page, snapshotServer }) => {
  snapshotServer.serve(await sampleSnapshot());
  await page.goto('/');
  await waitForRoom(page);
});

test('the window tells what was in a thing clicked', async ({ page }) => {
  const [item] = ITEMS;
  if (item === undefined) throw new Error('nothing to examine');
  const at = await onPage(page, item);
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('canvas')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => tells(page, item)).toBe(true);
});

test('the arrows go along the things and Enter examines one', async ({ page }) => {
  const [first, second] = ITEMS;
  if (first === undefined || second === undefined) throw new Error('too few things');
  const group = page.getByRole('group', { name: 'へやの こもの' });
  // One stop of Tab: only the first button is reached by it.
  await expect(group.getByRole('button')).toHaveCount(ITEMS.length);
  await expect(group.locator('button[tabindex="0"]')).toHaveCount(1);
  await group.getByRole('button', { name: first.label }).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.locator('button[tabindex="0"]')).toHaveAttribute('aria-label', second.label);
  await page.keyboard.press('Enter');
  await expect.poll(() => tells(page, second)).toBe(true);
});
