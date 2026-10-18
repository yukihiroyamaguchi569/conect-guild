import type { Page } from '@playwright/test';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';
import { BLESSINGS } from '../src/render/blessing.ts';
import { CLICKABLES } from '../src/render/clickables.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';

/**
 * A click on the king on the throne (Issue #187): he says one of his words over his head, and the
 * button over him says it from the keyboard.
 */

const WORDS: ReadonlySet<string> = new Set(BLESSINGS);

/** The king's words written on the canvas so far, each once per place. */
async function saidWords(page: Page): Promise<string[]> {
  return (await drawnTexts(page)).filter((text) => WORDS.has(text));
}

/** The middle of the king on the canvas, in page px. */
async function kingOnPage(page: Page): Promise<{ x: number; y: number }> {
  const [king] = CLICKABLES;
  const box = await page.locator('canvas').boundingBox();
  if (king === undefined || box === null) throw new Error('no king or no canvas');
  const { rect } = king;
  return {
    x: box.x + (((rect.left + rect.right) / 2) * box.width) / LOGICAL_WIDTH,
    y: box.y + (((rect.top + rect.bottom) / 2) * box.height) / LOGICAL_HEIGHT,
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installCanvasTextRecorder);
});

test('the king says a word when clicked, and another from the keyboard', async ({
  page,
  snapshotServer,
}) => {
  // Without the sample's pull requests nothing waits for the king's approval: he may speak.
  snapshotServer.serve({ ...(await sampleSnapshot()), prs: [] });
  await page.goto('/');
  await waitForRoom(page);
  const canvas = page.locator('canvas');
  const at = await kingOnPage(page);
  await page.mouse.move(at.x, at.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => saidWords(page)).toHaveLength(1);
  const [first] = await saidWords(page);
  // Off the king the cursor is the plain one.
  await page.mouse.move(5, 5);
  await expect(canvas).toHaveCSS('cursor', 'auto');
  // The words last 2 s (SUMMONS.blessMs): a press after them says another word.
  const button = page.getByRole('button', { name: '王様に話しかける' });
  await expect
    .poll(
      async () => {
        await button.focus();
        await page.keyboard.press('Enter');
        return (await saidWords(page)).filter((words) => words !== first).length;
      },
      { timeout: 10_000, intervals: [500] },
    )
    .toBeGreaterThan(0);
});
