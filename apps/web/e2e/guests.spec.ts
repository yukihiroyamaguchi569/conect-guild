// The guests (Issue #108). Runs only in the guests project of playwright.config.ts, whose dev
// server reads the fictional settings e2e/settings/guests.json (four departments, two guests).
// /snapshot.json is the fictional guestsSnapshot, served by the route of fixtures.ts.
import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder, strokedTexts } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { FIRST_GUEST_OPEN, guestsSnapshot, SECOND_GUEST_OPEN } from './guestsSnapshot.ts';
import { NOW } from './sampleSnapshot.ts';
import { decorDraw } from '../src/render/decorArt.ts';
import { benchPoint, guestFeet } from '../src/render/guests.ts';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import { tileToPoint } from '../src/render/path.ts';

/** The collector's next write, a minute after the first. */
const LATER = NOW + 60_000;
/** One refresh (5 s) and room for the message to show. */
const EVENT_TIMEOUT = 20_000;

const SPRITE = 80;

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasTextRecorder);
  await page.addInitScript(installCanvasImageRecorder);
  snapshotServer.serve(guestsSnapshot({ now: NOW, states: ['working', 'awaiting-permission'] }));
});

test('the board lists the guests’ open Issues and PRs with their titles', async ({ page }) => {
  await page.goto('/');
  const guests = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('region', { name: 'お客さん' });
  await expect(guests).toContainText('たびびと');
  // The three most recently updated, and how many more.
  for (const item of FIRST_GUEST_OPEN.slice(0, 3)) {
    await expect(guests).toContainText(`#${String(item.number)}`);
    await expect(guests).toContainText(item.title);
  }
  await expect(guests).not.toContainText(FIRST_GUEST_OPEN[3].title);
  await expect(guests).toContainText('ほか 1 件');
  await expect(guests).toContainText('ぼうけんしゃ');
  await expect(guests).toContainText(SECOND_GUEST_OPEN[0].title);
});

test('the guests stand at their spots, with no name or counts under them', async ({ page }) => {
  await page.goto('/');
  await waitForRoom(page);
  const layout = layoutFor(4);
  for (const [index, file] of ['guest1', 'guest2'].entries()) {
    const feet = tileToPoint(layout.guestSpots[index] ?? { col: 0, row: 0 });
    await expect
      .poll(async () => (await drawnImages(page, file)).map((image) => image.dx))
      .toContain(feet.x - SPRITE / 2);
    const tops = (await drawnImages(page, file)).map((image) => image.dy);
    // At most the reading bob (1 px) below the spot.
    expect(tops.every((dy) => dy >= feet.y - SPRITE && dy <= feet.y - SPRITE + 1)).toBe(true);
  }
  // The second guest waits for a permission: the 「?」 over her.
  await expect.poll(async () => drawnTexts(page)).toContain('?');
  // No name or counts on the canvas (the president, 2026-10-15, Issue #122): the board lists them.
  const texts = [...(await drawnTexts(page)), ...(await strokedTexts(page))];
  for (const text of ['たびびと', 'Issue 3 / PR 1', 'ぼうけんしゃ', 'Issue 0 / PR 1']) {
    expect(texts).not.toContain(text);
  }
});

test('each guest is drawn in front of its bench (Issue #182)', async ({ page }) => {
  await page.goto('/');
  await waitForRoom(page);
  const layout = layoutFor(4);
  const picture = decorDraw('bench');
  for (const [index, file] of ['guest1', 'guest2'].entries()) {
    const feet = guestFeet(layout.guestSpots[index] ?? { col: 0, row: 0 });
    const bench = benchPoint(feet);
    const order = async () => {
      const drawn = await drawnImages(page, '');
      const benchAt = drawn.findIndex(
        (image) =>
          image.file.startsWith('decor') &&
          image.sx === picture.sx &&
          image.sy === picture.sy &&
          image.dx === bench.x &&
          image.dy === bench.y,
      );
      const bodyAt = drawn.findIndex(
        (image) => image.file.startsWith(file) && image.dx === feet.x - SPRITE / 2,
      );
      return benchAt >= 0 && bodyAt > benchAt;
    };
    await expect.poll(order).toBe(true);
  }
});

test('the guests still show when the small things cannot be loaded', async ({ page }) => {
  // Not a picture: decoding fails and the stage falls back to plain boxes (loadArt.ts).
  await page.route('**/decor.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' }),
  );
  await page.goto('/');
  await waitForRoom(page);
  await expect.poll(async () => (await drawnImages(page, 'guest1')).length).toBeGreaterThan(0);
  expect(await drawnImages(page, 'decor')).toEqual([]);
});

test('a guest’s merged PR is told in the message window', async ({ page, snapshotServer }) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board).toContainText('たびびと');
  // The first snapshot is the baseline: nothing to tell yet.
  const message = page.getByRole('region', { name: 'メッセージ' });
  await expect(message).not.toContainText('マージされた');

  snapshotServer.serve(
    guestsSnapshot({
      now: LATER,
      states: ['resting', 'idle'],
      recent: [
        {
          kind: 'pr-merged',
          number: 16,
          title: '架空の薬棚を組み立てる',
          at: new Date(LATER).toISOString(),
        },
      ],
    }),
  );
  await expect(message).toContainText(
    'たびびと の PR #16「架空の薬棚を組み立てる」がマージされた',
    {
      timeout: EVENT_TIMEOUT,
    },
  );
});
