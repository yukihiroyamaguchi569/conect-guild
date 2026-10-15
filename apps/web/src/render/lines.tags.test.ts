import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import type { DepartmentLabel, MemberId } from '../guild.config';
import { createAmbientSeeds } from './ambient';
import { EMPTY_DIRECTOR, frameAt, scheduleEvent, type Director, type MemberPose } from './director';
import { idlePose, type IdlePose } from './idle';
import { PLAY_SPOTS } from './idleSpots';
import { levelTags, type LevelTag } from './levelTags';
import { linesOf, type LineScene, type SpokenLine } from './lineBook';
import type { PickLine } from './lines';
import { TILE_SIZE } from './metrics';
import { MS_PER_TILE, walkSegment } from './motion';
import { playScene } from './murmurs';
import type { Box } from './overhead';
import { bodyBox, placeOverheads, placedBox, type Placed } from './overheadPlace';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TALLEST_WINDOW_EXTENTS } from './map';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import { NO_HOLDS, speechesAt, summonsEnd, withSummons, type SpeechLine } from './summons';

/**
 * The members' line bubbles never meet the 「Lv N」 tags on the desks (levelTags.ts, Issue #19):
 * every moment of every scene, for every department, walked or tossed.
 */

/** A tag's text (bold 10 px, 「Lv 99」 about 28 px wide) with its 1 px outline. */
function tagBox(tag: LevelTag): Box {
  return { left: tag.x - 16, right: tag.x + 16, top: tag.y - 7, bottom: tag.y + 7 };
}

