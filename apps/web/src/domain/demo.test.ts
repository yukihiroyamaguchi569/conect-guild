import { snapshotSchema, type Snapshot } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import { describe, expect, it } from 'vitest';
import { buildFetchStatus, buildKingBubble, buildParty } from '../app/guildView';
import { toBaseline } from './baseline';
import { DEMO_LOOP_MS, DEMO_REPO, demoIssueNumber, demoSnapshotAt, ruleChangeFile } from './demo';
import { laneDepartments, laneStatesAt } from './demoLanes';
import { DEMO_LANES, DEMO_RECEPTION_TITLES, DEMO_SCRIPT, DEMO_TITLES } from './demoScript';
import { EVENT_GAP_LIMIT_MS } from '../guild.config';
import { diffSnapshot, type GuildEvent } from './events';
import { isRuleChangePath } from './party';
import {
  lastKanameWork,
  readSessions,
  summonedMembers,
  summonsFrom,
  type SummonsFrom,
} from './summons';
import { countXp, levelOf } from './xp';

const NOW = Date.parse('2026-10-12T03:00:00.000Z');
const STEP_MS = 1_000;

/** The demo as the screen reads it: `elapsed` after it started, the wall clock moving with it. */
const at = (elapsed: number): Snapshot => demoSnapshotAt(elapsed, NOW + elapsed);

function stateOf(snapshot: Snapshot, number: number) {
  return snapshot.issues.find((issue) => issue.number === number)?.state ?? 'none';
}

/**
 * Events found by reading the demo every STEP_MS from `from` to `to`, as the store does: with the
 * king's quests on, as the demo has them (app/demo.ts, Issue #152).
 */
function eventsBetween(from: number, to: number): GuildEvent[] {
  let baseline = toBaseline(at(from), true);
  const events: GuildEvent[] = [];
  for (let t = from + STEP_MS; t <= to; t += STEP_MS) {
    const diff = diffSnapshot(baseline, at(t), EVENT_GAP_LIMIT_MS, true);
    events.push(...diff.events);
    if (diff.baselineUpdate.action === 'replace') baseline = diff.baselineUpdate.baseline;
  }
  return events;
}

describe('the demo script', () => {
  it('fits one loop of 30 to 60 seconds, in time order', () => {
    expect(DEMO_LOOP_MS).toBeGreaterThanOrEqual(30_000);
    expect(DEMO_LOOP_MS).toBeLessThanOrEqual(60_000);
    for (const [i, beat] of DEMO_SCRIPT.entries()) {
      expect(beat.at).toBeGreaterThan(0);
      expect(beat.at).toBeLessThan(DEMO_LOOP_MS);
      expect(beat.at).toBeGreaterThanOrEqual(DEMO_SCRIPT[i - 1]?.at ?? 0);
    }
  });

  it('applies a beat from its own time on, not before (boundaries)', () => {
    const open = DEMO_SCRIPT.find((b) => b.lane === 'quest1' && b.action === 'open-issue');
    const close = DEMO_SCRIPT.find((b) => b.lane === 'quest1' && b.action === 'close-issue');
    if (open === undefined || close === undefined) throw new Error('quest1 has no full quest');
    expect(laneStatesAt(open.at - 1).quest1.issue).toBe('none');
    expect(laneStatesAt(open.at).quest1.issue).toBe('open');
    expect(laneStatesAt(close.at - 1).quest1.issue).toBe('open');
    expect(laneStatesAt(close.at).quest1.issue).toBe('closed');
    // Closing ends the lane's session as well.
    expect(laneStatesAt(close.at).quest1.session).toBe('idle');
  });

  it('takes an added beat without other changes (a list of events)', () => {
    const extra = [...DEMO_SCRIPT, { at: 59_000, lane: 'helper2', action: 'ask' } as const];
    expect(laneStatesAt(59_000, extra).helper2.session).toBe('awaiting-permission');
    expect(laneStatesAt(59_000, extra).quest1).toEqual(laneStatesAt(59_000).quest1);
  });
});

