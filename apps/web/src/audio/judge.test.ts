import { describe, expect, it } from 'vitest';
import type { GuildEvent, GuildEventKind } from '../domain/events';
import { callRings, cueForMessage, mayPlay, newlyAwaiting, type PartyMember } from './judge';

const event = (kind: GuildEventKind): GuildEvent => ({
  id: `${kind}#1`,
  kind,
  number: 1,
  department: null,
});

describe('cueForMessage', () => {
  it.each([
    ['issue-opened', 'scroll'],
    ['pr-merged', 'chest'],
    ['issue-closed', 'clear'],
    ['level-up', 'levelup'],
    ['king-quest-opened', 'scroll'],
    ['king-quest-cleared', 'clear'],
  ] as const)('%s plays %s', (kind, cue) => {
    expect(cueForMessage({ event: event(kind) })).toBe(cue);
  });

  it('a notice (no event) plays the soft text blips', () => {
    expect(cueForMessage({ event: null })).toBe('text');
  });
});

const party = (...awaiting: PartyMember['id'][]): PartyMember[] =>
  (['kaname', 'minori', 'hibiki', 'hirame', 'sasae', 'yukihiro'] as const).map((id) => ({
    id,
    state: awaiting.includes(id) ? 'awaiting-permission' : 'working',
  }));

describe('callRings', () => {
  it('rings when no other sound has played, or once the last one is over', () => {
    expect(callRings(0, null)).toBe(true);
    expect(callRings(1_000, 1_000)).toBe(true);
    expect(callRings(1_001, 1_000)).toBe(true);
  });

  it('gives way while another sound still plays', () => {
    expect(callRings(999, 1_000)).toBe(false);
  });
});

describe('newlyAwaiting', () => {
  it('finds a member who starts waiting', () => {
    expect(newlyAwaiting(party(), party('minori'))).toEqual(['minori']);
  });

  it('does not repeat for a member who keeps waiting', () => {
    expect(newlyAwaiting(party('minori'), party('minori'))).toEqual([]);
  });

  it('finds only the new one when another keeps waiting', () => {
    expect(newlyAwaiting(party('minori'), party('minori', 'kaname'))).toEqual(['kaname']);
  });

  it('finds several who start together', () => {
    // In party order (the order of `next`).
    expect(newlyAwaiting(party(), party('sasae', 'hibiki'))).toEqual(['hibiki', 'sasae']);
  });

  it('ignores members who stop waiting', () => {
    expect(newlyAwaiting(party('minori'), party())).toEqual([]);
  });

  it('counts a member who waits again after a break as new', () => {
    const first = party('minori');
    const between = party();
    expect(newlyAwaiting(first, between)).toEqual([]);
    expect(newlyAwaiting(between, party('minori'))).toEqual(['minori']);
  });

  it('treats nobody as new on the first party (no previous one)', () => {
    expect(newlyAwaiting(null, party('minori', 'kaname'))).toEqual([]);
  });

  it('ignores other waiting states', () => {
    const next = party().map((row) =>
      row.id === 'yukihiro' ? { ...row, state: 'awaiting-president' as const } : row,
    );
    expect(newlyAwaiting(party(), next)).toEqual([]);
  });
});

describe('mayPlay', () => {
  it('plays only when on, shown and not halted', () => {
    expect(mayPlay({ enabled: true, hidden: false, halted: false })).toBe(true);
  });

  it.each([
    { enabled: false, hidden: false, halted: false },
    { enabled: true, hidden: true, halted: false },
    { enabled: true, hidden: false, halted: true },
    { enabled: false, hidden: true, halted: true },
  ])('stays silent for %o', (gate) => {
    expect(mayPlay(gate)).toBe(false);
  });
});
