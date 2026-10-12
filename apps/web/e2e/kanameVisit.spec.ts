import type { SessionState, Snapshot, SnapshotIssue } from '@conect-guild/snapshot';
import type { Page } from '@playwright/test';
import { expect, test, waitForBaseline, waitForRoom, type SnapshotServer } from './fixtures.ts';
import { LOGICAL_WIDTH } from '../src/render/map.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/**
 * かなめ hears the king's order at the throne (Issue #87): alone, she walks to the side of the
 * throne and answers 「はっ！」 there; when a scroll for her comes in the same fetch, its scene goes
 * first and she answers at the counter, so the message and its scene stay together.
 */

declare global {
  interface Window {
    /** Where 「はっ！」 was written on the canvas (backing-store px), in drawing order. */
    e2eReplies?: { x: number; y: number }[];
  }
}

/** Runs in the page before the app: notes where each 「はっ！」 is written. */
function installReplyRecorder(): void {
  window.e2eReplies = [];
  const proto = CanvasRenderingContext2D.prototype;
  const original: unknown = Object.getOwnPropertyDescriptor(proto, 'fillText')?.value;
  if (typeof original !== 'function') return;
  proto.fillText = function (
    this: CanvasRenderingContext2D,
    ...args: Parameters<CanvasRenderingContext2D['fillText']>
  ) {
    const [text, x, y] = args;
    // The words are written relative to their bubble: the transform places them on the canvas.
    if (text === 'はっ！') {
      const at = this.getTransform().transformPoint({ x, y });
      window.e2eReplies?.push({ x: at.x, y: at.y });
    }
    Reflect.apply(original, this, args);
  };
}

/** Where 「はっ！」 was first written, in logical px (the canvas is scaled to its width). */
async function firstReply(page: Page): Promise<{ x: number; y: number }> {
  await expect
    .poll(() => page.evaluate(() => window.e2eReplies?.length ?? 0), { timeout: REPLY_TIMEOUT })
    .toBeGreaterThan(0);
  const { reply, width } = await page.evaluate(() => ({
    reply: window.e2eReplies?.[0],
    width: document.querySelector('canvas')?.width ?? 0,
  }));
  if (reply === undefined || width === 0) throw new Error('no reply');
  const scale = width / LOGICAL_WIDTH;
  return { x: reply.x / scale, y: reply.y / scale };
}

/** One refresh (5 s), the walk to the throne and the whisper (about 3.4 s), and some room. */
const REPLY_TIMEOUT = 15_000;

/** The sample read `seconds` after NOW, with かなめ's session in `state`. */
async function reading(
  seconds: number,
  state: SessionState,
  extra: readonly SnapshotIssue[] = [],
): Promise<Snapshot> {
  const snapshot = await sampleSnapshot(NOW + seconds * 1_000);
  const { sessions } = snapshot;
  if (sessions.status !== 'ok') throw new Error('the sample has no sessions');
  const members = sessions.members.map((member) =>
    member.department === null ? { ...member, state } : member,
  );
  return {
    ...snapshot,
    issues: [...snapshot.issues, ...extra],
    sessions: { ...sessions, members },
  };
}

/** A new quest for 経理: かなめ hands the scroll over. */
const scroll: SnapshotIssue = {
  number: 199,
  title: '架空の新しい依頼',
  labels: ['経理'],
  state: 'open',
  createdAt: new Date(NOW).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
  closedAt: null,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installReplyRecorder);
});

/** Loads the sample with かなめ waiting, then serves `next` (her session working) as a new fetch. */
async function orderAfterLoad(page: Page, server: SnapshotServer, next: Snapshot): Promise<void> {
  server.serve(await reading(0, 'idle'));
  await page.goto('/');
  await waitForRoom(page);
  await waitForBaseline(page);
  server.serve(next);
}

/**
 * Where 「はっ！」 is written over her (logical px): the side of the throne has her feet at 160, her
 * counter at 256 and sunk 30 more (render/map.ts, render/seating.ts). Halfway between them.
 */
const HALFWAY_Y = 140;

test('かなめ walks to the side of the throne and answers there when the order comes alone', async ({
  page,
  snapshotServer,
}) => {
  await orderAfterLoad(page, snapshotServer, await reading(5, 'working'));
  const reply = await firstReply(page);
  expect(reply.y).toBeLessThan(HALFWAY_Y);
});

test('かなめ answers at her counter when a scroll for her comes with the order', async ({
  page,
  snapshotServer,
}) => {
  await orderAfterLoad(page, snapshotServer, await reading(5, 'working', [scroll]));
  const reply = await firstReply(page);
  expect(reply.y).toBeGreaterThan(HALFWAY_Y);
});