describe('demoSnapshotAt', () => {
  it('is a valid snapshot all along, before the start and over several loops', () => {
    expect(snapshotSchema.safeParse(demoSnapshotAt(0, NOW)).success).toBe(true);
    for (let t = 0; t < 3 * DEMO_LOOP_MS; t += 250) {
      const result = snapshotSchema.safeParse(at(t));
      expect(result.success, `at ${String(t)} ms`).toBe(true);
    }
  });

  it('is of a fictional repository, with only the fictional titles', () => {
    const titles = new Set(
      [...DEMO_TITLES.flat(), ...DEMO_RECEPTION_TITLES].flatMap((t) => [t.issue, t.pr]),
    );
    expect(DEMO_REPO).not.toBe(GUILD_SETTINGS.repo);
    for (let t = 0; t < 7 * DEMO_LOOP_MS; t += 5_000) {
      const snapshot = at(t);
      expect(snapshot.repo).toBe(DEMO_REPO);
      for (const item of [...snapshot.issues, ...snapshot.prs])
        expect(titles).toContain(item.title);
    }
  });

  it('starts with an empty board and idle sessions, and stays there before the start', () => {
    const snapshot = demoSnapshotAt(0, NOW);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.prs).toEqual([]);
    expect(snapshot.sessions).toMatchObject({ status: 'ok' });
    // A negative time (a clock moved back) counts as the start.
    expect(demoSnapshotAt(-5_000, NOW).issues).toEqual([]);
  });

  it('is never stale: fetchedAt and the sessions are of now', () => {
    for (const t of [0, 30_000, 10 * DEMO_LOOP_MS]) {
      const status = buildFetchStatus(at(t), null, NOW + t);
      expect(status.stale).toBe(false);
      expect(status.sessions).toBeNull();
    }
  });
});

describe('demoSnapshotAt over the loops', () => {
  it('repeats every loop with new numbers, and swaps the departments every loop', () => {
    const t = 30_000;
    const first = at(t);
    const next = at(t + DEMO_LOOP_MS);
    expect(next.issues.length).toBeGreaterThanOrEqual(first.issues.length);
    expect(demoIssueNumber(1, 'quest1')).toBeGreaterThan(demoIssueNumber(0, 'helper2'));
    expect(stateOf(next, demoIssueNumber(1, 'quest1'))).toBe(
      stateOf(first, demoIssueNumber(0, 'quest1')),
    );
    expect(laneDepartments(1).quest1).toBe(laneDepartments(0).helper1);
    expect(laneDepartments(2)).toEqual(laneDepartments(0));
    // Every department carries a quest within two loops.
    const carriers = new Set(
      [0, 1].flatMap((l) => [laneDepartments(l).quest1, laneDepartments(l).quest2]),
    );
    expect(carriers.size).toBe(4);
  });

  it('keeps the previous loop (done, rewards) and drops the one before', () => {
    const snapshot = at(2 * DEMO_LOOP_MS + 1_000);
    const numbers = snapshot.issues.map((issue) => issue.number);
    expect(numbers).toContain(demoIssueNumber(1, 'quest1'));
    expect(numbers).not.toContain(demoIssueNumber(0, 'quest1'));
  });

  it('counts its history up as the loops go, never more cleared than opened', () => {
    const early = at(1_000).history;
    const later = at(3 * DEMO_LOOP_MS).history;
    expect(later.openedIssueCount).toBeGreaterThan(early.openedIssueCount);
    expect(later.completedIssues).toHaveLength(early.completedIssues.length + 6);
    expect(later.mergedPrs).toHaveLength(early.mergedPrs.length + 6);
  });
});

describe('what the screen makes of the demo', () => {
  it('each loop: two quests handed out, delivered and cleared, in this order', () => {
    const events = eventsBetween(0, DEMO_LOOP_MS - 1);
    expect(events.map((e) => `${e.kind} ${String(e.department)}`)).toEqual([
      'issue-opened 経理',
      'issue-opened 企画',
      'level-up null',
      'pr-merged 経理',
      'level-up 経理',
      'issue-closed 経理',
      'pr-merged 企画',
      'issue-closed 企画',
      'level-up 企画',
    ]);
    const next = eventsBetween(DEMO_LOOP_MS - 1, 2 * DEMO_LOOP_MS - 1);
    expect(next.map((e) => `${e.kind} ${String(e.department)}`)).toEqual([
      'issue-opened 広報',
      'issue-opened 総務',
      'pr-merged 広報',
      'issue-closed 広報',
      'pr-merged 総務',
      'issue-closed 総務',
    ]);
  });

  it('the loop changing brings no event of its own (nothing replayed or reopened)', () => {
    const around = eventsBetween(DEMO_LOOP_MS - 2_000, DEMO_LOOP_MS + 3_000);
    expect(around).toEqual([]);
  });

  it('shows 許可待ち, the president waiting once, and 完了 after the clear', () => {
    const ask = DEMO_SCRIPT.find((b) => b.action === 'ask');
    if (ask === undefined) throw new Error('no 「？」 in the script');
    const party = buildParty(at(ask.at), NOW + ask.at);
    expect(party.find((row) => row.id === 'minori')?.state).toBe('awaiting-permission');

    const waiting = Array.from(
      { length: DEMO_LOOP_MS / STEP_MS },
      (_, i) => buildKingBubble(at(i * STEP_MS)).waiting,
    );
    const spells = waiting.filter((w, i) => w && !waiting[i - 1]).length;
    expect(spells).toBe(1);

    const end = at(DEMO_LOOP_MS - 1);
    const rows = buildParty(end, NOW + DEMO_LOOP_MS - 1);
    expect(rows.find((row) => row.id === 'minori')?.state).toBe('done');
    expect(rows.find((row) => row.id === 'hirame')?.state).toBe('done');
  });

  it('opens with the king giving かなめ an order (Issue #28)', () => {
    const called: string[] = [];
    let previous = readSessions(at(0).sessions, NOW);
    for (let t = STEP_MS; t < DEMO_LOOP_MS; t += STEP_MS) {
      const next = readSessions(at(t).sessions, NOW + t);
      called.push(...summonedMembers(previous, next));
      previous = next;
    }
    expect(called[0]).toBe('kaname');
    expect(called).toEqual(['kaname', 'minori', 'hirame', 'hibiki']);
  });
});

