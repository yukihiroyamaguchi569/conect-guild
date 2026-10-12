import { describe, expect, it } from 'vitest';
import type { GuildEvent } from '../domain/events';
import type { MemberId } from '../guild.config';
import { createCalls } from './calls';
import {
  EMPTY_DIRECTOR,
  frameAt,
  scheduleEvent,
  type MemberPose,
  type StageFrame,
} from './director';
import { createIdleCrew } from './idleCrew';
import { summonOn } from './loop';
import { PLACES } from './map';
import { SUMMONS } from './metrics';
import { MS_PER_TILE } from './motion';
import { tileToPoint } from './path';
import { DEFAULT_SEATS } from './scenes';
import {
  addSummons,
  holdsAt,
  NO_HOLDS,
  replyStart,
  speechesAt,
  summonsEnd,
  withSummons,
  type Summons,
} from './summons';
import { planVisit, visitFor, withVisit, type Visit } from './visit';

/** The king's call when かなめ walks to the throne to hear it (Issue #87). */

const WALK_MS = 5 * MS_PER_TILE;
const CALL_END = SUMMONS.callMs;
const ARRIVE = CALL_END + WALK_MS;
const REPLY = ARRIVE + SUMMONS.murmurMs;
const REPLY_END = REPLY + SUMMONS.replyMs;
const BACK = REPLY_END + WALK_MS;
const CTX = { seats: DEFAULT_SEATS, holds: NO_HOLDS };
const free = { director: EMPTY_DIRECTOR, idle: undefined, seat: DEFAULT_SEATS.kaname };

function visitAt(start: number): Visit {
  const visit = planVisit(start, DEFAULT_SEATS.kaname);
  if (visit === null) throw new Error('no visit');
  return visit;
}

const visiting = (members: readonly MemberId[], start = 0): Summons => ({
  start,
  members,
  visit: visitAt(start),
});

