import type { Page } from '@playwright/test';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import type { MemberId } from '../src/guild.config.ts';
import { MEMBER_SEAT_CLICKABLES, type Clickable } from '../src/render/clickables.ts';
import { linesOf, type LineScene } from '../src/render/lineBook.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';

/**
 * A click on a member (Issue #191): they answer over their head with a line of what they do, and
 * the row of buttons over the members does the same from the keyboard.
 */

const ASKS: readonly LineScene[] = [
  'askWork',
  'askIdle',
  'askWait',
  'askDoze',
  'askSleep',
  'askPlay',
];

function memberOf(item: Clickable | undefined): MemberId {
  if (item?.id !== 'member') throw new Error('not a member');
  return item.member;
}

/** The answers of `id` written on the canvas so far, each once per place. */
async function answers(page: Page, id: MemberId): Promise<string[]> {
  const lines: ReadonlySet<string> = new Set(ASKS.flatMap((scene) => linesOf(id, scene)));
  return (await drawnTexts(page)).filter((text) => lines.has(text));
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

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasTextRecorder);
  snapshotServer.serve(await sampleSnapshot());
  await page.goto('/');
  await waitForRoom(page);
});

test('a member answers when clicked', async ({ page }) => {
  const [item] = MEMBER_SEAT_CLICKABLES;
  if (item === undefined) throw new Error('no member');
  const id = memberOf(item);
  expect(await answers(page, id)).toEqual([]);
  const at = await onPage(page, item);
  await page.mouse.move(at.x, at.y);
  await expect(page.locator('canvas')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => answers(page, id)).toHaveLength(1);
});

test('the arrows go along the members and Enter asks one', async ({ page }) => {
  const [first, second] = MEMBER_SEAT_CLICKABLES;
  if (first === undefined || second === undefined) throw new Error('too few members');
  const group = page.getByRole('group', { name: 'メンバー' });
  await expect(group.getByRole('button')).toHaveCount(MEMBER_SEAT_CLICKABLES.length);
  await group.getByRole('button', { name: first.label }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.locator('button[tabindex="0"]')).toHaveAttribute('aria-label', second.label);
  await page.keyboard.press('Enter');
  await expect.poll(() => answers(page, memberOf(second))).toHaveLength(1);
});
