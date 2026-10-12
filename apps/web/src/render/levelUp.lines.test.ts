import { describe, expect, it } from 'vitest';
import type { DepartmentLabel, MemberId } from '../guild.config';
import type { GuildEvent } from '../domain/events';
import { EMPTY_DIRECTOR, frameAt, scheduleEvent, type Director } from './director';
import { drawLevelUpBanners, type BannerContext } from './drawLevelUp';
import { levelTags } from './levelTags';
import { linesOf } from './lineBook';
import type { PickLine } from './lines';
import { LINES, OVERHEAD_TOP } from './metrics';
import { raise } from './motion';
import { overheadLift } from './overhead';
import { placeOverheads, wordsFeet, type OverheadMember } from './overheadPlace';
import type { SpokenLines } from './lines';
import type { Speeches } from './summons';
import { DEFAULT_SEATS } from './scenes';

/** "LEVEL UP" (Issue #19) and a member's line of a scene (Issue #47) over the same head. */

const pick: PickLine = (actor, scene) => linesOf(actor, scene)[0] ?? null;
const context = { seats: DEFAULT_SEATS, random: () => 0.5, pickLine: pick };
const TAGS = levelTags({ kaname: 9, minori: 9, hibiki: 9, hirame: 9, sasae: 9 }, DEFAULT_SEATS);

function levelUp(label: DepartmentLabel): GuildEvent {
  return { id: `level-up:${label}#4`, kind: 'level-up', number: 4, department: label };
}

function cleared(label: DepartmentLabel): GuildEvent {
  return { id: `issue-closed#1`, kind: 'issue-closed', number: 1, department: label };
}

/** The "LEVEL UP" written at `t`, as a recording context sees it. */
function bannerY(director: Director, t: number): number | undefined {
  const written: number[] = [];
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
    fillText: (_text: string, _x: number, y: number) => {
      written.push(y);
    },
  };
  drawLevelUpBanners(ctx, {
    frame: frameAt(director, t, DEFAULT_SEATS),
    speeches: {},
    bubbles: {},
    remarks: {},
    murmurs: {},
    tags: TAGS,
  });
  return written[0];
}

describe('"LEVEL UP" over a line of a scene', () => {
  it.each<[DepartmentLabel, MemberId]>([
    ['経理', 'minori'],
    ['広報', 'hibiki'],
    ['企画', 'hirame'],
    ['総務', 'sasae'],
  ])('%s: the words stand over the top of the clear line bubble, lifted as it is', (label, id) => {
    const both = scheduleEvent(
      scheduleEvent(EMPTY_DIRECTOR, levelUp(label), 0, context),
      cleared(label),
      0,
      context,
    );
    for (let t = 0; t < LINES.clearMs; t += 50) {
      const frame = frameAt(both, t, DEFAULT_SEATS);
      const member = frame.members.find((m) => m.id === id);
      const line = frame.lines[id];
      const y = bannerY(both, t);
      if (member === undefined || line === undefined || y === undefined) continue;
      const top = member.pose.point.y - overheadLift(member.pose, line, TAGS) - OVERHEAD_TOP;
      expect(y).toBeLessThan(top);
    }
    expect(bannerY(both, 100)).toBeDefined();
  });

  it('stays in its usual place once the line is over', () => {
    const alone = scheduleEvent(EMPTY_DIRECTOR, levelUp('経理'), 0, context);
    const both = scheduleEvent(alone, cleared('経理'), 0, context);
    expect(bannerY(both, LINES.clearMs + 100)).toBe(bannerY(alone, LINES.clearMs + 100));
    expect(bannerY(both, 100)).toBeLessThan(bannerY(alone, 100) ?? Number.NaN);
  });
});

/** Where words over `member` are drawn from, alone on the stage (overheadPlace.wordsFeet). */
function feetOf(
  member: OverheadMember,
  said: { readonly speeches: Speeches; readonly lines: SpokenLines },
  tags = TAGS.slice(0, 0),
) {
  const sources = { ...said, remarks: {}, bubbles: {}, murmurs: {} };
  return wordsFeet(placeOverheads([member], sources, tags), member.id);
}

describe('wordsFeet', () => {
  const member = {
    id: 'minori',
    pose: { point: { x: 500, y: 400 }, held: null },
    inScene: false,
    mark: null,
  } as const;

  it('is null with no words over the head', () => {
    expect(feetOf(member, { speeches: {}, lines: {} })).toBeNull();
    expect(feetOf(member, { speeches: { hibiki: 'はっ！' }, lines: {} })).toBeNull();
  });

  it('gives the feet for the king’s call or a line, as the bubble is drawn', () => {
    expect(feetOf(member, { speeches: { minori: 'はっ！' }, lines: {} })).toEqual({
      x: 500,
      y: 400,
    });
    // Held up, the words go beside the item at the head's height: not lifted.
    const raised = { ...member, pose: { ...member.pose, held: raise('scroll') } };
    expect(feetOf(raised, { speeches: {}, lines: { minori: 'おまかせを' } })).toEqual({
      x: 500,
      y: 400,
    });
  });

  it('measures the words that show: the king’s call before a line', () => {
    // In the open middle of the room, clear of the HTML windows: both go to the right.
    const open = { ...member, pose: { point: { x: 500, y: 300 }, held: null } } as const;
    // Past the end of 「はっ！」, under that of 「うけたまわり！」.
    const tag = { text: 'Lv 9', x: 600, y: 300 - OVERHEAD_TOP + 10 };
    expect(overheadLift(open.pose, 'はっ！', [tag])).toBe(0);
    expect(overheadLift(open.pose, 'うけたまわり！', [tag])).toBeGreaterThan(0);
    const sources = {
      speeches: { minori: 'はっ！' as const },
      lines: { minori: 'うけたまわり！' as const },
    };
    expect(feetOf(open, sources, [tag])).toEqual({ x: 500, y: 300 });
    expect(feetOf(open, { speeches: {}, lines: sources.lines }, [tag])?.y).toBe(
      300 - overheadLift(open.pose, 'うけたまわり！', [tag]),
    );
  });
});
