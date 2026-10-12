import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import {
  defaultExpectedRepo,
  defaultSnapshotUrl,
  loadSnapshot,
  validateSnapshot,
  type FetchFn,
} from './snapshot';

const validSnapshot = {
  schemaVersion: 3,
  fetchedAt: '2026-10-12T00:00:00Z',
  repo: 'example/guild',
  issues: [
    {
      number: 1,
      title: 'Fictional quest',
      labels: ['経理'],
      state: 'open',
      createdAt: '2026-10-11T00:00:00Z',
      updatedAt: '2026-10-11T00:00:00Z',
      closedAt: null,
    },
  ],
  prs: [],
  history: { openedIssueCount: 1, completedIssues: [], mergedPrs: [] },
  sessions: {
    status: 'ok',
    checkedAt: '2026-10-12T00:00:05Z',
    members: [
      { department: null, state: 'working' },
      { department: '経理', state: 'awaiting-permission' },
      { department: '広報', state: 'resting' },
      { department: '企画', state: 'idle' },
      { department: '総務', state: 'idle' },
    ],
  },
};

function respondWith(body: string, status = 200): FetchFn {
  return () => Promise.resolve(new Response(body, { status }));
}

/** A fetch that only settles when its signal aborts, like a hung server. */
const hangingFetch: FetchFn = (_input, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

describe('loadSnapshot', () => {
  it('returns the validated snapshot', async () => {
    const result = await loadSnapshot({
      url: '/s.json',
      fetchFn: respondWith(JSON.stringify(validSnapshot)),
    });
    expect(result).toEqual({ ok: true, snapshot: validSnapshot });
  });

  it('requests the given URL with no-store and an abort signal', async () => {
    const fetchFn = vi.fn<FetchFn>(respondWith(JSON.stringify(validSnapshot)));
    await loadSnapshot({ url: '/s.json', fetchFn });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [input, init] = fetchFn.mock.calls[0] ?? [];
    expect(input).toBe('/s.json');
    expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a network error without throwing', async () => {
    const fetchFn: FetchFn = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(loadSnapshot({ url: '/s.json', fetchFn })).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it.each([400, 403, 405, 500, 503])('reports HTTP %i with its status', async (status) => {
    const result = await loadSnapshot({ url: '/s.json', fetchFn: respondWith('nope', status) });
    expect(result).toEqual({ ok: false, reason: 'http', status });
  });

  it('reports a 404 as not collected yet, without reading the body (Issue #67)', async () => {
    const response = new Response('nope', { status: 404 });
    const text = vi.spyOn(response, 'text');
    const result = await loadSnapshot({ url: '/s.json', fetchFn: () => Promise.resolve(response) });
    expect(result).toEqual({ ok: false, reason: 'not-collected' });
    expect(text).not.toHaveBeenCalled();
  });
});

describe('loadSnapshot: timeouts', () => {
  it('times out a hung request and aborts it', async () => {
    const fetchFn = vi.fn<FetchFn>(hangingFetch);
    const result = await loadSnapshot({ url: '/s.json', fetchFn, timeoutMs: 5 });
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(fetchFn.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });

  it('times out while reading a hung body', async () => {
    const fetchFn: FetchFn = (_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
      });
      return Promise.resolve(new Response(body));
    };
    await expect(loadSnapshot({ url: '/s.json', fetchFn, timeoutMs: 5 })).resolves.toEqual({
      ok: false,
      reason: 'timeout',
    });
  });

  it('reports a body read failure that is not a timeout as a network error', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('connection reset'));
      },
    });
    const fetchFn: FetchFn = () => Promise.resolve(new Response(body));
    await expect(loadSnapshot({ url: '/s.json', fetchFn })).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
  });
});

