// The offices of other department counts (Issue #18). Runs only in the departments-N projects of
// playwright.config.ts, whose dev servers read the fictional settings of e2e/settings (test-only
// mode of vite-plugin-settings.ts). Like demo.spec.ts it plays the demo and never serves
// /snapshot.json: any request for it fails the test.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import type { MemberId } from '@conect-guild/snapshot/settings';
import { drawnLevels, installCanvasTextRecorder } from './canvasText.ts';
import { installFakeAudio } from './fakeAudio.ts';
import { waitForRoom } from './fixtures.ts';
import { DEMO_TITLES } from '../src/domain/demoScript.ts';
import { faceColors } from '../src/domain/faceColor.ts';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import type { TilePos } from '../src/render/layouts/types.ts';
import {
  BOARD_MAX_CQW,
  isPartyExceptionIn,
  overlaps,
  spriteRect,
  windowExtentsFor,
  type PxRect,
} from '../src/render/map.ts';

/** The department count of this project (playwright.config.ts metadata). */
function departmentCount(): number {
  const count: unknown = test.info().project.metadata.departmentCount;
  if (typeof count !== 'number') throw new Error('run in a departments-N project');
  return count;
}

function fictionalSettings(count: number) {
  const file = path.resolve(import.meta.dirname, 'settings', `departments-${String(count)}.json`);
  return checkGuildSettings(JSON.parse(readFileSync(file, 'utf8')));
}

/** The first scroll is handed out about 5 s after はじめる (domain/demoScript.ts). */
const FIRST_EVENT_TIMEOUT = 15_000;

async function openDemo(page: Page, context: BrowserContext) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`page: ${error.message}`);
  });
  const snapshotRequests: string[] = [];
  await context.route('**/snapshot*.json', (route) => {
    snapshotRequests.push(route.request().url());
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(installFakeAudio);
  await page.addInitScript(installCanvasTextRecorder);
  await page.goto('/?demo=1');
  return { errors, snapshotRequests };
}

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

test('the demo plays in the office of this many departments', async ({ page, context }) => {
  const count = departmentCount();
  const settings = fictionalSettings(count);
  const { errors, snapshotRequests } = await openDemo(page, context);

  // A row for かなめ, each department and the king, with the fictional settings' names.
  const rows = page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem');
  await expect(rows).toHaveCount(count + 2);
  for (const [i, department] of settings.departments.entries()) {
    const name = settings.members[department.member]?.name ?? '';
    await expect(rows.nth(i + 1)).toContainText(name);
    await expect(rows.nth(i + 1)).toContainText(department.label);
  }

  // The room seats かなめ and one member per desk, each with a 「Lv N」 under them.
  await waitForRoom(page);
  await expect.poll(async () => (await drawnLevels(page)).length).toBe(count + 1);

  await page.getByRole('button', { name: '▶ はじめる' }).click();
  // The first quest goes to the first department, with its first fictional title.
  const first = DEMO_TITLES[0]?.[0]?.issue ?? '';
  await expect(page.getByRole('region', { name: 'メッセージ' })).toContainText(`「${first}」`, {
    timeout: FIRST_EVENT_TIMEOUT,
  });
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toContainText(first);
  // Its member takes the quest up.
  await expect(rows.nth(1)).toContainText('作業中');

  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

/** `#rrggbb` as the browser computes a CSS colour: `rgb(r, g, b)`. */
function cssRgb(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

test('each face in the party window is filled with the hair colour (Issue #120)', async ({
  page,
  context,
}) => {
  const settings = fictionalSettings(departmentCount());
  const { errors, snapshotRequests } = await openDemo(page, context);
  const ids: MemberId[] = [
    'kaname',
    ...settings.departments.map((department) => department.member),
    'yukihiro',
  ];
  const rows = page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem');
  await expect(rows).toHaveCount(ids.length);
  for (const [i, id] of ids.entries()) {
    const { fill, ink } = faceColors(id);
    const face = rows.nth(i).locator('.member__face');
    await expect(face).toHaveCSS('background-color', cssRgb(fill));
    await expect(face).toHaveCSS('color', cssRgb(ink));
  }
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('the windows stay where the layout keeps the seats clear of them', async ({
  page,
  context,
}) => {
  const count = departmentCount();
  const layout = layoutFor(count);
  // At 1024 px wide the stage is the canvas's logical size.
  await page.setViewportSize({ width: 1024, height: 576 });
  const { errors, snapshotRequests } = await openDemo(page, context);
  await waitForRoom(page);
  await expect(
    page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem'),
  ).toHaveCount(count + 2);

  const party = await logicalBox(page, page.getByRole('region', { name: 'パーティのようす' }));
  const fetch = await logicalBox(page, page.getByRole('region', { name: '取得のようす' }));
  const measured = {
    board: await logicalBox(page, page.getByRole('region', { name: 'クエスト掲示板' })),
    party: { ...party, bottom: fetch.bottom },
    message: await logicalBox(page, page.getByRole('region', { name: 'メッセージ' })),
  };
  // The right-hand column ends above the layout's measured bottom (render/layouts), its rows
  // packed for seven or eight of them (five and six departments).
  expect(measured.party.bottom).toBeLessThanOrEqual(layout.partyWindow.bottom);
  const partyClass = await page
    .getByRole('region', { name: 'パーティのようす' })
    .getAttribute('class');
  expect(partyClass?.includes('party--dense')).toBe(layout.partyWindow.dense === true);

  const modelled = windowExtentsFor(layout);
  // The quest board scrolls from the layout's max-height on (five and six departments: lower).
  const maxHeight = await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .evaluate((board) => getComputedStyle(board).maxHeight);
  expect(Number.parseFloat(maxHeight)).toBeCloseTo(
    (layout.boardMaxCqw ?? BOARD_MAX_CQW) * 10.24,
    0,
  );

  // Nobody's seat and no guest spot is under a window as it is drawn, nor as the layout models it.
  const spots: TilePos[] = [
    layout.commanderSeat,
    layout.kingSeat,
    ...layout.desks.map((desk) => desk.seat),
    ...layout.guestSpots,
  ];
  for (const spot of spots) {
    // The party window may cover the tiles the layout lists (layout6's sales desk, layout5's guest).
    const areas = isPartyExceptionIn(layout, spot)
      ? [measured.board, measured.message, modelled.board, modelled.message]
      : [...Object.values(measured), ...Object.values(modelled)];
    for (const area of areas) {
      expect(overlaps(spriteRect(spot), area), `${String(spot.col)},${String(spot.row)}`).toBe(
        false,
      );
    }
  }
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});
