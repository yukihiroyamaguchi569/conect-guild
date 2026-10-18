import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { visitsOn } from '../src/domain/visitors.ts';
import { VISITOR_LINES } from '../src/render/visitors.ts';

/**
 * A visitor drops in at the time of the day's first visit (Issue #195): its picture comes in at
 * the door and it says one of its words at a seat. The day is the sample snapshot's (Tokyo time,
 * playwright.config.ts timezoneId).
 */

const [FIRST] = visitsOn({ year: 2026, month: 10, day: 12 });
const TOKYO_MIDNIGHT = Date.parse('2026-10-11T15:00:00.000Z');

test('a visitor comes in at its time and says a word at a seat', async ({ page }) => {
  if (FIRST === undefined) throw new Error('no visit on the day');
  await page.clock.setFixedTime(TOKYO_MIDNIGHT + FIRST.at * 60_000 + 30_000);
  await page.addInitScript(installCanvasImageRecorder);
  await page.addInitScript(installCanvasTextRecorder);
  await page.goto('/');
  await waitForRoom(page);
  const file = `visitor-${FIRST.kind}`;
  await expect.poll(async () => (await drawnImages(page, file)).length).toBeGreaterThan(0);
  const words: readonly string[] = VISITOR_LINES[FIRST.kind];
  await expect
    .poll(async () => (await drawnTexts(page)).filter((text) => words.includes(text)), {
      timeout: 20_000,
    })
    .toHaveLength(1);
});

test('no visitor comes between the visits', async ({ page }) => {
  if (FIRST === undefined) throw new Error('no visit on the day');
  await page.clock.setFixedTime(TOKYO_MIDNIGHT + (FIRST.at - 5) * 60_000);
  await page.addInitScript(installCanvasImageRecorder);
  await page.goto('/');
  await waitForRoom(page);
  await page.waitForTimeout(2_000);
  expect(await drawnImages(page, 'visitor-')).toEqual([]);
});
