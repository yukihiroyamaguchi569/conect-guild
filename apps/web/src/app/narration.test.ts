import { describe, expect, it } from 'vitest';
import { MEMBERS, type MemberId } from '../guild.config';
import type { MemberState } from '../domain/party';
import {
  closedIssue,
  issue,
  mergedPr,
  minutesAfter,
  pr,
  T0,
  at,
} from '../domain/fixtures.test-util';
import { dayPhaseOf, type DayPhase } from '../render/daylight';
import { idleActivities, type IdleActivity } from '../render/idle';
import { PLAY_SPOTS, type PlaySpot } from '../render/idleSpots';
import { IDLE } from '../render/metrics';
import { walkSegment } from '../render/motion';
import {
  DAY_LINES,
  KING_TITLE,
  memberLines,
  NARRATION_WEIGHTS,
  narrationPools,
  PET_NAME,
  pickNarration,
  playStepAt,
  recordLines,
  type NarrationMember,
  type NarrationPools,
} from './narration';

const NOW = at(T0);
const DAY = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

function member(id: MemberId, state: MemberState, quests = 0): NarrationMember {
  return { id, name: MEMBERS[id].name, state, quests };
}

const IDS: readonly MemberId[] = ['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'];
const allIdle = IDS.map((id) => member(id, 'idle'));

function spotOf(id: MemberId, kind: PlaySpot['kind']): PlaySpot {
  const spot = PLAY_SPOTS[id].find((s) => s.kind === kind);
  if (spot === undefined) throw new Error(`no ${kind} spot for ${id}`);
  return spot;
}

/** Back from the spot starts here; out at 0, so any time between is the stay. */
const BACK_AT = 1_000_000;
const STAY = BACK_AT / 2;

function play(spot: PlaySpot): IdleActivity {
  // The way back is the same tiles; only its times matter here.
  const back = walkSegment(spot.path, BACK_AT);
  return { kind: 'play', outing: { spot, out: walkSegment(spot.path, 0), back } };
}

