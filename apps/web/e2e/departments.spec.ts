// The offices of other department counts (Issue #18). Runs only in the departments-N projects of
// playwright.config.ts, whose dev servers read the fictional settings of e2e/settings (test-only
// mode of vite-plugin-settings.ts). Like demo.spec.ts it plays the demo and never serves
// /snapshot.json: any request for it fails the test.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { drawnLevels, installCanvasTextRecorder } from './canvasText.ts';
import { installFakeAudio } from './fakeAudio.ts';
import { waitForRoom } from './fixtures.ts';
import { DEMO_TITLES } from '../src/domain/demoScript.ts';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import type { TilePos } from '../src/render/layouts/types.ts';
import { overlaps, spriteRect, windowExtentsFor, type PxRect } from '../src/render/map.ts';

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

  // Nobody's seat and no guest spot is under a window as it is drawn, nor as the layout models it.
  const modelled = windowExtentsFor(layout);
  const spots: TilePos[] = [
    layout.commanderSeat,
    layout.kingSeat,
    ...layout.desks.map((desk) => desk.seat),
    ...layout.guestSpots,
  ];
  for (const spot of spots) {
    for (const area of [...Object.values(measured), ...Object.values(modelled)]) {
      expect(overlaps(spriteRect(spot), area), `${String(spot.col)},${String(spot.row)}`).toBe(
        false,
      );
    }
  }
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});
