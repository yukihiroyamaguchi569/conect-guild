// The one guest of five departments (Issue #108; seven on stage with かなめ, 2026-10-15). Runs only
// in the guests-5 project of playwright.config.ts, whose dev server reads the fictional settings
// e2e/settings/guests-5.json. /snapshot.json is the fictional guestsSnapshot of those settings.
import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { fictionalSettings, guestsSnapshot } from './guestsSnapshot.ts';
import { NOW } from './sampleSnapshot.ts';
import type { Locator, Page } from '@playwright/test';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import { guestTags } from '../src/render/guests.ts';
import { overlaps, spriteRect, type PxRect } from '../src/render/map.ts';
import { tileToPoint } from '../src/render/path.ts';

const SETTINGS = fictionalSettings('guests-5');
const SPRITE = 80;

/** A window's box in the canvas's logical px (the stage is the canvas, 1024 px wide). */
async function logicalBox(page: Page, window: Locator): Promise<PxRect> {
  const canvas = await page.getByRole('img', { name: 'ギルドの社屋' }).boundingBox();
  const box = await window.boundingBox();
  if (canvas === null || box === null) throw new Error('a window or the canvas has no box');
  const scale = 1024 / canvas.width;
  return {
    left: (box.x - canvas.x) * scale,
    top: (box.y - canvas.y) * scale,
    right: (box.x + box.width - canvas.x) * scale,
    bottom: (box.y + box.height - canvas.y) * scale,
  };
}

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasTextRecorder);
  await page.addInitScript(installCanvasImageRecorder);
  snapshotServer.serve(
    guestsSnapshot({ now: NOW, states: ['working', 'idle'], settings: SETTINGS }),
  );
});

test('the one guest stands at its spot, its name and counts clear of the windows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  await waitForRoom(page);
  const layout = layoutFor(5);
  expect(layout.guestSpots).toHaveLength(1);
  const spot = layout.guestSpots[0] ?? { col: 0, row: 0 };
  const feet = tileToPoint(spot);
  await expect
    .poll(async () => (await drawnImages(page, 'guest1')).map((image) => image.dx))
    .toContain(feet.x - SPRITE / 2);
  expect(await drawnImages(page, 'guest2')).toEqual([]);
  const texts = await drawnTexts(page);
  expect(texts).toEqual(expect.arrayContaining(['たびびと', 'Issue 3 / PR 1']));

  const windows = [
    await logicalBox(page, page.getByRole('region', { name: 'クエスト掲示板' })),
    await logicalBox(page, page.getByRole('region', { name: 'パーティのようす' })),
    await logicalBox(page, page.getByRole('region', { name: '取得のようす' })),
    await logicalBox(page, page.getByRole('region', { name: 'メッセージ' })),
  ];
  for (const area of windows) expect(overlaps(spriteRect(spot), area)).toBe(false);
  // Its tags, as drawn against the measured message window: on its line, above the window.
  const message = windows[3];
  if (message === undefined) throw new Error('no message window');
  const guest = {
    index: 0,
    name: 'たびびと',
    state: 'working',
    counts: { issues: 3, prs: 1 },
  } as const;
  for (const tag of guestTags(guest, feet, message)) {
    expect(tag.y + 5).toBeLessThanOrEqual(message.top);
  }
});