describe('demo orders from かなめ', () => {
  it('has かなめ hand the work on to the departments after the king’s order (Issue #155)', () => {
    const from: SummonsFrom[] = [];
    let previous = readSessions(at(0).sessions, NOW);
    let kanameWorkedAt = lastKanameWork(null, null, previous);
    for (let t = STEP_MS; t < DEMO_LOOP_MS; t += STEP_MS) {
      const next = readSessions(at(t).sessions, NOW + t);
      const members = summonedMembers(previous, next);
      kanameWorkedAt = lastKanameWork(kanameWorkedAt, previous, next);
      if (members.length > 0 && next !== null) {
        from.push(summonsFrom(members, kanameWorkedAt, next.checkedAt));
      }
      previous = next;
    }
    expect(from).toEqual(['king', 'kaname', 'kaname', 'kaname']);
  });
});

describe('ruleChangeFile', () => {
  it('makes a path the rule matches, for every kind of rule', () => {
    for (const rule of [
      { match: 'exact', path: 'RULES.md' },
      { match: 'suffix', path: '/CLAUDE.md' },
      { match: 'prefix', path: '.claude/agents/' },
    ] as const) {
      expect(isRuleChangePath(ruleChangeFile([rule]), [rule])).toBe(true);
    }
    expect(ruleChangeFile([])).toBe('CLAUDE.md');
  });

  it('every lane is a known one', () => {
    for (const beat of DEMO_SCRIPT) expect(DEMO_LANES).toContain(beat.lane);
  });
});

describe('the levels of the demo (Issue #19)', () => {
  it('starts everybody above level 1 from the made-up past', () => {
    const xp = countXp(at(0));
    expect(levelOf(xp.kaname.xp).level).toBeGreaterThan(1);
    for (const tally of xp.departments.values()) expect(levelOf(tally.xp).level).toBeGreaterThan(1);
  });

  it('adds a clear and a merge to each department that carried a quest in the loop', () => {
    const before = countXp(at(0));
    const after = countXp(at(DEMO_LOOP_MS - 1));
    const carried = [laneDepartments(0).quest1, laneDepartments(0).quest2];
    for (const [label, tally] of after.departments) {
      const gain = tally.xp - (before.departments.get(label)?.xp ?? 0);
      expect(gain, label).toBe(carried.includes(label) ? 15 : 0);
    }
    // かなめ: 3 for each scroll handed out.
    expect(after.kaname.xp - before.kaname.xp).toBe(6);
  });
});

/** Each level-up of the demo in its first `loops` loops: when (s from はじめる), who, which level. */
function levelUpsOver(loops: number): string[] {
  let baseline = toBaseline(at(0));
  const found: string[] = [];
  // Half the step of the other tests: the script's beats are on half seconds.
  for (let t = STEP_MS / 2; t <= loops * DEMO_LOOP_MS; t += STEP_MS / 2) {
    const diff = diffSnapshot(baseline, at(t));
    for (const e of diff.events.filter((event) => event.kind === 'level-up'))
      found.push(`${String(t / 1000)}s ${String(e.department)} Lv ${String(e.number)}`);
    if (diff.baselineUpdate.action === 'replace') baseline = diff.baselineUpdate.baseline;
  }
  return found;
}

describe('level-ups in the demo (Issue #19)', () => {
  it('shows three in the first loop, one by one: a scroll, a chest, a clear', () => {
    expect(levelUpsOver(1)).toEqual(['13.5s null Lv 6', '27s 経理 Lv 7', '57.5s 企画 Lv 6']);
  });

  it('then only now and then: in the 4th, 6th, 9th (two), 11th and 12th loops of twelve', () => {
    expect(levelUpsOver(12).slice(3)).toEqual([
      '207s 広報 Lv 6',
      '357.5s 総務 Lv 7',
      '520s 経理 Lv 8',
      '537.5s 企画 Lv 7',
      '613.5s null Lv 7',
      '687s 広報 Lv 7',
    ]);
  });
});
