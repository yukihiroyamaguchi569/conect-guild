// The king's quests told on the stage (Issue #142). Runs only in the president project of
// playwright.config.ts, whose dev server reads the fictional settings e2e/settings/president.json.
// /snapshot.json is the fictional guestsSnapshot with the king's Issues, served by the route of
// fixtures.ts; a later write adds one of them, and a third one takes it away again. The king says a
// word as he takes its scroll (Issue #146). Its clear (Issue #147) throws no confetti: the king says
// a word on the throne and かなめ answers.
import type { Page } from '@playwright/test';
import type { Snapshot } from '@conect-guild/snapshot';
import { drawnImages, installCanvasImageRecorder } from './canvasImages.ts';
import { drawnTexts, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForBaseline, waitForRoom } from './fixtures.ts';
import { fictionalSettings, guestsSnapshot } from './guestsSnapshot.ts';
import { NOW } from './sampleSnapshot.ts';
import { layoutFor } from '../src/render/layouts/catalog.ts';
import { LINE_BOOK } from '../src/render/lineBook.ts';
import { LOGICAL_WIDTH } from '../src/render/map.ts';
import { tileToPoint } from '../src/render/path.ts';

declare global {
  interface Window {
    /** Where confetti-coloured squares were filled (backing-store px), once recording is on. */
    e2eConfetti?: { x: number; y: number }[] | null;
  }
}

/** Runs in the page before the app: notes the squares of the confetti's colours once switched on. */
function installConfettiRecorder(): void {
  window.e2eConfetti = null;
  const colors = new Set(['#ff5f7e', '#4fd1ff', '#7ee07e']);
  const proto = CanvasRenderingContext2D.prototype;
  const original: unknown = Object.getOwnPropertyDescriptor(proto, 'fillRect')?.value;
  if (typeof original !== 'function') return;
  proto.fillRect = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['fillRect']>
  ) {
    const [x, y] = args;
    if (
      window.e2eConfetti != null &&
      typeof this.fillStyle === 'string' &&
      colors.has(this.fillStyle)
    ) {
      window.e2eConfetti.push(this.getTransform().transformPoint({ x, y }));
    }
    Reflect.apply(original, this, args);
  };
}

const SETTINGS = fictionalSettings('president');
const LAYOUT = layoutFor(SETTINGS.departments.length);
const SPRITE = 80;
/** One refresh (5 s), the hold of the message before and some room. */
const EVENT_TIMEOUT = 30_000;
const QUEST = { number: 31, title: '架空の勅命: 城の門を塗り直す' } as const;
const STANDING = { number: 30, title: '架空の勅命: 祭りの日取りを決める' } as const;

function reading(now: number, quests: readonly { number: number; title: string }[]): Snapshot {
  return {
    ...guestsSnapshot({ now, states: ['idle', 'idle'], settings: SETTINGS }),
    president: {
      issues: quests.map((quest, i) => ({
        ...quest,
        updatedAt: new Date(now - (i + 1) * 60_000).toISOString(),
      })),
    },
  };
}

/** Confetti squares filled over the throne since recording was switched on (logical px). */
async function confettiOverThrone(page: Page): Promise<number> {
  const { squares, width } = await page.evaluate(() => ({
    squares: window.e2eConfetti ?? [],
    width: document.querySelector('canvas')?.width ?? 0,
  }));
  if (width === 0) return 0;
  const scale = width / LOGICAL_WIDTH;
  const throne = tileToPoint(LAYOUT.kingSeat);
  return squares.filter(({ x, y }) => {
    const at = { x: x / scale, y: y / scale };
    return Math.abs(at.x - throne.x) <= 3 * 32 && at.y < throne.y && at.y > throne.y - 6 * 32;
  }).length;
}

test.beforeEach(async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasImageRecorder);
  await page.addInitScript(installConfettiRecorder);
  await page.addInitScript(installCanvasTextRecorder);
  snapshotServer.serve(reading(NOW, [STANDING]));
});

test('a new king’s quest is brought to the throne, and its clear is a word with no confetti', async ({
  page,
  snapshotServer,
}) => {
  // The clear waits until the king has held the scroll up and かなめ is back at the counter.
  test.setTimeout(60_000);
  await page.goto('/');
  await waitForBaseline(page);
  await waitForRoom(page);
  const message = page.getByRole('region', { name: 'メッセージ' });
  const king = page
    .getByRole('region', { name: 'パーティのようす' })
    .getByRole('listitem')
    .filter({ hasText: 'ゆきひろ' });
  await expect(king).toContainText('しごと中・やること 1 件');
  const said = (lines: readonly string[]) => async () =>
    (await drawnTexts(page)).some((text) => lines.includes(text));

  snapshotServer.serve(reading(NOW + 60_000, [QUEST, STANDING]));
  await expect(message).toContainText(
    `おうさまに クエスト#${String(QUEST.number)}「${QUEST.title}」が とどいた！`,
    { timeout: EVENT_TIMEOUT },
  );
  // かなめ stands beside the throne with the scroll.
  const side = tileToPoint(LAYOUT.places.throneSide);
  await expect
    .poll(async () =>
      (await drawnImages(page, 'kaname')).some(
        ({ dx, dy }) =>
          Math.abs(dx - (side.x - SPRITE / 2)) <= 2 && dy >= side.y - SPRITE && dy <= side.y,
      ),
    )
    .toBe(true);
  // The king says a word of his own as he takes the scroll on the throne (Issue #146).
  await expect.poll(said(LINE_BOOK.yukihiro.kingTakeScroll)).toBe(true);
  await expect(king).toContainText('しごと中・やること 2 件');

  await page.evaluate(() => {
    window.e2eConfetti = [];
  });
  snapshotServer.serve(reading(NOW + 120_000, [STANDING]));
  await expect(message).toContainText(
    `おうさまは クエスト#${String(QUEST.number)} を クリアした！`,
    {
      timeout: EVENT_TIMEOUT,
    },
  );
  await expect.poll(said(LINE_BOOK.yukihiro.kingClear)).toBe(true);
  // かなめ answers 0.4 s after the king's word is gone: by then confetti would have flown.
  await expect.poll(said(LINE_BOOK.kaname.seeKingClear)).toBe(true);
  expect(await confettiOverThrone(page)).toBe(0);
  await expect(king).toContainText('しごと中・やること 1 件');
});
