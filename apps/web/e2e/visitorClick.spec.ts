import type { Page } from '@playwright/test';
import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { visitsOn } from '../src/domain/visitors.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';
import { VISITOR_NAMES, VISITOR_REPLIES } from '../src/render/visitors.ts';

/**
 * A click on the visitor (Issue #212): it replies over its head on the way in, from the mouse where
 * it is drawn and from its button while it is in the room. The day is the sample snapshot's
 * (Tokyo time, playwright.config.ts timezoneId), as in visitors.spec.ts.
 */

const [FIRST] = visitsOn({ year: 2026, month: 10, day: 12 });
if (FIRST === undefined) throw new Error('no visit on the day');
const TOKYO_MIDNIGHT = Date.parse('2026-10-11T15:00:00.000Z');
const LABEL = `${VISITOR_NAMES[FIRST.kind]}に話しかける`;
const REPLIES: readonly string[] = VISITOR_REPLIES[FIRST.kind];

async function openAt(page: Page, minute: number): Promise<void> {
  await page.clock.setFixedTime(TOKYO_MIDNIGHT + minute * 60_000);
  await page.addInitScript(installCanvasImageRecorder);
  await page.addInitScript(installCanvasTextRecorder);
  await page.goto('/');
  await waitForRoom(page);
}

const replies = async (page: Page) =>
  (await drawnTexts(page)).filter((text) => REPLIES.includes(text));

test('the visitor replies to Enter on its button, which is there only while it is in', async ({
  page,
}) => {
  await openAt(page, FIRST.at - 5);
  await expect.poll(async () => (await drawnImages(page, 'kaname')).length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: LABEL })).toHaveCount(0);

  await page.clock.setFixedTime(TOKYO_MIDNIGHT + FIRST.at * 60_000 + 30_000);
  const button = page.getByRole('button', { name: LABEL });
  await expect(button).toHaveCount(1, { timeout: 10_000 });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => replies(page)).toHaveLength(1);
  // Gone again once it left.
  await expect(button).toHaveCount(0, { timeout: 60_000 });
});

test('a click on the visitor where it is drawn has it reply', async ({ page }) => {
  await openAt(page, FIRST.at + 0.5);
  const file = `visitor-${FIRST.kind}`;
  await expect.poll(async () => (await drawnImages(page, file)).length).toBeGreaterThan(1);
  const last = (await drawnImages(page, file)).at(-1);
  const box = await page.locator('canvas').boundingBox();
  if (last === undefined || box === null) throw new Error('no visitor or no canvas');
  const x = box.x + ((last.dx + last.dw / 2) * box.width) / LOGICAL_WIDTH;
  const y = box.y + ((last.dy + last.dh * 0.6) * box.height) / LOGICAL_HEIGHT;
  await page.mouse.click(x, y);
  await expect.poll(() => replies(page)).toHaveLength(1);
});
