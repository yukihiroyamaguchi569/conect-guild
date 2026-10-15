import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import { EMPTY_DIRECTOR, frameAt, isAnimating, scheduleEvent } from './director';
import { linesOf } from './lineBook';
import type { PickLine } from './lines';
import { PLACES } from './map';
import { LINES } from './metrics';
import { carry, raise, type Segment } from './motion';
import {
  actorOf,
  castOf,
  DEFAULT_SEATS,
  HANDOVER_MS,
  HOLD_UP_MS,
  PICK_UP_MS,
  planScene,
  RECEIVE_MS,
  type Track,
} from './scenes';

/**
 * Issue #142: かなめ brings the king's quest to the throne. Issue #147: its clear is no confetti,
 * only the king's word on the throne and かなめ's answer at the reception.
 */

const event = (kind: GuildEventKind, number = 7): GuildEvent => ({
  id: `${kind}#${String(number)}`,
  kind,
  number,
  department: null,
});

/** Tosses whenever it may (toss.ts): the king's scroll is still walked over. */
const context = { seats: DEFAULT_SEATS, random: () => 0.5, tossRandom: () => 0 };

function trackOf(tracks: readonly Track[], actor: string): Track {
  const track = tracks.find((t) => t.actor === actor);
  if (track === undefined) throw new Error(`no track for ${actor}`);
  return track;
}

const tiles = (segments: readonly Segment[]) => segments.flatMap((s) => s.path);

describe('actorOf / castOf: the king’s quests', () => {
  it('makes the king the actor, with かなめ for the scroll and for the answer on a clear', () => {
    expect(actorOf(event('king-quest-opened'))).toBe('yukihiro');
    expect(actorOf(event('king-quest-cleared'))).toBe('yukihiro');
    expect(castOf(event('king-quest-opened'))).toEqual(['yukihiro', 'kaname']);
    expect(castOf(event('king-quest-cleared'))).toEqual(['yukihiro', 'kaname']);
  });
});

describe('planScene: king-quest-opened', () => {
  const scene = planScene(event('king-quest-opened'), 1_000, context);
  const kaname = trackOf(scene.tracks, 'kaname');
  const king = trackOf(scene.tracks, 'yukihiro');

  it('walks the scroll to the side of the throne (never tossed) and back to the counter', () => {
    expect(scene.flights).toEqual([]);
    expect(scene.bursts).toEqual([]);
    const [pickUp, there, ...rest] = kaname.segments;
    expect(pickUp?.held).toEqual(carry('scroll'));
    expect(pickUp?.end).toBe(1_000 + PICK_UP_MS);
    expect(there?.held).toEqual(carry('scroll'));
    expect(there?.path.at(-1)).toEqual(PLACES.throneSide);
    expect(rest.at(-1)?.path.at(-1)).toEqual(DEFAULT_SEATS.kaname);
  });

  it('has the king take it on the throne halfway through the stop, then hold it up', () => {
    const arrived = kaname.segments[1]?.end ?? Number.NaN;
    const handover = arrived + HANDOVER_MS / 2;
    expect(tiles(king.segments).every((t) => t.col === DEFAULT_SEATS.yukihiro.col)).toBe(true);
    expect(tiles(king.segments).every((t) => t.row === DEFAULT_SEATS.yukihiro.row)).toBe(true);
    const taking = king.segments.find((s) => s.held !== null);
    expect(taking).toMatchObject({
      start: handover,
      end: handover + RECEIVE_MS,
      held: carry('scroll'),
    });
    expect(king.segments.at(-1)).toMatchObject({
      start: handover + RECEIVE_MS,
      end: handover + RECEIVE_MS + HOLD_UP_MS,
      held: raise('scroll'),
    });
    expect(scene.turns).toEqual([
      { actor: 'kaname', scene: 'handOver', at: arrived },
      { actor: 'yukihiro', scene: 'kingTakeScroll', at: handover + RECEIVE_MS },
    ]);
  });

  it('takes about as long as a handover to a desk (8–16 s)', () => {
    const end = Math.max(...scene.tracks.map((t) => t.segments.at(-1)?.end ?? 0));
    expect(end - 1_000).toBeGreaterThan(8_000);
    expect(end - 1_000).toBeLessThan(16_000);
  });
});

describe('planScene: king-quest-cleared', () => {
  it('throws no confetti and moves nobody: the king speaks, then かなめ', () => {
    const scene = planScene(event('king-quest-cleared'), 2_000, context);
    expect(scene.tracks).toEqual([]);
    expect(scene.flights).toEqual([]);
    expect(scene.bursts).toEqual([]);
    expect(scene.turns).toEqual([
      { actor: 'yukihiro', scene: 'kingClear', at: 2_000 },
      { actor: 'kaname', scene: 'seeKingClear', at: 2_000 + LINES.clearMs + LINES.kingGapMs },
    ]);
  });

  it('shows かなめ’s answer 0.4 s after the king’s word is gone, and ends with it', () => {
    /** The first line of each moment (the random numbers are injected through the picker). */
    const pick: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;
    const director = scheduleEvent(EMPTY_DIRECTOR, event('king-quest-cleared'), 0, {
      ...context,
      pickLine: pick,
    });
    const answer = LINES.clearMs + LINES.kingGapMs;
    expect(director.bursts).toEqual([]);
    expect(director.busyUntil).toEqual({});
    expect(frameAt(director, 0, DEFAULT_SEATS).lines).toEqual({ yukihiro: 'おわったぞ！' });
    expect(frameAt(director, LINES.clearMs, DEFAULT_SEATS).lines).toEqual({});
    expect(frameAt(director, answer - 1, DEFAULT_SEATS).lines).toEqual({});
    expect(frameAt(director, answer, DEFAULT_SEATS).lines).toEqual({ kaname: 'さすがです' });
    expect(isAnimating(director, answer + LINES.kingMs - 1)).toBe(true);
    expect(isAnimating(director, answer + LINES.kingMs)).toBe(false);
  });
});