function member(frame: StageFrame, id: MemberId): MemberPose {
  const found = frame.members.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

/** The stage at `t` with her visit, and the call applied. */
function stageAt(list: readonly Summons[], t: number): StageFrame {
  const visit = list[0]?.visit;
  const director = visit === undefined ? EMPTY_DIRECTOR : withVisit(EMPTY_DIRECTOR, visit);
  const frame = frameAt(director, t, DEFAULT_SEATS);
  return withSummons(frame, list, t, { ...CTX, holds: holdsAt(NO_HOLDS, frame, list, t) });
}

describe('summons with a visit: timing', () => {
  it('waits for her at the throne before the whisper, and ends once she is back', () => {
    const summons = visiting(['kaname'], 100);
    expect(replyStart(summons)).toBe(100 + REPLY);
    expect(summonsEnd(summons)).toBe(100 + BACK);
  });

  it('adds her visit when she goes, starting with the call', () => {
    const list = addSummons([], ['kaname'], 50, (start) => visitFor(['kaname'], start, free));
    expect(list).toEqual([visiting(['kaname'], 50)]);
    expect(addSummons([], ['kaname'], 50)).toEqual([{ start: 50, members: ['kaname'] }]);
  });

  it('starts the next call once she is back at her counter', () => {
    const plan = (start: number) => visitFor(['kaname'], start, free);
    const list = addSummons(addSummons([], ['kaname'], 0, plan), ['kaname'], 10, plan);
    expect(list[1]).toEqual(visiting(['kaname'], BACK));
  });
});

describe('summons with a visit: words', () => {
  const list = [visiting(['kaname', 'hibiki'])];

  it('has the king say "！", wait for her, whisper, then all answer together', () => {
    expect(speechesAt(list, 0)).toEqual({ yukihiro: '！' });
    expect(speechesAt(list, CALL_END)).toEqual({});
    expect(speechesAt(list, ARRIVE - 1)).toEqual({});
    expect(speechesAt(list, ARRIVE)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY - 1)).toEqual({ yukihiro: 'ゴニョゴニョ' });
    expect(speechesAt(list, REPLY)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
    expect(speechesAt(list, REPLY_END - 1)).toEqual({ kaname: 'はっ！', hibiki: 'はっ！' });
  });

  it('says nothing while she walks back, nor after', () => {
    expect(speechesAt(list, REPLY_END)).toEqual({});
    expect(speechesAt(list, BACK - 1)).toEqual({});
    expect(speechesAt(list, BACK)).toEqual({});
  });
});

describe('summons with a visit: poses', () => {
  const list = [visiting(['kaname', 'hibiki'])];
  const throneSide = tileToPoint(PLACES.throneSide);

  it('walks her to the side of the throne while the king sits up', () => {
    const walking = member(stageAt(list, CALL_END + MS_PER_TILE), 'kaname');
    expect(walking.inScene).toBe(true);
    expect(walking.atSeat).toBe(false);
    expect([2, 3]).toContain(walking.pose.frame);
  });

  it('turns her to the king (right, the side frame) from her arrival to the end of her answer', () => {
    for (const t of [ARRIVE, REPLY, REPLY_END - 1]) {
      const kaname = member(stageAt(list, t), 'kaname');
      expect(kaname.pose.point).toEqual(throneSide);
      expect(kaname.pose.frame).toBe(1);
      expect(kaname.pose.flip).toBe(false);
    }
  });

  it('turns the departments to the throne only while they answer', () => {
    expect(member(stageAt(list, REPLY - 1), 'hibiki').pose.frame).toBe(0);
    const answering = member(stageAt(list, REPLY), 'hibiki');
    expect(answering.pose.frame).toBe(1);
    expect(answering.pose.flip).toBe(true);
    expect(member(stageAt(list, REPLY_END), 'hibiki').pose.frame).toBe(0);
  });

  it('walks her back facing her way, not the king', () => {
    const back = member(stageAt(list, REPLY_END + MS_PER_TILE), 'kaname');
    expect([2, 3]).toContain(back.pose.frame);
  });

  it('answers at her counter when her track was dropped (the canvas was hidden)', () => {
    const frame = frameAt(EMPTY_DIRECTOR, REPLY, DEFAULT_SEATS);
    const holds = holdsAt(NO_HOLDS, frame, list, REPLY);
    const kaname = member(withSummons(frame, list, REPLY, { ...CTX, holds }), 'kaname');
    expect(kaname.atSeat).toBe(true);
    // Right below the throne: she hops facing front, as in #28.
    expect(kaname.pose.frame).toBe(0);
  });
});

describe('createCalls with a visit', () => {
  it('hands back her visits dropped on a halt, and none otherwise', () => {
    const calls = createCalls({});
    calls.add(['kaname'], 0, (start) => visitFor(['kaname'], start, free));
    calls.add(['minori'], 0);
    expect(calls.setHalted(false)).toEqual([]);
    expect(calls.setHalted(true)).toEqual([visitAt(0)]);
    expect(calls.setHalted(true)).toEqual([]);
  });
});

describe('summonOn: the stage takes the call', () => {
  function cast() {
    const crew = createIdleCrew({ random: () => 0.25, wallNow: () => 0, onActive: undefined });
    return { calls: createCalls({}), crew };
  }

  it('sends her to the throne and says when she is back', () => {
    const summoned = summonOn(cast(), EMPTY_DIRECTOR, ['kaname', 'minori'], 1_000);
    expect(summoned.homeIn).toEqual({ kaname: BACK });
    expect(summoned.director.busyUntil.kaname).toBe(1_000 + BACK);
  });

  it('calls a department alone without moving anyone', () => {
    const summoned = summonOn(cast(), EMPTY_DIRECTOR, ['minori'], 0);
    expect(summoned).toEqual({ director: EMPTY_DIRECTOR, homeIn: {} });
  });

  it('lets her answer where she is when a scene has her (no visit)', () => {
    const scroll: GuildEvent = {
      id: 'issue-opened#1',
      kind: 'issue-opened',
      number: 1,
      department: '経理',
    };
    const busy = scheduleEvent(EMPTY_DIRECTOR, scroll, 0, {
      seats: DEFAULT_SEATS,
      random: () => 0.5,
    });
    const stage = cast();
    const summoned = summonOn(stage, busy, ['kaname'], 1_000);
    expect(summoned).toEqual({ director: busy, homeIn: {} });
    expect(stage.calls.view(() => frameAt(busy, 1_000, DEFAULT_SEATS), 1_000).calling).toBe(true);
  });

  it('drops the call while drawing would not be seen, or while halted', () => {
    const stage = cast();
    expect(summonOn(stage, EMPTY_DIRECTOR, ['kaname'], null)).toEqual({
      director: EMPTY_DIRECTOR,
      homeIn: {},
    });
    stage.calls.setHalted(true);
    expect(summonOn(stage, EMPTY_DIRECTOR, ['kaname'], 0)).toEqual({
      director: EMPTY_DIRECTOR,
      homeIn: {},
    });
  });
});
