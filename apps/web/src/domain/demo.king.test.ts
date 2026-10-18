import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import { describe, expect, it } from 'vitest';
import { createDemoSession } from '../app/demo';
import { createGuildStore } from '../app/guildStore';
import { EVENT_GAP_LIMIT_MS, KING_QUESTS_ENABLED } from '../guild.config';
import { showMs } from '../render/lines';
import { DEFAULT_SEATS, planScene } from '../render/scenes';
import { createMemoryStorage, createKeyValueStore } from '../adapters/storage';
import { toBaseline } from './baseline';
import { DEMO_LOOP_MS, demoIssueNumber, demoKingQuestAt, demoSnapshotAt } from './demo';
import { laneDepartments } from './demoLanes';
import { DEMO_KING_QUEST, DEMO_SCRIPT } from './demoScript';
import { diffSnapshot, type GuildEvent } from './events';

/** Issue #152: the king's quest of the demo, every five loops from the third. */

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
  it('opens once and is cleared once every five loops from the third, the clear in the next', () => {
    expect(DEMO_KING_QUEST).toMatchObject({ everyLoops: 5, firstLoop: 2 });
    const king = timedEvents(0, 10 * DEMO_LOOP_MS - 1).filter(({ event }) =>
      event.kind.startsWith('king-quest-'),
    );
    expect(king.map(({ t, event }) => [Math.floor(t / DEMO_LOOP_MS), event.kind])).toEqual([
      [2, 'king-quest-opened'],
      [3, 'king-quest-cleared'],
      [7, 'king-quest-opened'],
      [8, 'king-quest-cleared'],
    ]);
    // Read on the first second after the beat, as the store reads the demo every second.
    expect(king.map(({ t }) => t % DEMO_LOOP_MS)).toEqual([41_000, 23_000, 41_000, 23_000]);
    expect(king.map(({ event }) => event.number)).toEqual([
      demoIssueNumber(2, 'commander'),
      demoIssueNumber(2, 'commander'),
      demoIssueNumber(7, 'commander'),
      demoIssueNumber(7, 'commander'),
    ]);
  });

  it('is open from openAt of its loop up to clearAt of the next', () => {
    const { openAt, clearAt } = DEMO_KING_QUEST;
    for (const loop of [0, 1]) {
      expect(demoKingQuestAt(loop, openAt)).toBeNull();
      expect(demoKingQuestAt(loop, clearAt - 1)).toBeNull();
    }
    expect(demoKingQuestAt(2, openAt - 1)).toBeNull();
    expect(demoKingQuestAt(2, openAt)?.number).toBe(demoIssueNumber(2, 'commander'));
    expect(demoKingQuestAt(3, clearAt - 1)?.number).toBe(demoIssueNumber(2, 'commander'));
    expect(demoKingQuestAt(3, clearAt)).toBeNull();
    expect(demoKingQuestAt(3, openAt)).toBeNull();
    expect(demoKingQuestAt(6, clearAt - 1)).toBeNull();
    expect(demoKingQuestAt(7, openAt)?.title).toBe('年始のあいさつ文を書く');
    const opened = at(2 * DEMO_LOOP_MS + openAt).president?.issues;
    expect(opened?.map((i) => [i.number, i.title])).toEqual([[121, '来年の方針を決める']]);
    expect(at(0).president).toEqual({ issues: [] });
  });

  it.each([2, 3, 4, 5, 6])(
    'with %i departments: takes a number no Issue or PR of the demo, past or now, uses',
    (count) => {
      // かなめ's lane has no Issue or PR of its own.
      expect(DEMO_SCRIPT.filter((b) => b.lane === 'commander').map((b) => b.action)).toEqual([
        'work',
        'rest',
      ]);
      const labels = [...makeSettings(4).departments.map((d) => d.label), '予備一', '予備二'];
      for (const loop of [2, 3, 7, 8]) {
        const end = loop * DEMO_LOOP_MS + DEMO_LOOP_MS - 1;
        const snapshot = demoSnapshotAt(end, NOW + end, labels.slice(0, count));
        const { history } = snapshot;
        const used = [
          ...snapshot.issues.map((i) => i.number),
          ...snapshot.prs.map((p) => p.number),
          ...history.completedIssues.map((i) => i.number),
          ...history.mergedPrs.map((p) => p.number),
        ];
        expect(used).not.toContain(demoIssueNumber(loop - ((loop - 2) % 5), 'commander'));
      }
    },
  );
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