describe('loadSnapshot: bodies', () => {
  it.each(['', '{', '{"schemaVersion":2,', '<html>404</html>'])(
    'reports broken JSON %j as parse',
    async (body) => {
      const result = await loadSnapshot({ url: '/s.json', fetchFn: respondWith(body) });
      expect(result).toEqual({ ok: false, reason: 'parse' });
    },
  );

  it('reports a v1 snapshot from an old collector as schema-version', async () => {
    // JSON.stringify drops the undefined sessions, as an old collector wrote no sessions key.
    const body = JSON.stringify({ ...validSnapshot, schemaVersion: 1, sessions: undefined });
    const result = await loadSnapshot({ url: '/s.json', fetchFn: respondWith(body) });
    expect(result).toEqual({ ok: false, reason: 'schema-version' });
  });

  it('reports a v2 snapshot (no history) from the previous collector as schema-version', async () => {
    const body = JSON.stringify({ ...validSnapshot, schemaVersion: 2, history: undefined });
    const result = await loadSnapshot({ url: '/s.json', fetchFn: respondWith(body) });
    expect(result).toEqual({ ok: false, reason: 'schema-version' });
  });

  it('clears its timer after success', async () => {
    vi.useFakeTimers();
    try {
      await loadSnapshot({ url: '/s.json', fetchFn: respondWith(JSON.stringify(validSnapshot)) });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('validateSnapshot', () => {
  it.each([
    ['the version before history (2)', { ...validSnapshot, schemaVersion: 2 }],
    ['the version before sessions (1)', { ...validSnapshot, schemaVersion: 1 }],
    ['a newer version', { ...validSnapshot, schemaVersion: 4 }],
    ['version 0', { ...validSnapshot, schemaVersion: 0 }],
    ['an otherwise empty object with another version', { schemaVersion: 99 }],
  ])('reports schema-version for %s', (_label, value) => {
    expect(validateSnapshot(value)).toEqual({ ok: false, reason: 'schema-version' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'snapshot'],
    ['a missing schemaVersion', { ...validSnapshot, schemaVersion: undefined }],
    ['a string schemaVersion', { ...validSnapshot, schemaVersion: '1' }],
    ['a missing issues array', { ...validSnapshot, issues: undefined }],
    ['missing sessions', { ...validSnapshot, sessions: undefined }],
    ['a missing history', { ...validSnapshot, history: undefined }],
    [
      'a title in the history',
      {
        ...validSnapshot,
        history: {
          ...validSnapshot.history,
          completedIssues: [{ number: 1, departments: [], title: 't' }],
        },
      },
    ],
    [
      'a session id in the sessions',
      { ...validSnapshot, sessions: { ...validSnapshot.sessions, id: 'x' } },
    ],
    ['an unknown top-level key', { ...validSnapshot, body: 'secret' }],
    ['a bad fetchedAt', { ...validSnapshot, fetchedAt: 'yesterday' }],
    [
      'a bad issue state',
      { ...validSnapshot, issues: [{ ...validSnapshot.issues[0], state: 'x' }] },
    ],
  ])('reports invalid for %s', (_label, value) => {
    expect(validateSnapshot(value)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts the current version', () => {
    expect(validateSnapshot(validSnapshot)).toEqual({ ok: true, snapshot: validSnapshot });
  });
});

describe('defaultSnapshotUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the dev-server route in dev mode', () => {
    vi.stubEnv('DEV', true);
    expect(defaultSnapshotUrl()).toBe('/snapshot.json');
  });

  it('reads only the fictional sample in a build', () => {
    vi.stubEnv('DEV', false);
    expect(defaultSnapshotUrl()).toBe('/snapshot.sample.json');
  });
});

describe('repository check', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports a snapshot of another repository as repo-mismatch', () => {
    expect(validateSnapshot(validSnapshot, 'new-team/company')).toEqual({
      ok: false,
      reason: 'repo-mismatch',
    });
  });

  it('accepts the expected repository, and anything when none is expected', () => {
    expect(validateSnapshot(validSnapshot, 'example/guild').ok).toBe(true);
    expect(validateSnapshot(validSnapshot, null).ok).toBe(true);
  });

  it('still reports schema-version first', () => {
    const old = { ...validSnapshot, schemaVersion: 1 };
    expect(validateSnapshot(old, 'new-team/company')).toEqual({
      ok: false,
      reason: 'schema-version',
    });
  });

  it('reports repo-mismatch before checking the rest', () => {
    expect(validateSnapshot({ ...validSnapshot, issues: 1 }, 'new-team/company')).toEqual({
      ok: false,
      reason: 'repo-mismatch',
    });
  });
});

describe('repository check: order and loading', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports repo-mismatch for an old snapshot whose departments no longer validate', () => {
    // The settings changed both the repository and the department labels.
    const old = {
      ...validSnapshot,
      repo: 'old-team/company',
      issues: [],
      sessions: {
        ...validSnapshot.sessions,
        members: validSnapshot.sessions.members.map((m) => ({
          ...m,
          department: m.department === null ? null : `旧${m.department}`,
        })),
      },
    };
    expect(validateSnapshot(old, null)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateSnapshot(old, 'example/guild')).toEqual({
      ok: false,
      reason: 'repo-mismatch',
    });
  });

  it('reports invalid, not repo-mismatch, when the repository is missing', () => {
    expect(validateSnapshot({ ...validSnapshot, repo: undefined }, 'example/guild')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('checks the repository when loading', async () => {
    const result = await loadSnapshot({
      url: '/s.json',
      fetchFn: respondWith(JSON.stringify(validSnapshot)),
      expectedRepo: 'new-team/company',
    });
    expect(result).toEqual({ ok: false, reason: 'repo-mismatch' });
  });

  it('expects the settings repository for the real data in dev mode', () => {
    vi.stubEnv('DEV', true);
    expect(defaultExpectedRepo()).toBe(GUILD_SETTINGS.repo);
  });

  it('expects none for the fictional sample in a build', () => {
    vi.stubEnv('DEV', false);
    expect(defaultExpectedRepo()).toBeNull();
  });
});
