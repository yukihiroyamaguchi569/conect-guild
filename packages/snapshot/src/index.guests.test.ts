import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUEST_RECENT_LIMIT, guestGithubPartSchema, snapshotSchema } from './index.ts';

/** Issue #108: the guests of a v4 snapshot. */

const samplePath = new URL('../../../apps/web/public/snapshot.sample.json', import.meta.url);

function sample(): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(samplePath, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('sample is not an object');
  }
  return { ...value };
}

const T = '2026-10-12T00:00:00.000Z';
const OPEN = { number: 1, title: 't', isPr: false, createdAt: T, updatedAt: T };
const RECENT = { kind: 'issue-completed', number: 2, title: 't', at: T };
const PART = { repo: 'visitor/app', fetchedAt: T, open: [OPEN], recent: [RECENT] };
const FIVE = [null, '経理', '広報', '企画', '総務'].map((department) => ({
  department,
  state: 'idle',
}));

function withGuests(guests: unknown, sessionGuests: unknown = ['idle', 'working']) {
  return snapshotSchema.safeParse({
    ...sample(),
    sessions: { status: 'ok', checkedAt: T, members: FIVE, guests: sessionGuests },
    guests,
  });
}

describe('snapshotSchema: guests', () => {
  it('has fictional guests in the sample', () => {
    const parsed = snapshotSchema.parse(sample());
    expect(parsed.guests).toHaveLength(2);
    expect(parsed.sessions).toMatchObject({ status: 'ok', guests: ['working', 'resting'] });
  });

  it('accepts no guests, a part, or null (no repo, not fetched yet)', () => {
    expect(withGuests([], []).success).toBe(true);
    expect(withGuests([PART, null]).success).toBe(true);
    expect(withGuests([null, null]).success).toBe(true);
  });

  it('accepts guests with unavailable sessions', () => {
    const value = { ...sample(), sessions: { status: 'unavailable', checkedAt: T } };
    expect(snapshotSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a missing guests key', undefined],
    ['three guests', [null, null, null]],
    ['a name', [{ ...PART, name: 'たびびと' }, null]],
    ['a body', [{ ...PART, open: [{ ...OPEN, body: 'secret' }] }, null]],
    ['a branch name', [{ ...PART, open: [{ ...OPEN, headRef: 'secret/branch' }] }, null]],
    ['a repo without owner', [{ ...PART, repo: 'name-only' }, null]],
  ])('rejects %s', (_label, guests) => {
    expect(withGuests(guests).success).toBe(false);
  });

  it('rejects a session state count that differs from the guests count', () => {
    expect(withGuests([PART, null], ['idle']).success).toBe(false);
    expect(withGuests([PART], ['idle', 'idle']).success).toBe(false);
    expect(withGuests([], ['idle', 'idle', 'idle']).success).toBe(false);
  });
});

describe('guestGithubPartSchema', () => {
  it('accepts up to the recent limit, not one more', () => {
    const recent = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...RECENT, number: i + 1 }));
    expect(guestGithubPartSchema.safeParse({ ...PART, recent: recent(20) }).success).toBe(true);
    expect(GUEST_RECENT_LIMIT).toBe(20);
    expect(guestGithubPartSchema.safeParse({ ...PART, recent: recent(21) }).success).toBe(false);
  });

  it.each([
    ['a repeated open number', { open: [OPEN, OPEN] }],
    ['a repeated recent number', { recent: [RECENT, RECENT] }],
    ['an unknown recent kind', { recent: [{ ...RECENT, kind: 'issue-not-planned' }] }],
    ['a non-ISO time', { fetchedAt: 'yesterday' }],
  ])('rejects %s', (_label, patch) => {
    expect(guestGithubPartSchema.safeParse({ ...PART, ...patch }).success).toBe(false);
  });
});
