import { describe, expect, it } from 'vitest';
import { createDemoSession } from '../app/demo';
import { createGuildStore } from '../app/guildStore';
import { EVENT_GAP_LIMIT_MS, KING_QUESTS_ENABLED } from '../guild.config';
import { showMs } from '../render/lines';
import { DEFAULT_SEATS, planScene } from '../render/scenes';
import { createMemoryStorage, createKeyValueStore } from '../adapters/storage';
import { toBaseline } from './baseline';
import {
  DEMO_LOOP_MS,
  demoIssueNumber,
  demoKingQuestAt,
  demoSnapshotAt,
  laneDepartments,
} from './demo';
import { DEMO_KING_QUEST, DEMO_SCRIPT } from './demoScript';
import { diffSnapshot, type GuildEvent } from './events';

/** Issue #152: the king's quest of the demo, one every DEMO_KING_QUEST.everyLoops loops. */

const NOW = Date.parse('2026-10-12T03:00:00.000Z');
const STEP_MS = 1_000;
const at = (elapsed: number) => demoSnapshotAt(elapsed, NOW + elapsed);

/** The demo's events with their times (ms since it started), read every STEP_MS. */
function timedEvents(from: number, to: number): { t: number; event: GuildEvent }[] {
  let baseline = toBaseline(at(from), true);
  const found: { t: number; event: GuildEvent }[] = [];
  for (let t = from + STEP_MS; t <= to; t += STEP_MS) {
    const diff = diffSnapshot(baseline, at(t), EVENT_GAP_LIMIT_MS, true);
    found.push(...diff.events.map((event) => ({ t, event })));
    if (diff.baselineUpdate.action === 'replace') baseline = diff.baselineUpdate.baseline;
  }
  return found;
}

describe('the king’s quest in the demo script', () => {
  it('opens once and is cleared once every three loops, the clear in the loop after', () => {
    expect(DEMO_KING_QUEST.everyLoops).toBe(3);
    const king = timedEvents(0, 6 * DEMO_LOOP_MS - 1).filter(({ event }) =>
      event.kind.startsWith('king-quest-'),
    );
    expect(king.map(({ t, event }) => [Math.floor(t / DEMO_LOOP_MS), event.kind])).toEqual([
      [0, 'king-quest-opened'],
      [1, 'king-quest-cleared'],
      [3, 'king-quest-opened'],
      [4, 'king-quest-cleared'],
    ]);
    // Read on the first second after the beat, as the store reads the demo every second.
    expect(king.map(({ t }) => t % DEMO_LOOP_MS)).toEqual([41_000, 23_000, 41_000, 23_000]);
    expect(king.map(({ event }) => event.number)).toEqual([
      demoIssueNumber(0, 'commander'),
      demoIssueNumber(0, 'commander'),
      demoIssueNumber(3, 'commander'),
      demoIssueNumber(3, 'commander'),
    ]);
  });

  it('is open from openAt of its loop up to clearAt of the next', () => {
    const { openAt, clearAt } = DEMO_KING_QUEST;
    expect(demoKingQuestAt(0, openAt - 1)).toBeNull();
    expect(demoKingQuestAt(0, openAt)?.number).toBe(demoIssueNumber(0, 'commander'));
    expect(demoKingQuestAt(1, clearAt - 1)?.number).toBe(demoIssueNumber(0, 'commander'));
    expect(demoKingQuestAt(1, clearAt)).toBeNull();
    expect(demoKingQuestAt(1, openAt)).toBeNull();
    expect(demoKingQuestAt(2, openAt)).toBeNull();
    expect(demoKingQuestAt(3, openAt)?.number).toBe(demoIssueNumber(3, 'commander'));
    expect(at(openAt).president?.issues.map((i) => i.number)).toEqual([101]);
    expect(at(0).president).toEqual({ issues: [] });
  });

  it('takes a number no Issue or PR of the demo uses (かなめ’s lane has none)', () => {
    expect(DEMO_SCRIPT.filter((beat) => beat.lane === 'commander').map((b) => b.action)).toEqual([
      'work',
      'rest',
    ]);
    for (let loop = 0; loop < 4; loop += 1) {
      const end = at(loop * DEMO_LOOP_MS + DEMO_LOOP_MS - 1);
      const used = [...end.issues.map((i) => i.number), ...end.prs.map((p) => p.number)];
      expect(used).not.toContain(demoIssueNumber(loop, 'commander'));
    }
  });
});

interface Window {
  readonly from: number;
  readonly to: number;
}

describe('the king’s quest keeps clear of the other lanes', () => {
  const context = { seats: DEFAULT_SEATS, random: () => 0.5 };

  const meet = (a: Window, b: Window) => a.from < b.to && b.from < a.to;

  /** When かなめ is in the scene of `event` started at `start` (her track, or her line). */
  function kanameWindow(event: GuildEvent, start: number): Window | null {
    const scene = planScene(event, start, context);
    const track = scene.tracks.find((t) => t.actor === 'kaname');
    const ends = [
      track?.segments.at(-1)?.end,
      ...scene.turns.filter((t) => t.actor === 'kaname').map((t) => t.at + showMs(t.scene)),
    ].filter((end) => end !== undefined);
    return ends.length === 0 ? null : { from: start, to: Math.max(...ends) };
  }

  const event = (kind: GuildEvent['kind'], department: GuildEvent['department']): GuildEvent => ({
    id: `${kind}#1`,
    kind,
    number: 1,
    department,
  });

  /** The open and the clear, each with either pair of departments (they swap every loop). */
  const CASES = [0, 1].flatMap((loop) =>
    (['king-quest-opened', 'king-quest-cleared'] as const).map((kind) => ({ loop, kind })),
  );

  it.each(CASES)('$kind with the departments of loop $loop: かなめ is free', ({ loop, kind }) => {
    const departments = laneDepartments(loop);
    const busy = DEMO_SCRIPT.flatMap((beat) => {
      const department = departments[beat.lane];
      if (department === undefined) return [];
      if (beat.action === 'open-issue')
        return [kanameWindow(event('issue-opened', department), beat.at)];
      if (beat.action === 'merge-pr')
        return [kanameWindow(event('pr-merged', department), beat.at)];
      return [];
    }).filter((w) => w !== null);
    expect(busy.length).toBeGreaterThanOrEqual(4);
    const start = kind === 'king-quest-opened' ? DEMO_KING_QUEST.openAt : DEMO_KING_QUEST.clearAt;
    const king = kanameWindow(event(kind, null), start);
    if (king === null) throw new Error('かなめ has no part in the king’s quest');
    expect(busy.filter((w) => meet(w, king))).toEqual([]);
    expect(king.to).toBeLessThan(DEMO_LOOP_MS);
    expect(DEMO_SCRIPT.map((beat) => beat.at)).not.toContain(king.from);
  });
});

describe('the king’s quests only in the demo', () => {
  it('turns them on for the demo, and leaves the real screen to the settings', () => {
    const demo = createDemoSession(() => NOW);
    expect(demo.guildOptions.kingQuests).toBe(true);
    expect(createGuildStore(demo.guildOptions).kingQuests).toBe(true);
    const storage = createKeyValueStore(() => createMemoryStorage());
    expect(createGuildStore({ storage }).kingQuests).toBe(KING_QUESTS_ENABLED);
  });
});