/** A random source that returns the given draws in turn (then the last one). */
function draws(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe('memberLines: by state (A)', () => {
  const cases: [MemberState, string][] = [
    ['awaiting-permission', 'ひびきが きょかを まっている！'],
    ['awaiting-president', `ひびきは ${KING_TITLE}の しょうにんを まっている。`],
    ['awaiting-kaname', 'ひびきは かなめの かくにんを まっている。'],
    ['busy', 'ひびきは せっせと しごとを している。'],
    ['working', 'ひびきは クエストに とりくんでいる。'],
    ['done', 'ひびきは クエストを おえて ひといき ついている。'],
    ['idle', 'ひびきは せきで のんびり している。'],
  ];
  it.each(cases)('a department member %s', (state, line) => {
    expect(memberLines(member('hibiki', state), undefined, NOW)).toContain(line);
  });

  it('gives several lines to busy members, all naming them', () => {
    const lines = memberLines(member('sasae', 'busy'), undefined, NOW);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines).toContain('ささえは しょるいを さばいている。');
    for (const line of lines) expect(line.startsWith('ささえ')).toBe(true);
  });

  it('has its own lines for かなめ at the reception', () => {
    expect(memberLines(member('kaname', 'working'), undefined, NOW)).toEqual([
      'かなめは うけつけで まきものを ととのえている。',
    ]);
    expect(memberLines(member('kaname', 'awaiting-kaname'), undefined, NOW)).toEqual([
      'かなめは とどいた PRを たしかめている。',
    ]);
    expect(memberLines(member('kaname', 'awaiting-permission'), undefined, NOW)).toEqual([
      'かなめが きょかを まっている！',
    ]);
    expect(memberLines(member('kaname', 'idle'), undefined, NOW)[0]).toMatch(
      /^かなめは うけつけで/,
    );
  });

  it('calls the king おうさま, on the throne', () => {
    expect(memberLines(member('yukihiro', 'awaiting-president'), undefined, NOW)[0]).toMatch(
      /^おうさまは しょうにんを まつ PRに/,
    );
    expect(memberLines(member('yukihiro', 'idle'), undefined, NOW)[0]).toMatch(
      /^おうさまは ぎょくざ/,
    );
    expect(memberLines(member('yukihiro', 'idle'), { kind: 'doze' }, NOW)).toEqual([
      'おうさまは ぎょくざで まどろんでいる。',
    ]);
    for (const line of memberLines(member('yukihiro', 'idle'), { kind: 'sleep' }, NOW)) {
      expect(line).toMatch(/^おうさまは ぎょくざで /);
    }
  });

  it('tells the king works on his quests while he has one (Issue #166)', () => {
    const working = ['おうさまは ぎょくざで クエストに とりくんでいる。'];
    expect(memberLines(member('yukihiro', 'idle', 1), undefined, NOW)).toEqual(working);
    expect(memberLines(member('yukihiro', 'idle', 5), undefined, NOW)).toEqual(working);
    // None left: back to looking round the room.
    expect(memberLines(member('yukihiro', 'idle', 0), undefined, NOW)).toEqual([
      'おうさまは ぎょくざから へやを みわたしている。',
    ]);
  });

  it("puts the PR to approve before the king's quests", () => {
    expect(memberLines(member('yukihiro', 'awaiting-president', 2), undefined, NOW)).toEqual([
      'おうさまは しょうにんを まつ PRに めを とおしている。',
    ]);
  });

  it('keeps the dozing and sleeping king as they are while he has quests', () => {
    expect(memberLines(member('yukihiro', 'idle', 2), { kind: 'doze' }, NOW)).toEqual([
      'おうさまは ぎょくざで まどろんでいる。',
    ]);
    expect(memberLines(member('yukihiro', 'idle', 2), { kind: 'sleep' }, NOW)).toEqual([
      'おうさまは ぎょくざで すやすや ねむっている…',
      'おうさまは ぎょくざで いびきを かいている…',
    ]);
  });

  it("never tells a department member the king's quest line, nor a number or a title", () => {
    for (const id of IDS.filter((i) => i !== 'yukihiro')) {
      for (const line of memberLines(member(id, 'idle', 3), undefined, NOW)) {
        expect(line).not.toContain('ぎょくざで クエスト');
      }
    }
    for (const line of memberLines(member('yukihiro', 'idle', 3), undefined, NOW)) {
      expect(line).not.toMatch(/[#「0-9]/);
    }
  });
});

describe('memberLines: long idle spells (A)', () => {
  it('dozes and sleeps', () => {
    expect(memberLines(member('minori', 'idle'), { kind: 'doze' }, NOW)).toEqual([
      'みのりは うとうと している…',
    ]);
    const sleep = memberLines(member('minori', 'done'), { kind: 'sleep' }, NOW);
    expect(sleep).toContain('みのりは すやすや ねむっている…');
  });

  it('tells where a member is out playing', () => {
    const lines = (kind: PlaySpot['kind']) =>
      memberLines(member('hirame', 'idle'), play(spotOf('hirame', kind)), STAY);
    expect(lines('window')).toEqual(['ひらめは まどの そとを ながめている。']);
    expect(lines('tea')).toEqual(['ひらめは おちゃを のんで ひといき ついている。']);
    expect(lines('pet')).toEqual([`ひらめは ${PET_NAME}と あそんでいる。`]);
    // ひらめ chats with ささえ across the counter (idleSpots.ts).
    expect(lines('chat')).toEqual(['ひらめは ささえと おしゃべり している。']);
  });

  it('walks there and back before and after it (as on the canvas)', () => {
    const lineAt = (kind: PlaySpot['kind'], now: number) =>
      memberLines(member('hirame', 'idle'), play(spotOf('hirame', kind)), now);
    expect(lineAt('window', 0)).toEqual(['ひらめは まどべへ むかっている。']);
    expect(lineAt('tea', 1)).toEqual(['ひらめは おちゃの ところへ むかっている。']);
    expect(lineAt('pet', 1)).toEqual([`ひらめは ${PET_NAME}の ところへ むかっている。`]);
    expect(lineAt('chat', 1)).toEqual(['ひらめは ささえの ところへ むかっている。']);
    expect(lineAt('tea', BACK_AT)).toEqual(['ひらめは せきに もどっている。']);
    expect(lineAt('tea', BACK_AT + 1)).toEqual(['ひらめは せきに もどっている。']);
    expect(lineAt('pet', BACK_AT)).toEqual(['ひらめは せきに もどっている。']);
  });

  it('tells the stay from the moment the walk out ends until the walk back starts', () => {
    const activity = play(spotOf('hirame', 'tea'));
    if (activity.kind !== 'play') throw new Error('unreachable');
    const { out } = activity.outing;
    expect(playStepAt(activity.outing, out.end - 1)).toBe('going');
    expect(playStepAt(activity.outing, out.end)).toBe('staying');
    expect(playStepAt(activity.outing, BACK_AT - 1)).toBe('staying');
    expect(playStepAt(activity.outing, BACK_AT)).toBe('returning');
  });

  it('follows the canvas: idleActivities with the same salts gives the same outing', () => {
    const seeds = {
      kaname: 1,
      minori: 2,
      hibiki: 3,
      hirame: 4,
      sasae: 5,
      takumi: 7,
      musubi: 8,
      yukihiro: 6,
    };
    const since = { hirame: 0 };
    // Look through the cycles for a moment when ひらめ is out, as the canvas would show it.
    for (let cycle = 10; cycle < 400; cycle += 1) {
      const now = cycle * IDLE.playCycleMs + IDLE.leaveMaxMs + 5_000;
      const activity = idleActivities(since, seeds, now).hirame;
      if (activity?.kind !== 'play') continue;
      const line = memberLines(member('hirame', 'idle'), activity, now)[0] ?? '';
      expect(line.startsWith('ひらめは ')).toBe(true);
      expect(line).not.toContain('うとうと');
      return;
    }
    throw new Error('ひらめ never went out');
  });
});

describe('names come from the settings', () => {
  it('uses MEMBERS for every name, including partners and かなめ', () => {
    expect(memberLines(member('minori', 'awaiting-kaname'), undefined, NOW)[0]).toContain(
      `${MEMBERS.kaname.name}の かくにん`,
    );
    const chat = memberLines(member('minori', 'idle'), play(spotOf('minori', 'chat')), STAY)[0];
    expect(chat).toBe(`${MEMBERS.minori.name}は ${MEMBERS.hibiki.name}と おしゃべり している。`);
  });

  it('uses the name passed in the row', () => {
    const renamed = { id: 'sasae', name: 'テスト名', state: 'busy', quests: 0 } as const;
    for (const line of memberLines(renamed, undefined, NOW)) expect(line).toMatch(/^テスト名は /);
  });
});

describe('DAY_LINES: by the time of day (B)', () => {
  const cases: [number, DayPhase][] = [
    [6, 'morning'],
    [12, 'day'],
    [17, 'evening'],
    [23, 'night'],
  ];
  it.each(cases)('at %s o’clock it is %s', (hour, phase) => {
    expect(dayPhaseOf(hour)).toBe(phase);
    expect(DAY_LINES[phase].length).toBeGreaterThanOrEqual(2);
  });

  it('says the night is late only at night', () => {
    expect(DAY_LINES.night).toContain('よるも ふけてきた…');
    for (const phase of ['morning', 'day', 'evening'] as const) {
      expect(DAY_LINES[phase]).not.toContain('よるも ふけてきた…');
    }
  });
});

describe('recordLines: the week (C)', () => {
  it('says nothing for a quiet week', () => {
    expect(recordLines({ issues: [issue(1)], prs: [pr(2)] }, NOW)).toEqual([]);
  });

  it('counts the quests cleared and the chests within 7 days only', () => {
    const snapshot = {
      issues: [
        closedIssue(1, daysAgo(1)),
        closedIssue(2, daysAgo(6.9)),
        closedIssue(3, daysAgo(7.5)),
        issue(4),
      ],
      prs: [mergedPr(10, daysAgo(2)), mergedPr(11, daysAgo(8)), pr(12)],
    };
    expect(recordLines(snapshot, NOW).flat()).toEqual([
      'この 1 しゅうかんで クエストを 2 こ クリアした！',
      'この 1 しゅうかんで たからばこが 1 こ とどいた！',
    ]);
  });

  it('names who brought the most chests, and shares a tie', () => {
    const one = recordLines(
      {
        issues: [],
        prs: [
          mergedPr(1, daysAgo(1), { headRef: 'accounting/a' }),
          mergedPr(2, daysAgo(1), { headRef: 'accounting/b' }),
          mergedPr(3, daysAgo(1), { headRef: 'pr/c' }),
        ],
      },
      NOW,
    ).flat();
    expect(one).toContain(`いちばん たからばこを あつめたのは ${MEMBERS.minori.name}（2 こ）！`);
    const tie = recordLines(
      {
        issues: [],
        prs: [
          mergedPr(1, daysAgo(1), { headRef: 'accounting/a' }),
          mergedPr(2, daysAgo(1), { headRef: 'planning/b' }),
        ],
      },
      NOW,
    ).flat();
    expect(tie).toContain('いちばん たからばこを あつめたのは みのりと ひらめ（1 こ）！');
  });

  it('names nobody when every chest had no department', () => {
    const lines = recordLines({ issues: [], prs: [mergedPr(1, daysAgo(1))] }, NOW).flat();
    expect(lines).toEqual(['この 1 しゅうかんで たからばこが 1 こ とどいた！']);
  });
});

describe('recordLines: the king’s clears (Issue #172)', () => {
  it('counts the king’s quests closed within 7 days too (Issue #172)', () => {
    const president = {
      issues: [],
      closed: [
        { number: 20, closedAt: daysAgo(1) },
        { number: 21, closedAt: daysAgo(7.5) },
      ],
    };
    const snapshot = { issues: [closedIssue(1, daysAgo(2))], prs: [], president };
    expect(recordLines(snapshot, NOW).flat()).toEqual([
      'この 1 しゅうかんで クエストを 2 こ クリアした！',
    ]);
    const kingOnly = { issues: [], prs: [], president };
    expect(recordLines(kingOnly, NOW).flat()).toEqual([
      'この 1 しゅうかんで クエストを 1 こ クリアした！',
    ]);
  });

  it('counts a number once, in both `issues` and `president.closed` or twice in `issues`', () => {
    const president = { issues: [], closed: [{ number: 1, closedAt: daysAgo(1) }] };
    const snapshot = { issues: [closedIssue(1, daysAgo(2))], prs: [], president };
    expect(recordLines(snapshot, NOW).flat()).toEqual([
      'この 1 しゅうかんで クエストを 1 こ クリアした！',
    ]);
    const twice = { issues: [closedIssue(2, daysAgo(1)), closedIssue(2, daysAgo(1))], prs: [] };
    expect(recordLines(twice, NOW).flat()).toEqual([
      'この 1 しゅうかんで クエストを 1 こ クリアした！',
    ]);
  });

  it('counts no king’s clear from an older collector (no `closed`) or without president', () => {
    const issues = [closedIssue(1, daysAgo(2))];
    const line = 'この 1 しゅうかんで クエストを 1 こ クリアした！';
    expect(recordLines({ issues, prs: [], president: { issues: [] } }, NOW).flat()).toEqual([line]);
    expect(recordLines({ issues, prs: [] }, NOW).flat()).toEqual([line]);
  });
});

describe('narrationPools', () => {
  const snapshot = {
    issues: [closedIssue(1, minutesAfter(T0, -60), ['経理']), issue(2, { labels: ['広報'] })],
    prs: [mergedPr(3, minutesAfter(T0, -30), { headRef: 'accounting/x' })],
  };

  it('is empty before the first snapshot (no party)', () => {
    const pools = narrationPools({ party: [], activities: {}, phase: 'day', snapshot, now: NOW });
    expect(pools).toEqual({ scene: [], time: [], record: [] });
  });

  it('has one group per member, the time of day, and the record', () => {
    const pools = narrationPools({
      party: allIdle,
      activities: { minori: { kind: 'doze' } },
      phase: 'night',
      snapshot,
      now: NOW,
    });
    expect(pools.scene).toHaveLength(6);
    expect(pools.scene[1]).toEqual(['みのりは うとうと している…']);
    expect(pools.time).toEqual([DAY_LINES.night]);
    expect(pools.record.length).toBeGreaterThan(0);
  });

  it('never tells a title', () => {
    const pools = narrationPools({
      party: IDS.map((id) => member(id, 'working')),
      activities: {},
      phase: 'day',
      snapshot,
      now: NOW,
    });
    const all = [...pools.scene, ...pools.time, ...pools.record].flat().join('\n');
    expect(all).not.toContain('架空の');
    expect(all).not.toMatch(/#\d/);
  });
});

describe('pickNarration', () => {
  const pools: NarrationPools = {
    scene: [['a1', 'a2'], ['b1']],
    time: [['t1', 't2']],
    record: [['r1']],
  };

  it('chooses the kind by its weight', () => {
    expect(pickNarration(pools, null, draws(0, 0, 0))).toBe('a1');
    expect(pickNarration(pools, null, draws(NARRATION_WEIGHTS.scene, 0, 0))).toBe('t1');
    expect(pickNarration(pools, null, draws(0.99, 0, 0))).toBe('r1');
  });

  it('chooses the group, then the line', () => {
    expect(pickNarration(pools, null, draws(0, 0.6, 0))).toBe('b1');
    expect(pickNarration(pools, null, draws(0, 0, 0.99))).toBe('a2');
  });

  it('never tells the previous line again', () => {
    expect(pickNarration(pools, 'a1', draws(0, 0, 0))).toBe('a2');
    // The record's only line was told: its weight goes to the others.
    expect(pickNarration(pools, 'r1', draws(0.99, 0, 0.99))).toBe('t2');
    for (let i = 0; i < 200; i += 1) {
      const r = Math.random;
      const previous = pickNarration(pools, null, r);
      expect(pickNarration(pools, previous, r)).not.toBe(previous);
    }
  });

  it('leaves out an empty kind (a quiet week has no record)', () => {
    const quiet = { ...pools, record: [] };
    expect(pickNarration(quiet, null, draws(0.99, 0.99, 0.99))).toBe('t2');
  });

  it('repeats only when there is a single line, and is null with none', () => {
    expect(pickNarration({ scene: [['x']], time: [], record: [] }, 'x', draws(0))).toBe('x');
    expect(pickNarration({ scene: [], time: [], record: [] }, null, draws(0))).toBeNull();
  });
});
