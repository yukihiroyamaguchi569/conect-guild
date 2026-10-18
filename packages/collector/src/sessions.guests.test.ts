import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Seat } from './seat.ts';
import { sessionsSummary } from './report.ts';
import { createCompanySessionsReader } from './sessionFiles.ts';
import { latestCompanySessionIds, readSeatStates } from './sessions.ts';

/** Issue #108: the guests' sessions are read like the company's, by exact match only. */

const ROOT = '/home/u/company';
const VISITOR = '/home/u/visitor-app';
const WANDERER = '/srv/wanderer';

/** The company seats with two guests, the second listed before the first on purpose. */
const SEATS: readonly Seat[] = [
  { kind: 'company', department: null, cwd: ROOT },
  { kind: 'company', department: '経理', cwd: `${ROOT}/accounting` },
  { kind: 'guest', index: 1, cwd: WANDERER },
  { kind: 'guest', index: 0, cwd: VISITOR },
];

const KANAME = 'aaaaaaaa-0000-4000-8000-000000000001';
const GUEST_A = 'cccccccc-0000-4000-8000-000000000001';
const GUEST_B = 'cccccccc-0000-4000-8000-000000000002';
/** Sessions outside the company and the guests: their ids and paths must never come out. */
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000f';
const OTHER_PATH = '/home/u/secret-client-project';

describe('latestCompanySessionIds with guests', () => {
  it('keeps the guest paths like the company ones', async () => {
    const ids = await latestCompanySessionIds(
      [`${KANAME} ${ROOT}`, `${GUEST_A} ${VISITOR}`, `${GUEST_B} ${WANDERER}`],
      SEATS,
    );
    expect(ids.get(VISITOR)).toBe(GUEST_A);
    expect(ids.get(WANDERER)).toBe(GUEST_B);
  });

  it('matches guest paths exactly: no trailing slash, child, worktree or case', async () => {
    const ids = await latestCompanySessionIds(
      [
        `${OTHER} ${VISITOR}/`,
        `${OTHER} ${VISITOR}/sub`,
        `${OTHER} ${VISITOR}/.claude/worktrees/x`,
        `${OTHER} ${VISITOR.toUpperCase()}`,
        `${OTHER} ${VISITOR}-old`,
      ],
      SEATS,
    );
    expect(ids.size).toBe(0);
  });

  it('drops a guest id that moved to another directory', async () => {
    const ids = await latestCompanySessionIds(
      [`${GUEST_A} ${VISITOR}`, `${GUEST_A} ${OTHER_PATH}`],
      SEATS,
    );
    expect(ids.size).toBe(0);
  });
});

describe('readSeatStates with guests', () => {
  const ids = new Map([
    [ROOT, KANAME],
    [VISITOR, GUEST_A],
  ]);

  it('gives the guests their states in the settings order, apart from the members', () => {
    const text = JSON.stringify({
      [KANAME]: { working: true, waiting: false, event: 'PreToolUse' },
      [GUEST_A]: { working: false, waiting: true, event: 'Notification' },
      [OTHER]: { working: true, waiting: false, event: 'PreToolUse' },
    });
    expect(readSeatStates(text, SEATS, ids)).toEqual({
      ok: true,
      members: [
        { department: null, state: 'working' },
        { department: '経理', state: 'idle' },
      ],
      guests: ['awaiting-permission', 'idle'],
      found: 1,
      guestsFound: 1,
    });
  });

  it('fails the whole reading when a guest entry has the wrong shape', () => {
    const text = JSON.stringify({ [GUEST_A]: { working: 'yes' } });
    expect(readSeatStates(text, SEATS, ids)).toEqual({ ok: false, kind: 'invalid' });
  });
});

describe('the sessions reader with guests', () => {
  it('reads the guests from the files and leaves nothing of the other lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'guild-guest-sessions-'));
    try {
      const visitor = join(dir, 'visitor');
      const other = join(dir, 'secret-client');
      const paths = {
        seats: [
          { kind: 'company', department: null, cwd: join(dir, 'company') },
          { kind: 'guest', index: 0, cwd: visitor },
        ] satisfies Seat[],
        cwdLogPath: join(dir, 'dev-terminal-cwds.json'),
        activityStatePath: join(dir, 'activity-state.json'),
      };
      const log = [`${OTHER} ${other}`, `${GUEST_A} ${visitor}`, `${OTHER} ${visitor}/child`];
      await writeFile(paths.cwdLogPath, log.map((line) => `\n${line}`).join(''));
      await writeFile(
        paths.activityStatePath,
        JSON.stringify({
          [GUEST_A]: { working: true, waiting: false, event: 'PreToolUse' },
          [OTHER]: { working: false, waiting: true, event: 'Notification' },
        }),
      );
      const result = await createCompanySessionsReader(paths)();
      expect(result).toMatchObject({ ok: true, guests: ['working'], guestsFound: 1, found: 0 });
      const text = JSON.stringify(result) + sessionsSummary(result);
      for (const secret of [OTHER, other, visitor, GUEST_A, dir])
        expect(text).not.toContain(secret);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('sessionsSummary with guests', () => {
  it('adds how many guests have a session, only when there are guests', () => {
    const base = { ok: true, members: [], found: 5 } as const;
    expect(sessionsSummary({ ...base, guests: [], guestsFound: 0 })).toBe('sessions=5 ok');
    expect(sessionsSummary({ ...base, guests: ['idle', 'working'], guestsFound: 1 })).toBe(
      'sessions=5 ok guests=1',
    );
  });
});
