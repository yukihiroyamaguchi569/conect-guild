// The one guest of five departments (Issue #108; seven on stage with かなめ, 2026-10-15). Runs only
// in the guests-5 project of playwright.config.ts, whose dev server reads the fictional settings
// e2e/settings/guests-5.json. /snapshot.json is the fictional guestsSnapshot of those settings.
import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { refuseStorage, showEveryNote, withOldUnreadableSessions } from './everyNote.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { fictionalSettings, guestsSnapshot } from './guestsSnapshot.ts';
import { NOW } from './sampleSnapshot.ts';
import type { Locator, Page } from '@playwright/test';
import { layoutFor } from '../src/render/layouts/catalog.ts';
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

test('the one guest stands at its spot, clear of the windows, with no name or counts', async ({
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
  // The round table in front of it, drawn half a tile left and 24 px above its cells
  // (decorPoint, Issue #122).
  const table = layout.decor.find((item) => item.name === 'round-table');
  if (table === undefined) throw new Error('no round table');
  expect(await drawnImages(page, 'decor')).toContainEqual(
    expect.objectContaining({ dx: table.col * 32 - 16, dy: table.row * 32 - 24 }),
  );
  // No name or counts under it (Issue #122).
  const texts = await drawnTexts(page);
  for (const text of ['たびびと', 'Issue 3 / PR 1']) expect(texts).not.toContain(text);

  const windows = [
    await logicalBox(page, page.getByRole('region', { name: 'クエスト掲示板' })),
    await logicalBox(page, page.getByRole('region', { name: 'パーティのようす' })),
    await logicalBox(page, page.getByRole('region', { name: '取得のようす' })),
    await logicalBox(page, page.getByRole('region', { name: 'メッセージ' })),
  ];
  for (const area of windows) expect(overlaps(spriteRect(spot), area)).toBe(false);
});

test('the guest stays clear of the windows with every rare note shown (Issue #132)', async ({
  page,
  snapshotServer,
  pageErrors,
}) => {
  // A day old, sessions unreadable, localStorage refusing, then a failed fetch: every note.
  snapshotServer.serve(
    withOldUnreadableSessions(
      guestsSnapshot({ now: NOW, states: ['working', 'idle'], settings: SETTINGS }),
    ),
  );
  await page.addInitScript(refuseStorage);
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  await waitForRoom(page);
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await showEveryNote(fetch, () => {
    snapshotServer.failWith(500);
  });
  await expect(fetch).toHaveClass(/fetch--tab/);

  const spot = layoutFor(5).guestSpots[0] ?? { col: 0, row: 0 };
  for (const name of ['クエスト掲示板', 'パーティのようす', '取得のようす', 'メッセージ']) {
    const area = await logicalBox(page, page.getByRole('region', { name }));
    expect(overlaps(spriteRect(spot), area), name).toBe(false);
  }
  // Chrome logs the failed fetch as a console error: expected here, so the fixture sees the rest.
  const rest = pageErrors.filter(
    (error) => !/^console: Failed to load resource: .* status of 500 /.test(error),
  );
  pageErrors.splice(0, pageErrors.length, ...rest);
});

test('the お客さん section stays whole under many quests; only the quests scroll (Issue #121)', async ({
  page,
  snapshotServer,
}) => {
  const base = guestsSnapshot({ now: NOW, states: ['working', 'idle'], settings: SETTINGS });
  const labels = SETTINGS.departments.map((department) => department.label);
  const at = new Date(NOW - 3_600_000).toISOString();
  const issues = Array.from({ length: 14 }, (_, i) => ({
    number: 301 + i,
    title: `架空のクエスト その ${String(i + 1)}`,
    labels: [labels[i % labels.length] ?? ''],
    state: 'open' as const,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  }));
  snapshotServer.serve({ ...base, issues });
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board).toContainText('架空のクエスト その 14');

  const boardBox = await logicalBox(page, board);
  const guests = await logicalBox(page, board.getByRole('region', { name: 'お客さん' }));
  // The whole section (name, three items and 「ほか 1 件」) inside the board as drawn.
  await expect(board.getByRole('region', { name: 'お客さん' })).toContainText('ほか 1 件');
  expect(guests.top).toBeGreaterThan(boardBox.top);
  expect(guests.bottom).toBeLessThanOrEqual(boardBox.bottom);
  // The quest list scrolls instead.
  const scrolls = await board
    .locator('.board__list')
    .evaluate((list) => list.scrollHeight > list.clientHeight);
  expect(scrolls).toBe(true);
});
