import { describe, expect, it, vi } from 'vitest';
import { VISITOR_KINDS, visitsOn } from '../domain/visitors';
import { DEFAULT_SEATS } from './scenes';
import { createVisitorStage, visitorControls, type VisitorScene } from './visitorStage';
import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { ACTIVE_MEMBER_IDS } from '../guild.config';
import { levelTags } from './levelTags';
import { LOGICAL_WIDTH } from './map';
import { meet, overheadLift, WINDOWS, wordsBox } from './overhead';
import { tileToPoint } from './path';
import {
  planTrip,
  replyOf,
  VISITOR,
  VISITOR_LINES,
  VISITOR_REPLIES,
  visitorWordsSide,
} from './visitors';

const SPOKEN_TO = ACTIVE_MEMBER_IDS.filter((id) => id !== PRESIDENT_ID);

/** A click on the visitor (Issue #212): a reply over its head on the way. */

const DAY = { year: 2026, month: 10, day: 12 };
const [FIRST] = visitsOn(DAY);
if (FIRST === undefined) throw new Error('no visit on the day');
const WALL = new Date(2026, 9, 12, 0, 0).getTime() + FIRST.at * 60_000;
const QUIET: VisitorScene = { busy: false, free: [{ id: 'minori', seat: DEFAULT_SEATS.minori }] };
const BUSY: VisitorScene = { ...QUIET, busy: true };
const ALLOWED = /^[ぁ-ゖァ-ヺー〜！？…、♪]+$/u;

function stage(random: () => number = () => 0) {
  const onVisitor = vi.fn();
  return { visitors: createVisitorStage(() => WALL, { random, onVisitor }), onVisitor };
}

/** The first stage time from `from` on (every 100 ms) the visitor speaks at the seat. */
function talkStart(visitors: ReturnType<typeof stage>['visitors'], from = 0): number {
  for (let t = from; t < 120_000; t += 100) {
    if (visitors.frameAt(t, QUIET)?.words != null) return t;
  }
  throw new Error('never speaks');
}

describe('VISITOR_REPLIES', () => {
  const all = VISITOR_KINDS.flatMap((kind) => [...VISITOR_REPLIES[kind]]);

  it.each(all)('「%s」 is kana and a few signs only, 1 to 7 characters', (line) => {
    expect(line).toMatch(ALLOWED);
    expect(Array.from(line).length).toBeLessThanOrEqual(7);
  });

  it('gives every visitor three replies of its own, none of its words at the seat', () => {
    for (const kind of VISITOR_KINDS) expect(VISITOR_REPLIES[kind]).toHaveLength(3);
    const seat = VISITOR_KINDS.flatMap((kind) => [...VISITOR_LINES[kind]]);
    expect(new Set([...all, ...seat]).size).toBe(all.length + seat.length);
  });
});

describe('replyOf', () => {
  it('picks evenly among the replies but the one said just before', () => {
    expect(replyOf('merchant', null, 0)).toBe('かうかい？');
    expect(replyOf('merchant', null, 0.999)).toBe('おまけするよ！');
    expect(replyOf('merchant', 'かうかい？', 0)).toBe('みていって！');
    expect(replyOf('merchant', 'かうかい？', 0.999)).toBe('おまけするよ！');
    // Another visitor's reply leaves them all.
    expect(replyOf('postman', 'かうかい？', 0)).toBe('いそがしい！');
  });
});

