import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { Snapshot } from '@conect-guild/snapshot';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** localStorage key of the diff baseline (app/guildStore.ts). */
export const BASELINE_KEY = 'conect-guild:baseline';

/** Marks the responses the tests served, so one that came from the dev server stands out. */
const SERVED_HEADER = 'x-e2e-snapshot';

export interface SnapshotServer {
  /** What /snapshot.json returns from the next request on (the collector's next write). */
  serve(snapshot: Snapshot): void;
  /** Answers an empty response of `status` from the next request on (204: not collected yet). */
  failWith(status: number): void;
}

interface GuildFixtures {
  /** Console errors and uncaught page errors; every test ends by checking there are none. */
  pageErrors: string[];
  /** Answers every /snapshot.json request of the test; starts with the sample. */
  snapshotServer: SnapshotServer;
}

/**
 * Every test starts from the sample snapshot at a fixed time (page.clock fixes Date only; the
 * timers still run, so the 5-second refresh works as in the app).
 */
export const test = base.extend<GuildFixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => {
        errors.push(`page: ${error.message}`);
      });
      await page.clock.setFixedTime(NOW);
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
  /**
   * The dev server's /snapshot.json would read apps/web/.data, where the collector may keep real
   * data. The context route answers every such request instead, and the test fails if any response
   * reached the page without the route's mark (one that came from the dev server).
   */
  snapshotServer: [
    async ({ context, page }, use) => {
      let current: Snapshot | number = await sampleSnapshot();
      await context.route('**/snapshot.json', (route) => {
        const headers = { 'Cache-Control': 'no-store', [SERVED_HEADER]: '1' };
        return typeof current === 'number'
          ? route.fulfill({ status: current, body: '', headers })
          : route.fulfill({ json: current, headers });
      });
      const responses: boolean[] = [];
      page.on('response', (response) => {
        if (new URL(response.url()).pathname === '/snapshot.json')
          responses.push(response.headers()[SERVED_HEADER] === '1');
      });
      await use({
        serve: (snapshot) => {
          current = snapshot;
        },
        failWith: (status) => {
          current = status;
        },
      });
      expect(responses.length).toBeGreaterThan(0);
      expect(responses.filter((served) => !served)).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export interface CanvasStats {
  /** Distinct colours among the sampled pixels. */
  readonly colors: number;
  /** Mean luminance of the sampled pixels, 0 to 255. */
  readonly brightness: number;
}

/** Samples the canvas pixels (every 7th, to stay quick on large canvases). */
export function canvasStats(canvas: Locator): Promise<CanvasStats> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('not a canvas');
    const context = element.getContext('2d');
    if (context === null) throw new Error('no 2d context');
    const { data } = context.getImageData(0, 0, element.width, element.height);
    const colors = new Set<number>();
    let sum = 0;
    let count = 0;
    for (let i = 0; i + 2 < data.length; i += 4 * 7) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      colors.add((r << 16) | (g << 8) | b);
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count += 1;
    }
    return { colors: colors.size, brightness: count === 0 ? 0 : sum / count };
  });
}

/** Waits until the canvas shows the room (the art loads asynchronously). */
export async function waitForRoom(page: Page): Promise<CanvasStats> {
  const canvas = page.getByRole('img', { name: 'ギルドの社屋' });
  await expect.poll(async () => (await canvasStats(canvas)).colors).toBeGreaterThan(50);
  return canvasStats(canvas);
}

/** Waits until the first fetch stored the diff baseline (later changes then become events). */
export async function waitForBaseline(page: Page, timeout?: number): Promise<void> {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), BASELINE_KEY), { timeout })
    .not.toBeNull();
}

/** The ▼ of the message window while it tells the narration (no event message is shown). */
const NARRATION_BUTTON = 'つぎの ようす';
/** Shown only before the first snapshot; afterwards the narration takes its place. */
const NOTHING_YET = 'あたらしい できごとは まだ ない。';

/**
 * Checks that the message window tells the narration, not an event message (its ▼ is then
 * 「つぎの ようす」). The narration's words depend on chance and the time (they may even say
 * 「クリアした！」 about the past week), so only the window's state and a non-empty line are checked.
 */
export async function expectNarration(page: Page, timeout?: number): Promise<void> {
  const window = page.getByRole('region', { name: 'メッセージ' });
  await expect(window.getByRole('button', { name: NARRATION_BUTTON })).toBeVisible({ timeout });
  await expect(window).not.toContainText(NOTHING_YET);
  await expect(window.getByRole('paragraph')).toHaveText(/\S/);
}
