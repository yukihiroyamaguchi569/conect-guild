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
import { refuseStorage, showEveryNote, withOldUnreadableSessions } from './everyNote.ts';
import { guestsSnapshot } from './guestsSnapshot.ts';
import { bubbleBox } from '../src/render/overhead.ts';
import { tileToPoint } from '../src/render/path.ts';
import { DEMO_TITLES } from '../src/domain/demoScript.ts';
import { faceColors } from '../src/domain/faceColor.ts';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import type { TilePos } from '../src/render/layouts/types.ts';
import {
  BOARD_MAX_CQW,
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

/** `box` inside `area`, give or take the browser's rounding (half a px). */
function expectWithin(box: PxRect, area: PxRect): void {
  expect(box.left).toBeGreaterThanOrEqual(area.left - 0.5);
  expect(box.top).toBeGreaterThanOrEqual(area.top - 0.5);
  expect(box.right).toBeLessThanOrEqual(area.right + 0.5);
  expect(box.bottom).toBeLessThanOrEqual(area.bottom + 0.5);
}

/** The bubble over each desk's seat (the 「?」, standing) clear of every one of `areas`. */
function expectBubblesClear(desks: readonly { seat: TilePos }[], areas: readonly PxRect[]): void {
  for (const { seat } of desks) {
    const bubble = bubbleBox(tileToPoint(seat), { voice: 'glyph', chars: 1 }, 'right', 0);
    for (const area of areas) {
      expect(overlaps(bubble, area), `${String(seat.col)},${String(seat.row)}`).toBe(false);
    }
  }
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

  // The fetch status is a tab on the message window, not in the column (Issue #132).
  const measured = {
    board: await logicalBox(page, page.getByRole('region', { name: 'クエスト掲示板' })),
    party: await logicalBox(page, page.getByRole('region', { name: 'パーティのようす' })),
    message: await logicalBox(page, page.getByRole('region', { name: 'メッセージ' })),
    tab: await logicalBox(page, page.getByRole('region', { name: '取得のようす' })),
  };
  // The right-hand column ends above the layout's measured bottom (render/layouts), its rows
  // packed for seven or eight of them (five and six departments).
  expect(measured.party.bottom).toBeLessThanOrEqual(layout.partyWindow.bottom);
  const partyClass = await page
    .getByRole('region', { name: 'パーティのようす' })
    .getAttribute('class');
  expect(partyClass?.includes('party--dense')).toBe(layout.partyWindow.dense === true);

  const modelled = windowExtentsFor(layout);
  expectWithin(measured.tab, modelled.tab);
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
  // No exception any more: layout5's guest went with Issue #132.
  const areas = [...Object.values(measured), ...Object.values(modelled)];
  for (const spot of spots) {
    for (const area of areas) {
      expect(overlaps(spriteRect(spot), area), `${String(spot.col)},${String(spot.row)}`).toBe(
        false,
      );
    }
  }
  // The bubble over every desk's seat is clear of the windows as drawn (むすび's, Issue #121).
  expectBubblesClear(layout.desks, Object.values(measured));
  expect(snapshotRequests).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * The live screen on a fictional snapshot of these settings, a day old with its sessions
 * unreadable, then a failed fetch; localStorage refuses every write and removal, so the effects
 * note and the failed baseline clear show too (everyNote.ts).
 */
async function openWithEveryNote(page: Page, context: BrowserContext, count: number) {
  let failing = false;
  const snapshot = withOldUnreadableSessions(
    guestsSnapshot({
      now: Date.now(),
      states: ['idle', 'idle'],
      settings: fictionalSettings(count),
    }),
  );
  await context.route('**/snapshot.json', (route) =>
    failing ? route.fulfill({ status: 500, body: '' }) : route.fulfill({ json: snapshot }),
  );
  await context.route('**/collector-status.json', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  await page.addInitScript(refuseStorage);
  await page.goto('/');
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await showEveryNote(fetch, () => {
    failing = true;
  });
  return fetch;
}

test('the fetch status keeps every note on one line as the tab (Issues #121, #132)', async ({
  page,
  context,
}) => {
  const count = departmentCount();
  const layout = layoutFor(count);
  const tabArea = windowExtentsFor(layout).tab;
  await page.setViewportSize({ width: 1024, height: 576 });
  const fetch = await openWithEveryNote(page, context, count);
  await expect(fetch).toHaveClass(/fetch--tab/);
  // The notes no longer make the column taller: it ends above the layout's bottom, and every
  // desk's bubble is clear of it.
  const party = await logicalBox(page, page.getByRole('region', { name: 'パーティのようす' }));
  expect(party.bottom).toBeLessThanOrEqual(layout.partyWindow.tallestBottom);
  expectBubblesClear(layout.desks, [party]);

  // One line inside the modelled tab, every box in it within the tab's height.
  expectWithin(await logicalBox(page, fetch), tabArea);
  const boxes = await fetch.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    return [...element.querySelectorAll('*')]
      .map((child) => child.getBoundingClientRect())
      .filter((box) => box.height > 0)
      .map((box) => box.top >= outer.top - 0.5 && box.bottom <= outer.bottom + 0.5);
  });
  expect(boxes.length).toBeGreaterThanOrEqual(8);
  expect(boxes.every(Boolean)).toBe(true);
  // The buttons are whole and inside the tab; the notes give way to an ellipsis, their text in
  // the tooltip.
  const tabBox = await logicalBox(page, fetch);
  for (const name of ['基準を消す', /音を/, /音量/]) {
    const button = fetch.getByRole('button', { name });
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expectWithin(await logicalBox(page, button), tabBox);
  }
  await expect(fetch.getByRole('status')).toHaveAttribute('title', /取得失敗/);
  // Some note did not fit: it ends in an ellipsis of its own text, the whole of it in the title.
  const notes = await fetch.locator('.fetch__note, .fetch__failure').evaluateAll((elements) =>
    elements.map((element) => ({
      cut: element.scrollWidth > element.clientWidth,
      ellipsis: getComputedStyle(element).textOverflow,
      whole: (element.getAttribute('title') ?? '').startsWith(element.textContent.trim()),
    })),
  );
  expect(notes.some((note) => note.cut)).toBe(true);
  for (const note of notes.filter((n) => n.cut))
    expect(note).toEqual({ cut: true, ellipsis: 'ellipsis', whole: true });
});

/** The fetch status drawn as the ordinary window: a bottom edge, in the right-hand column or stacked. */
async function expectOrdinaryFetch(page: Page): Promise<void> {
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toHaveCSS('border-bottom-style', 'double');
  await expect(fetch).not.toHaveCSS('white-space', 'nowrap');
}

test('the fetch status is the ordinary window on a narrow screen (Issue #121)', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 700, height: 900 });
  const { errors } = await openDemo(page, context);
  await expect(page.getByRole('region', { name: 'パーティのようす' })).toBeVisible();
  await expectOrdinaryFetch(page);
  expect(errors).toEqual([]);
});

test('the fetch status goes back to the column when the screen halts (Issue #121)', async ({
  page,
  context,
}) => {
  const count = departmentCount();
  await page.setViewportSize({ width: 1024, height: 576 });
  // A snapshot of another repository halts the screen: no message window for the tab to sit on.
  const snapshot = {
    ...guestsSnapshot({
      now: Date.now(),
      states: ['idle', 'idle'],
      settings: fictionalSettings(count),
    }),
    repo: 'example-owner/another-guild',
  };
  await context.route('**/snapshot.json', (route) => route.fulfill({ json: snapshot }));
  await context.route('**/collector-status.json', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('収集の対象と設定が違います');
  await expectOrdinaryFetch(page);
  await expect(
    page.locator('.stage__side').getByRole('region', { name: '取得のようす' }),
  ).toBeVisible();
});
