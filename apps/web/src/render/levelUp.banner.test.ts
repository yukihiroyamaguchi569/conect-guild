import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import { createCalls } from './calls';
import { EMPTY_DIRECTOR, frameAt, scheduleEvent } from './director';
import { drawLevelUpBanners, type BannerContext } from './drawLevelUp';
import { bannerAt, bannerPoint, LEVEL_UP } from './levelUp';
import { OVERHEAD_TOP } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/** "LEVEL UP" and the answer to the king's call over the same head (Issue #19 review). */

const context = { seats: DEFAULT_SEATS, random: () => 0.5 };
const minoriUp: GuildEvent = {
  id: 'level-up:経理#4',
  kind: 'level-up',
  number: 4,
  department: '経理',
};

/** Where each "LEVEL UP" was written (text, x, y), as a 2D context records it. */
function recordingContext() {
  const written: { text: string; x: number; y: number }[] = [];
  const ctx: BannerContext = {
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineJoin: 'miter',
    strokeStyle: '#000000',
    fillStyle: '#000000',
    globalAlpha: 1,
    save: () => undefined,
    restore: () => undefined,
    strokeText: () => undefined,
    fillText: (text: string, x: number, y: number) => {
      written.push({ text, x, y });
    },
  };
  return { written, ctx };
}

/** The stage at `t`: みのり went up a level at 0; the king called her at `calledAt` (or never). */
function stageAt(t: number, calledAt: number | null) {
  const director = scheduleEvent(EMPTY_DIRECTOR, minoriUp, 0, context);
  const calls = createCalls({ wallNow: () => 0 });
  if (calledAt !== null) calls.add(['minori'], calledAt);
  // Each call's state moves on frame by frame, as the loop draws.
  let view = calls.view(() => frameAt(director, 0, DEFAULT_SEATS), 0);
  for (let at = 50; at <= t; at += 50) {
    view = calls.view(() => frameAt(director, at, DEFAULT_SEATS), at);
  }
  return view;
}

describe('bannerPoint', () => {
  const origin = { x: 100, y: 200 };
  const banner = { rise: 5, alpha: 1 };

  it('stands over the confetti while nobody answers', () => {
    expect(bannerPoint(origin, banner, null)).toEqual({ x: 100, y: 195 });
  });

  it('goes over the top of the answer bubble', () => {
    const feet = { x: 100, y: 200 + OVERHEAD_TOP - 40 };
    const at = bannerPoint(origin, banner, feet);
    expect(at.y).toBe(feet.y - OVERHEAD_TOP - LEVEL_UP.bannerGapPx - banner.rise);
  });

  it('never goes lower than over the confetti', () => {
    expect(bannerPoint(origin, banner, { x: 100, y: 10_000 })).toEqual({ x: 100, y: 195 });
  });
});

/** Nobody waits, remarks or murmurs. */
const QUIET = { bubbles: {}, remarks: {}, murmurs: {} } as const;

describe('drawLevelUpBanners with the king calling', () => {
  // The answer 「はっ！」 comes 2.1 s after the call, while "LEVEL UP" still shows (2.6 s).
  const T = 2_300;

  it('writes "LEVEL UP" above the bubble of 「はっ！」 when the answer comes during it', () => {
    const view = stageAt(T, 0);
    expect(view.speeches.minori).toBe('はっ！');
    const minori = view.frame.members.find((m) => m.id === 'minori');
    if (minori === undefined) throw new Error('no minori');
    const { written, ctx } = recordingContext();
    drawLevelUpBanners(ctx, { ...view, ...QUIET, tags: [] });
    expect(written.map((w) => w.text)).toEqual(['LEVEL UP']);
    // The bottom of the words is over the top of the bubble.
    expect(written[0]?.y).toBeLessThan(minori.pose.point.y - OVERHEAD_TOP);
  });

  it('writes it in its usual place without a call', () => {
    const view = stageAt(T, null);
    const { written, ctx } = recordingContext();
    drawLevelUpBanners(ctx, { ...view, ...QUIET, tags: [] });
    const [confetti] = view.frame.confetti;
    const banner = bannerAt(T);
    if (confetti === undefined || banner === null) throw new Error('no level-up');
    expect(written[0]?.y).toBe(Math.round(confetti.origin.y - banner.rise));
  });
});
