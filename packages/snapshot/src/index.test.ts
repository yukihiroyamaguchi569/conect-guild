import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_SCHEMA_VERSION, snapshotSchema } from './index.ts';

const samplePath = new URL('../../../apps/web/public/snapshot.sample.json', import.meta.url);

function loadSample(): unknown {
  return JSON.parse(readFileSync(samplePath, 'utf8'));
}

function sampleRecord(): Record<string, unknown> {
  const sample = loadSample();
  if (typeof sample !== 'object' || sample === null || Array.isArray(sample)) {
    throw new Error('sample is not an object');
  }
  return { ...sample };
}

describe('snapshotSchema', () => {
  it('accepts the dummy sample used by build and CI', () => {
    const result = snapshotSchema.safeParse(loadSample());
    expect(result.success).toBe(true);
    expect(result.data?.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it.each([1, 2, 3, 5])('rejects schemaVersion %i', (version) => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), schemaVersion: version }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys so bodies cannot slip in', () => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), body: 'x' }).success).toBe(false);
    const issue = {
      number: 1,
      title: 't',
      labels: [],
      state: 'open',
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
      closedAt: null,
      body: 'secret',
    };
    expect(snapshotSchema.safeParse({ ...sampleRecord(), issues: [issue] }).success).toBe(false);
  });

  it.each([
    ['a non-ISO time', { fetchedAt: 'yesterday' }],
    ['a repo without owner', { repo: 'name-only' }],
    ['a missing prs array', { prs: undefined }],
  ])('rejects %s', (_label, patch) => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), ...patch }).success).toBe(false);
  });
});

const CHECKED_AT = '2026-10-12T09:00:05.000Z';

const FIVE: readonly Record<string, unknown>[] = [
  { department: null, state: 'awaiting-permission' },
  { department: '経理', state: 'working' },
  { department: '広報', state: 'resting' },
  { department: '企画', state: 'idle' },
  { department: '総務', state: 'idle' },
];

function withSessions(sessions: unknown) {
  return snapshotSchema.safeParse({ ...sampleRecord(), sessions, guests: [] });
}

/** `ok` sessions with the five members, the first one patched. */
function okWithFirst(patch: Record<string, unknown>) {
  const [first, ...rest] = FIVE;
  return {
    status: 'ok',
    checkedAt: CHECKED_AT,
    members: [{ ...first, ...patch }, ...rest],
    guests: [],
  };
}

describe('snapshotSchema: sessions', () => {
  it('accepts unavailable sessions', () => {
    expect(withSessions({ status: 'unavailable', checkedAt: CHECKED_AT }).success).toBe(true);
  });

  it('accepts かなめ (department null) and the four departments in any order', () => {
    const members = FIVE.toReversed();
    expect(withSessions({ status: 'ok', checkedAt: CHECKED_AT, members, guests: [] }).success).toBe(
      true,
    );
  });

  it.each([
    ['missing sessions', undefined],
    ['an unknown status', { status: 'maybe', checkedAt: CHECKED_AT }],
    ['a missing checkedAt', { status: 'unavailable' }],
    ['members on unavailable', { status: 'unavailable', checkedAt: CHECKED_AT, members: [] }],
    [
      'a path slipped into the sessions',
      { status: 'unavailable', checkedAt: CHECKED_AT, cwd: '/home/someone' },
    ],
  ])('rejects %s', (_label, sessions) => {
    expect(withSessions(sessions).success).toBe(false);
  });
});

describe('snapshotSchema: session members', () => {
  it.each([
    ['an empty member list', []],
    ['a missing department', FIVE.slice(1)],
    ['a sixth entry', [...FIVE, { department: '経理', state: 'idle' }]],
    ['two entries for one department', [...FIVE.slice(0, 4), { department: null, state: 'idle' }]],
  ])('rejects %s', (_label, members) => {
    expect(withSessions({ status: 'ok', checkedAt: CHECKED_AT, members, guests: [] }).success).toBe(
      false,
    );
  });

  it.each([
    ['an unknown state', { state: 'busy' }],
    ['an unknown department', { department: '営業' }],
    ['a session id slipped into a member', { id: '00000000-0000-0000-0000-000000000000' }],
  ])('rejects %s', (_label, patch) => {
    expect(withSessions(okWithFirst(patch)).success).toBe(false);
    expect(withSessions(okWithFirst({})).success).toBe(true);
  });
});

const EMPTY_HISTORY = { openedIssueCount: 0, completedIssues: [], mergedPrs: [] };

function withHistory(patch: Record<string, unknown>) {
  return snapshotSchema.safeParse({ ...sampleRecord(), history: { ...EMPTY_HISTORY, ...patch } });
}

describe('snapshotSchema: history', () => {
  it('accepts an empty history and one with numbers and departments only', () => {
    expect(withHistory({}).success).toBe(true);
    const history = {
      openedIssueCount: 3,
      completedIssues: [
        { number: 1, departments: ['経理', '総務'] },
        { number: 2, departments: [] },
      ],
      mergedPrs: [
        { number: 3, linkedIssues: [1], branchDepartment: null },
        { number: 4, linkedIssues: [], branchDepartment: '広報' },
      ],
    };
    expect(withHistory(history).success).toBe(true);
  });

  it.each([
    ['a missing history', undefined],
    ['a missing count', { completedIssues: [], mergedPrs: [] }],
  ])('rejects %s', (_label, history) => {
    expect(snapshotSchema.safeParse({ ...sampleRecord(), history }).success).toBe(false);
  });
});

describe('snapshotSchema: history contents', () => {
  it.each([
    ['a negative count', { openedIssueCount: -1 }],
    ['a fractional count', { openedIssueCount: 1.5 }],
    ['more completed Issues than opened', { completedIssues: [{ number: 1, departments: [] }] }],
    [
      'the same Issue twice',
      {
        openedIssueCount: 2,
        completedIssues: [
          { number: 1, departments: [] },
          { number: 1, departments: [] },
        ],
      },
    ],
    [
      'the same PR twice',
      {
        mergedPrs: [
          { number: 1, linkedIssues: [], branchDepartment: null },
          { number: 1, linkedIssues: [], branchDepartment: null },
        ],
      },
    ],
    [
      'a label that is not a department',
      { openedIssueCount: 1, completedIssues: [{ number: 1, departments: ['bug'] }] },
    ],
    [
      'a department twice',
      { openedIssueCount: 1, completedIssues: [{ number: 1, departments: ['経理', '経理'] }] },
    ],
    [
      'departments out of the fixed order',
      { openedIssueCount: 1, completedIssues: [{ number: 1, departments: ['総務', '経理'] }] },
    ],
    [
      'a title slipped into an Issue',
      { openedIssueCount: 1, completedIssues: [{ number: 1, departments: [], title: 't' }] },
    ],
    [
      'a closing time slipped into an Issue',
      {
        openedIssueCount: 1,
        completedIssues: [{ number: 1, departments: [], closedAt: '2026-10-12T00:00:00.000Z' }],
      },
    ],
    [
      'a branch name slipped into a PR',
      { mergedPrs: [{ number: 1, linkedIssues: [], branchDepartment: null, headRef: 'pr/x' }] },
    ],
    [
      'a branch name instead of a department',
      { mergedPrs: [{ number: 1, linkedIssues: [], branchDepartment: 'pr/x' }] },
    ],
    ['all labels slipped into the history', { labels: ['経理'] }],
  ])('rejects %s', (_label, patch) => {
    expect(withHistory(patch).success).toBe(false);
  });
});
