import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLECTOR_CONFIG, sessionSeatsOf, expandHome } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';

describe('COLLECTOR_CONFIG', () => {
  it('targets the fixed repository every 60 seconds', () => {
    expect(COLLECTOR_CONFIG.repo).toBe('yukihiroyamaguchi569/conect-management');
    expect(COLLECTOR_CONFIG.intervalMs).toBe(60_000);
  });

  it('writes to apps/web/.data/snapshot.json resolved from the repository root', () => {
    expect(COLLECTOR_CONFIG.snapshotPath).toBe(
      fileURLToPath(new URL('../../../apps/web/.data/snapshot.json', import.meta.url)),
    );
  });
});

describe('COLLECTOR_CONFIG.sessions', () => {
  it('fixes the five company directories under the home directory', () => {
    const root = `${homedir()}/conect-management`;
    expect(COLLECTOR_CONFIG.sessions.seats).toEqual([
      { kind: 'company', department: null, cwd: root },
      { kind: 'company', department: '経理', cwd: `${root}/accounting` },
      { kind: 'company', department: '広報', cwd: `${root}/pr` },
      { kind: 'company', department: '企画', cwd: `${root}/planning` },
      { kind: 'company', department: '総務', cwd: `${root}/general-affairs` },
    ]);
  });

  it('reads MulmoTerminal files every 5 seconds', () => {
    expect(COLLECTOR_CONFIG.sessions.intervalMs).toBe(5_000);
    expect(COLLECTOR_CONFIG.sessions.cwdLogPath).toBe(
      `${homedir()}/.mulmoterminal/dev-terminal-cwds.json`,
    );
    expect(COLLECTOR_CONFIG.sessions.activityStatePath).toBe(
      `${homedir()}/.mulmoterminal/activity-state.json`,
    );
  });
});

describe('expandHome', () => {
  it.each([
    ['~', '/home/me'],
    ['~/conect-management', '/home/me/conect-management'],
    ['~/a/b c', '/home/me/a/b c'],
    ['/srv/company', '/srv/company'],
    ['/srv/~/x', '/srv/~/x'],
  ])('turns %j into %j', (dir, expected) => {
    expect(expandHome(dir, '/home/me')).toBe(expected);
  });
});

describe('sessionSeatsOf', () => {
  const departments = [
    { label: '経理', sessionDir: '~/c/accounting' },
    { label: '広報', sessionDir: '/srv/pr' },
  ] as const;

  it('expands the directories in order, the 司令塔 first', () => {
    expect(sessionSeatsOf({ commanderSessionDir: '~/c', departments }, '/home/me')).toEqual([
      { kind: 'company', department: null, cwd: '/home/me/c' },
      { kind: 'company', department: '経理', cwd: '/home/me/c/accounting' },
      { kind: 'company', department: '広報', cwd: '/srv/pr' },
    ]);
  });

  it('stops when two seats expand to the same directory', () => {
    expect(() =>
      sessionSeatsOf(
        { commanderSessionDir: '~', departments: [{ label: '経理', sessionDir: '/home/me' }] },
        '/home/me',
      ),
    ).toThrow(/same directory/);
    expect(() =>
      sessionSeatsOf(
        { commanderSessionDir: '~/c', departments: [{ label: '経理', sessionDir: '/home/me/c' }] },
        '/home/me',
      ),
    ).toThrow(/same directory/);
  });

  it('adds the guests after the company, in their order (Issue #108)', () => {
    const guests = [{ sessionDir: '~/visitor' }, { sessionDir: '/srv/wanderer' }];
    expect(sessionSeatsOf({ commanderSessionDir: '~/c', departments, guests }, '/home/me')).toEqual(
      [
        { kind: 'company', department: null, cwd: '/home/me/c' },
        { kind: 'company', department: '経理', cwd: '/home/me/c/accounting' },
        { kind: 'company', department: '広報', cwd: '/srv/pr' },
        { kind: 'guest', index: 0, cwd: '/home/me/visitor' },
        { kind: 'guest', index: 1, cwd: '/srv/wanderer' },
      ],
    );
  });

  it('stops when a guest expands to a company or another guest directory', () => {
    const seats = (guests: readonly { sessionDir: string }[]) =>
      sessionSeatsOf({ commanderSessionDir: '~/c', departments, guests }, '/home/me');
    expect(() => seats([{ sessionDir: '/home/me/c/accounting' }])).toThrow(/same directory/);
    expect(() => seats([{ sessionDir: '~/v' }, { sessionDir: '/home/me/v' }])).toThrow(
      /same directory/,
    );
  });
});

describe('parseCliArgs', () => {
  it('returns once for exactly --once', () => {
    expect(parseCliArgs(['--once'])).toBe('once');
  });

  it('returns loop with no arguments', () => {
    expect(parseCliArgs([])).toBe('loop');
  });

  it.each([
    [['--once', '--once']],
    [['--repo', 'other/repo']],
    [['--once', 'extra']],
    [['once']],
    [['--ONCE']],
  ])('rejects %j', (args) => {
    expect(parseCliArgs(args)).toBe('invalid');
  });
});
