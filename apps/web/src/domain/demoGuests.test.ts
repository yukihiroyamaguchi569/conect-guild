import { snapshotSchema } from '@conect-guild/snapshot';
import { FICTIONAL_GUESTS } from '@conect-guild/snapshot/settings.fixtures';
import { describe, expect, it } from 'vitest';
import { demoSnapshotAt, DEMO_LOOP_MS } from './demo';
import { demoGuestsAt } from './demoGuests';
import { guestEvents } from './guests';

const NOW = Date.parse('2026-10-12T03:00:00.000Z');
const BOTH_WITH_REPOS = [
  { name: 'たびびと', sessionDir: '~/example-visitor', repo: 'example-visitor/potion-shop' },
  { name: 'ぼうけんしゃ', sessionDir: '/srv/example-wanderer', repo: 'example-wanderer/map-maker' },
];

describe('demoGuestsAt', () => {
  it('brings no guests when the settings name none', () => {
    expect(demoGuestsAt([], { loop: 0, inLoopMs: 0, nowMs: NOW })).toEqual({
      states: [],
      parts: [],
    });
    const snapshot = demoSnapshotAt(10_000, NOW, undefined, []);
    expect(snapshot.guests).toEqual([]);
    expect(snapshot.sessions.status === 'ok' && snapshot.sessions.guests).toEqual([]);
  });

  it('reads no repository of a guest that has none', () => {
    const { parts } = demoGuestsAt([...FICTIONAL_GUESTS], { loop: 0, inLoopMs: 0, nowMs: NOW });
    expect(parts[0]?.repo).toBe('example-visitor/visitor-app');
    expect(parts[1]).toBeNull();
  });

  it('waits, works and rests through a loop', () => {
    const at = (inLoopMs: number) =>
      demoGuestsAt(BOTH_WITH_REPOS, { loop: 0, inLoopMs, nowMs: NOW }).states;
    expect(at(0)).toEqual(['working', 'awaiting-permission']);
    expect(at(20_000)).toEqual(['working', 'working']);
    expect(at(40_000)).toEqual(['resting', 'working']);
    expect(at(55_000)).toEqual(['resting', 'resting']);
  });

  it('makes valid snapshots all through two loops', () => {
    for (let elapsed = 0; elapsed <= 2 * DEMO_LOOP_MS; elapsed += 2_500) {
      const snapshot = demoSnapshotAt(elapsed, NOW + elapsed, undefined, BOTH_WITH_REPOS);
      expect(snapshotSchema.safeParse(snapshot).success, String(elapsed)).toBe(true);
    }
  });

  it('finishes one thing per guest and loop, which the screen tells once', () => {
    let seen = guestEvents(
      null,
      demoSnapshotAt(0, NOW, undefined, BOTH_WITH_REPOS).guests,
    ).baseline;
    const told: string[] = [];
    for (let elapsed = 5_000; elapsed <= 2 * DEMO_LOOP_MS; elapsed += 5_000) {
      const snapshot = demoSnapshotAt(elapsed, NOW + elapsed, undefined, BOTH_WITH_REPOS);
      const { events, baseline } = guestEvents(seen, snapshot.guests);
      seen = baseline;
      told.push(...events.map((e) => `${String(elapsed)}:${String(e.guest)}:${e.kind}`));
    }
    expect(told).toEqual([
      '35000:0:pr-merged',
      '50000:1:issue-completed',
      '95000:0:pr-merged',
      '110000:1:issue-completed',
    ]);
  });
});
