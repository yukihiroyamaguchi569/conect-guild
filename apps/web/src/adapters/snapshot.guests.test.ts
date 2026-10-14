import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuestGithubPart, Snapshot } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS } from '@conect-guild/snapshot/settings';
import { snapshot } from '../domain/fixtures.test-util';
import {
  defaultExpectedGuests,
  loadSnapshot,
  validateSnapshot,
  withFittingGuests,
} from './snapshot';

/** Issue #108: the guests of a v4 snapshot. Fictional repositories and titles only. */

const T = '2026-10-12T00:00:00Z';

function part(repo: string): GuestGithubPart {
  return {
    repo,
    fetchedAt: T,
    open: [{ number: 3, title: 'Fictional guest quest', isPr: false, createdAt: T, updatedAt: T }],
    recent: [{ kind: 'pr-merged', number: 2, title: 'Fictional guest PR', at: T }],
  };
}

function withGuests(guests: Snapshot['guests']): Snapshot {
  return snapshot({
    sessions: {
      status: 'ok',
      checkedAt: T,
      members: [null, ...DEPARTMENT_LABELS].map((department) => ({ department, state: 'idle' })),
      guests: guests.map(() => 'working'),
    },
    guests,
  });
}

const TWO = withGuests([part('visitor/app'), null]);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateSnapshot with guests', () => {
  it('keeps guests that fit the settings: same count, same repo or not fetched yet', () => {
    const result = validateSnapshot(TWO, null, ['visitor/app', null]);
    expect(result).toEqual({ ok: true, snapshot: TWO });
    const notYet = withGuests([null, null]);
    expect(validateSnapshot(notYet, null, ['visitor/app', 'other/app'])).toEqual({
      ok: true,
      snapshot: notYet,
    });
  });

  it.each([
    ['fewer guests in the settings', ['visitor/app']],
    ['more guests in the settings', ['visitor/app', null, null]],
    ['no guests in the settings', []],
    ['another repo', ['someone/else', null]],
    ['a repo that differs in case only', ['Visitor/App', null]],
    ['a part for a guest without a repo', [null, null]],
  ])('drops the guests but shows the rest for %s', (_label, expected) => {
    const result = validateSnapshot(TWO, null, expected);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.guests).toEqual([]);
    expect(result.snapshot.sessions).toMatchObject({ status: 'ok', guests: [] });
    expect({ ...result.snapshot, guests: TWO.guests, sessions: TWO.sessions }).toEqual(TWO);
  });

  it('drops the guests of unavailable sessions too, keeping the sessions as they are', () => {
    const unavailable = snapshot({ guests: [part('visitor/app')] });
    expect(withFittingGuests(unavailable, [])).toEqual({ ...unavailable, guests: [] });
  });

  it('checks nothing without expected guests (the fictional sample of a build)', () => {
    expect(validateSnapshot(TWO, null, null)).toEqual({ ok: true, snapshot: TWO });
  });

  it('refuses sessions whose guest count is not the guest parts count', () => {
    const broken = { ...TWO, guests: [null] };
    expect(validateSnapshot(broken, null, null)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a guest part with a body or a name', () => {
    const body = { ...TWO, guests: [{ ...part('visitor/app'), body: 'x' }, null] };
    const name = { ...TWO, guests: [{ ...part('visitor/app'), name: 'x' }, null] };
    expect(validateSnapshot(body)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateSnapshot(name)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('loadSnapshot with guests', () => {
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify(TWO)));

  it('drops guests that do not fit the given guests', async () => {
    const result = await loadSnapshot({ url: '/s.json', fetchFn, expectedGuests: [] });
    expect(result).toMatchObject({ ok: true, snapshot: { guests: [] } });
  });

  it("expects the settings' guests for the real data in dev mode", () => {
    vi.stubEnv('DEV', true);
    expect(defaultExpectedGuests()).toEqual([]);
  });

  it('expects none for the fictional sample in a build', () => {
    vi.stubEnv('DEV', false);
    expect(defaultExpectedGuests()).toBeNull();
  });
});