describe('VisitorStage.reply', () => {
  it('says a reply over the head while walking in, for VISITOR.replyMs', () => {
    const { visitors } = stage();
    expect(visitors.frameAt(0, QUIET)?.words).toBeNull();
    expect(visitors.reply(500)).toBe(true);
    const words = visitors.frameAt(500, QUIET)?.words;
    expect(VISITOR_REPLIES[FIRST.kind]).toContain(words);
    expect(visitors.frameAt(500 + VISITOR.replyMs - 1, QUIET)?.words).toBe(words);
    expect(visitors.frameAt(500 + VISITOR.replyMs, QUIET)?.words).toBeNull();
  });

  it('never says the same reply twice in a row', () => {
    const { visitors } = stage(() => 0);
    visitors.frameAt(0, QUIET);
    const said = [100, 200, 300, 400].map((t) => {
      visitors.reply(t);
      return visitors.frameAt(t, QUIET)?.words;
    });
    for (let i = 1; i < said.length; i += 1) expect(said[i]).not.toBe(said[i - 1]);
  });

  it('drops a click while it speaks at the seat: its own words come first, none later', () => {
    const { visitors } = stage();
    const talk = talkStart(visitors);
    const words = visitors.frameAt(talk, QUIET)?.words;
    expect(visitors.reply(talk)).toBe(false);
    expect(visitors.frameAt(talk + 100, QUIET)?.words).toBe(words);
    // On the way out, no reply was kept for later.
    let t = talk;
    while (visitors.frameAt(t, QUIET)?.words != null) t += 100;
    expect(visitors.frameAt(t, QUIET)?.words).toBeNull();
    expect(visitors.reply(t)).toBe(true);
  });

  it('drops a click with nobody in the room, while halted, and once it turned back', () => {
    const empty = createVisitorStage(() => WALL - 60_000);
    expect(empty.frameAt(0, QUIET)).toBeNull();
    expect(empty.reply(0)).toBe(false);

    const halted = stage().visitors;
    halted.frameAt(0, QUIET);
    halted.setHalted(true, 100);
    expect(halted.reply(100)).toBe(false);

    const cut = stage().visitors;
    cut.frameAt(0, QUIET);
    cut.frameAt(500, BUSY);
    expect(cut.reply(600)).toBe(false);
    expect(cut.frameAt(600, BUSY)?.words ?? null).toBeNull();
  });

  it('drops a reply under way when the trip turns back', () => {
    const { visitors } = stage();
    visitors.frameAt(0, QUIET);
    expect(visitors.reply(500)).toBe(true);
    expect(visitors.frameAt(600, BUSY)?.words ?? null).toBeNull();
  });
});

describe('VisitorStage.drawn and onVisitor', () => {
  it('tells who was drawn where, and when it comes and goes', () => {
    const { visitors, onVisitor } = stage();
    expect(visitors.drawn()).toBeNull();
    const view = visitors.frameAt(0, QUIET);
    expect(visitors.drawn()).toEqual({ kind: FIRST.kind, feet: view?.feet });
    visitors.frameAt(100, QUIET);
    expect(onVisitor.mock.calls).toEqual([[FIRST.kind]]);
    visitors.clear();
    expect(visitors.drawn()).toBeNull();
    expect(onVisitor.mock.calls).toEqual([[FIRST.kind], [null]]);
  });
});

describe('visitorControls', () => {
  const loop = (paused: boolean) => ({
    schedule: { now: vi.fn() },
    paused: () => paused,
    stageNow: () => 500,
  });

  it('replies on the loop clock and draws the frame at once', () => {
    const { visitors } = stage();
    visitors.frameAt(0, QUIET);
    const running = loop(false);
    expect(visitorControls(visitors, running).answer()).toBe(true);
    expect(running.schedule.now).toHaveBeenCalledOnce();
  });

  it('drops a click while drawing would not be seen', () => {
    const { visitors } = stage();
    visitors.frameAt(0, QUIET);
    const paused = loop(true);
    expect(visitorControls(visitors, paused).answer()).toBe(false);
    expect(paused.schedule.now).not.toHaveBeenCalled();
    expect(visitors.frameAt(500, QUIET)?.words).toBeNull();
  });
});

describe('visitorWordsSide', () => {
  const levels = Object.fromEntries(ACTIVE_MEMBER_IDS.map((id) => [id, 12]));
  const tags = levelTags(levels, DEFAULT_SEATS);
  const longest = VISITOR_KINDS.flatMap((kind) => [...VISITOR_REPLIES[kind]]).reduce(
    (a, b) => (Array.from(b).length > Array.from(a).length ? b : a),
    '',
  );

  it.each(SPOKEN_TO)('keeps a reply on the canvas and off the windows on the way to %s', (id) => {
    const trip = planTrip({ kind: 'bard', say: 0 }, { id, seat: DEFAULT_SEATS[id] }, 0);
    if (trip === null) throw new Error(`no way to ${id}`);
    for (const tile of trip.segments.flatMap((segment) => segment.path)) {
      const feet = tileToPoint(tile);
      const lift = overheadLift({ point: feet, held: null }, longest, tags);
      const side = visitorWordsSide(feet, longest, lift);
      const box = wordsBox(feet, Array.from(longest).length, lift, side);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
      expect(WINDOWS.some((area) => meet(box, area))).toBe(false);
    }
  });
});