function meet(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const LEVEL_TAGS = levelTags(
  { kaname: 99, minori: 99, hibiki: 99, hirame: 99, sasae: 99 },
  DEFAULT_SEATS,
);
const TAGS = LEVEL_TAGS.map(tagBox);

/** The longest line of each moment, the worst case for the width. */
function longest(actor: MemberId, scene: LineScene): SpokenLine | null {
  return (
    linesOf(actor, scene).toSorted((a, b) => Array.from(b).length - Array.from(a).length)[0] ?? null
  );
}
const pick: PickLine = (actor, scene) => longest(actor, scene);

function event(kind: GuildEventKind, department: DepartmentLabel | null): GuildEvent {
  return { id: `${kind}#1`, kind, number: 1, department };
}

const CASES = (['issue-opened', 'pr-merged', 'issue-closed'] as const).flatMap((kind) =>
  ([null, '経理', '広報', '企画', '総務'] as const).flatMap((label) =>
    [0, 0.99].map((toss) => ({ kind, label, toss })),
  ),
);

const WINDOWS = Object.values(TALLEST_WINDOW_EXTENTS);

/**
 * Where words over `member` go among `members` (overheadPlace.ts: over the head, or
 * beside an item held up), said as a line or as the words of the king's call.
 */
function wordsBoxOf(
  members: readonly MemberPose[],
  member: MemberPose,
  said: { readonly line: SpokenLine } | { readonly speech: SpeechLine },
): Placed {
  const sources = {
    speeches: 'speech' in said ? { [member.id]: said.speech } : {},
    lines: 'line' in said ? { [member.id]: said.line } : {},
    remarks: {},
    bubbles: {},
    murmurs: {},
  };
  const placed = placeOverheads(members, sources, LEVEL_TAGS).find((p) => p.id === member.id);
  if (placed === undefined) throw new Error(`nothing over ${member.id}`);
  return placed;
}

/** How many words were placed beside an item held up, over all the checks (Issue #77). */
const beside = { count: 0 };

/** Asserts that words over `member` meet no tag nor HTML window and stay on the canvas. */
function expectClear(
  members: readonly MemberPose[],
  member: MemberPose,
  said: { readonly line: SpokenLine } | { readonly speech: SpeechLine },
  t: number,
): void {
  const words = 'line' in said ? said.line : said.speech;
  const placed = wordsBoxOf(members, member, said);
  const boxes = [placedBox(placed)];
  if (placed.spot === 'beside-right' || placed.spot === 'beside-left') {
    beside.count += 1;
    // Beside the item, the words keep clear of everyone else (overheadPlace.ts).
    const others = members.filter((m) => m.id !== member.id).map((m) => bodyBox(m.pose.point));
    const hit = others.filter((body) => boxes.some((box) => meet(box, body)));
    expect({ who: member.id, t, hit }).toEqual({ who: member.id, t, hit: [] });
  }
  const met = TAGS.filter((tag) => boxes.some((box) => meet(box, tag)));
  expect({ who: member.id, t, met }).toEqual({ who: member.id, t, met: [] });
  const under = WINDOWS.filter((area) => boxes.some((box) => meet(box, area)));
  expect({ who: member.id, t, words, under }).toEqual({ who: member.id, t, words, under: [] });
  for (const box of boxes) {
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(LOGICAL_WIDTH);
    expect(box.bottom).toBeLessThanOrEqual(LOGICAL_HEIGHT);
  }
}

/**
 * Every 5 ms from `from` to `end` (a walker, a tile in MS_PER_TILE, moves under a pixel in that
 * time: checked below), and every start and
 * end of a segment, a line and their last moment before, so no contact between samples is missed.
 */
const STEP_MS = 5;

function momentsOf(director: Director, end: number, from = 0): number[] {
  const edges = [
    ...director.tracks.flatMap((track) => track.segments.flatMap((s) => [s.start, s.end])),
    ...director.lines.flatMap((said) => [said.start, said.end]),
  ].flatMap((at) => [at - 1, at]);
  const steps = Array.from(
    { length: Math.ceil((end - from) / STEP_MS) },
    (_, i) => from + i * STEP_MS,
  );
  return [...new Set([...steps, ...edges])].filter((t) => t >= from && t < end);
}

/** Checks every line of `director` shown from `from` to `end`; how many were checked. */
function checkLines(director: Director, end: number, from = 0): number {
  let checked = 0;
  for (const t of momentsOf(director, end, from)) {
    const frame = frameAt(director, t, DEFAULT_SEATS);
    for (const member of frame.members) {
      const line = frame.lines[member.id];
      if (line === undefined) continue;
      expectClear(frame.members, member, { line }, t);
      checked += 1;
    }
  }
  return checked;
}

function contextFor(toss: number): SceneContext {
  return { seats: DEFAULT_SEATS, random: () => 0.5, tossRandom: () => toss, pickLine: pick };
}

describe('line bubbles and level tags', () => {
  it('samples finer than a pixel of walking', () => {
    expect((TILE_SIZE / MS_PER_TILE) * STEP_MS).toBeLessThan(1);
  });

  it('has tags to check', () => {
    expect(TAGS).toHaveLength(5);
  });

  it.each(CASES)('$kind for $label (toss draw $toss): no bubble meets a tag', (c) => {
    const director = scheduleEvent(EMPTY_DIRECTOR, event(c.kind, c.label), 0, contextFor(c.toss));
    const end = Math.max(...director.lines.map((said) => said.end));
    let checked = 0;
    for (const t of momentsOf(director, end)) {
      const frame = frameAt(director, t, DEFAULT_SEATS);
      for (const member of frame.members) {
        const line = frame.lines[member.id];
        if (line === undefined) continue;
        expectClear(frame.members, member, { line }, t);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the king’s word on his clear and かなめ’s answer (Issue #147)', () => {
  it('meet no tag, no window and no edge, and the king’s is clear of みのり’s bubble', () => {
    const clear = {
      id: 'king-quest-cleared#1',
      kind: 'king-quest-cleared',
      number: 1,
      department: null,
    } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, clear, 0, contextFor(0));
    expect(director.lines.map((said) => said.actor)).toEqual(['yukihiro', 'kaname']);
    const end = Math.max(...director.lines.map((said) => said.end));
    expect(checkLines(director, end)).toBeGreaterThan(0);
    // みのり, at the desk down left of the throne, says her longest remark while the king speaks.
    const members = frameAt(director, 0, DEFAULT_SEATS).members;
    const king = members.find((m) => m.id === 'yukihiro');
    const minori = members.find((m) => m.id === 'minori');
    if (king === undefined || minori === undefined) throw new Error('no king or みのり');
    const kingWords = longest('yukihiro', 'kingClear');
    if (kingWords === null) throw new Error('no word for the king');
    const kingBox = placedBox(wordsBoxOf(members, king, { line: kingWords }));
    for (const scene of ['clear', ...WAITS, 'work', 'idle'] as const) {
      const line = longest('minori', scene);
      if (line === null) continue;
      const box = placedBox(wordsBoxOf(members, minori, { line }));
      expect({ scene, meet: meet(kingBox, box) }).toEqual({ scene, meet: false });
    }
  });
});

describe('the king’s word as he takes the scroll of his quest (Issue #146)', () => {
  it('meets no tag, no window and no edge, and is clear of みのり’s bubble', () => {
    const opened = {
      id: 'king-quest-opened#1',
      kind: 'king-quest-opened',
      number: 1,
      department: null,
    } as const;
    const director = scheduleEvent(EMPTY_DIRECTOR, opened, 0, contextFor(0));
    const said = director.lines.find((line) => line.actor === 'yukihiro');
    if (said === undefined) throw new Error('no word for the king');
    expect(linesOf('yukihiro', 'kingTakeScroll')).toContain(said.line);
    const end = Math.max(...director.lines.map((line) => line.end));
    expect(checkLines(director, end)).toBeGreaterThan(0);
    // みのり, at the desk down left of the throne, says her longest remark while the king speaks.
    for (const t of [said.start, said.end - 1]) {
      const members = frameAt(director, t, DEFAULT_SEATS).members;
      const king = members.find((m) => m.id === 'yukihiro');
      const minori = members.find((m) => m.id === 'minori');
      if (king === undefined || minori === undefined) throw new Error('no king or みのり');
      const kingBox = placedBox(wordsBoxOf(members, king, { line: said.line }));
      for (const scene of ['clear', ...WAITS, 'work', 'idle'] as const) {
        const line = longest('minori', scene);
        if (line === null) continue;
        const box = placedBox(wordsBoxOf(members, minori, { line }));
        expect({ t, scene, meet: meet(kingBox, box) }).toEqual({ t, scene, meet: false });
      }
    }
  });
});

describe('words said holding an item up (Issue #77)', () => {
  it('go beside the item in the scenes above (the takers hold scrolls and chests up)', () => {
    // The scenes of 'line bubbles and level tags' ran first in this file.
    expect(beside.count).toBeGreaterThan(0);
  });
});

const EVERYONE: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae'];

describe('the words of the king’s call and level tags', () => {
  const scenes = [
    { name: 'no scene', director: EMPTY_DIRECTOR },
    ...CASES.map((c) => ({
      name: `${c.kind} for ${String(c.label)} (toss draw ${String(c.toss)})`,
      director: scheduleEvent(EMPTY_DIRECTOR, event(c.kind, c.label), 0, contextFor(c.toss)),
    })),
  ];

  /** Checks the words over everyone at `t` of a call to everyone starting at `start`; how many. */
  function checkCall(director: Director, start: number, t: number): number {
    const list = [{ start, members: EVERYONE }];
    const frame = withSummons(frameAt(director, t, DEFAULT_SEATS), list, t, {
      seats: DEFAULT_SEATS,
      holds: NO_HOLDS,
    });
    const speeches = speechesAt(list, t);
    let checked = 0;
    for (const member of frame.members) {
      const speech = speeches[member.id];
      if (speech === undefined) continue;
      expectClear(frame.members, member, { speech }, t);
      checked += 1;
    }
    return checked;
  }

  it.each(scenes)('$name: calling everyone at any moment, no word meets a tag', ({ director }) => {
    let checked = 0;
    for (const start of [0, 2_000, 4_000, 6_000, 8_000]) {
      const end = summonsEnd({ start, members: EVERYONE });
      for (const t of momentsOf(director, end, start)) checked += checkCall(director, start, t);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('line bubbles and level tags when scenes overlap', () => {
  const DEPARTMENTS = ['経理', '広報', '企画', '総務'] as const;
  const COMBINED = DEPARTMENTS.flatMap((label) =>
    (['issue-opened', 'pr-merged'] as const).flatMap((kind) =>
      [0, 0.99].map((toss) => ({ label, kind, toss })),
    ),
  );

  it.each(COMBINED)(
    '$kind for $label (toss draw $toss) with a clear at any second of it: no bubble meets a tag',
    ({ label, kind, toss }) => {
      const first = scheduleEvent(EMPTY_DIRECTOR, event(kind, label), 0, contextFor(toss));
      const sceneEnd = Math.max(...first.tracks.map((track) => track.segments.at(-1)?.end ?? 0));
      let checked = 0;
      for (let at = 0; at < sceneEnd; at += 1_000) {
        const both = scheduleEvent(first, event('issue-closed', label), at, contextFor(toss));
        const end = Math.max(...both.lines.map((said) => said.end));
        checked += checkLines(both, end, at);
      }
      expect(checked).toBeGreaterThan(0);
    },
  );
});

const WAITS = ['awaitPresident', 'awaitKaname', 'awaitPermission'] as const;

describe('the king’s own words (Issue #28) on the throne', () => {
  it('shout 「！」 and whisper 「ゴニョゴニョ」 clear of the tags, the windows and the edges', () => {
    const members = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members;
    const king = members.find((m) => m.id === 'yukihiro');
    if (king === undefined) throw new Error('no king');
    for (const speech of ['！', 'ゴニョゴニョ'] as const) expectClear(members, king, { speech }, 0);
  });
});

describe('lines on starting to wait and level tags (remarks.ts)', () => {
  const seated = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members;

  it.each(EVERYONE)('%s at the seat: the longest line of each wait meets no tag', (id) => {
    const member = seated.find((m) => m.id === id);
    if (member === undefined) throw new Error(`no ${id}`);
    let checked = 0;
    for (const scene of WAITS) {
      // The longest line of the wait, the worst case for the width.
      const line = linesOf(id, scene).toSorted(
        (a, b) => Array.from(b).length - Array.from(a).length,
      )[0];
      if (line === undefined) continue;
      expectClear(seated, member, { line }, 0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('murmurs and level tags (murmurs.ts)', () => {
  const SEAT_SCENES = ['work', 'idle', 'doze', 'sleepTalk'] as const;
  const seeds = createAmbientSeeds(() => 0);
  /** Everyone as drawn with `idle` (idle.ts) applied to `id`. */
  const everyoneWith = (id: MemberId, idle: IdlePose): readonly MemberPose[] =>
    frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS, {
      moods: {},
      seeds,
      hasHoldFrames: () => false,
      idle: { [id]: idle },
    }).members;
  const drawnWith = (id: MemberId, idle: IdlePose): MemberPose | undefined =>
    everyoneWith(id, idle).find((m) => m.id === id);
  const atSeats = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members;

  it.each([...EVERYONE, 'yukihiro' as const])(
    '%s at the seat, awake, dozing or asleep: the longest murmur meets no tag nor window',
    (id) => {
      const seat = DEFAULT_SEATS[id];
      const poses = [
        frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS).members.find((m) => m.id === id),
        drawnWith(id, idlePose({ kind: 'doze' }, seat, 0, 0)),
        drawnWith(id, idlePose({ kind: 'sleep' }, seat, 0, 0)),
      ];
      let checked = 0;
      for (const member of poses) {
        if (member === undefined) throw new Error(`no ${id}`);
        for (const scene of SEAT_SCENES) {
          const line = longest(id, scene);
          if (line === null) continue;
          expectClear(atSeats, member, { line }, 0);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    },
  );

  const OUTINGS = EVERYONE.flatMap((id) => PLAY_SPOTS[id].map((spot) => ({ id, spot })));

  it.each(OUTINGS)(
    '$id at the $spot.kind spot: the longest murmur meets no tag nor window',
    (o) => {
      const out = walkSegment(o.spot.path, 0);
      const outing = { spot: o.spot, out, back: walkSegment(o.spot.path, out.end + 10_000) };
      const everyone = everyoneWith(
        o.id,
        idlePose({ kind: 'play', outing }, DEFAULT_SEATS[o.id], 0, out.end),
      );
      const member = everyone.find((m) => m.id === o.id);
      if (member === undefined) throw new Error(`no ${o.id}`);
      for (const hour of [7, 12, 17, 22]) {
        const line = longest(o.id, playScene(o.spot.kind, hour));
        if (line === null) throw new Error(`no line at ${o.spot.kind}`);
        expectClear(everyone, member, { line }, hour);
      }
    },
  );
});
