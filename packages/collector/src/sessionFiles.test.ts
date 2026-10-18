import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Seat } from './seat.ts';
import {
  MAX_ACTIVITY_STATE_BYTES,
  MAX_CWD_LOG_BYTES,
  createCompanySessionsReader,
  type SessionFilePaths,
} from './sessionFiles.ts';

const KANAME = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000f';
const OTHER_PATH = '/home/u/secret-client-project';

let dir = '';
let paths: SessionFilePaths;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'guild-sessions-'));
  const root = join(dir, 'conect-management');
  const seats: Seat[] = [
    { kind: 'company', department: null, cwd: root },
    { kind: 'company', department: '経理', cwd: join(root, 'accounting') },
  ];
  paths = {
    seats,
    cwdLogPath: join(dir, 'dev-terminal-cwds.json'),
    activityStatePath: join(dir, 'activity-state.json'),
  };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The first read of a new reader (an unterminated last line does not count yet). */
function readCompanySessions(target: SessionFilePaths, signal?: AbortSignal) {
  return createCompanySessionsReader(target)(signal);
}

async function writeCwdLog(...lines: string[]): Promise<void> {
  // MulmoTerminal appends each record with the newline in front.
  await writeFile(paths.cwdLogPath, lines.map((line) => `\n${line}`).join(''));
}

describe('readCompanySessions', () => {
  it('reads both files and returns the seats only', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    await writeCwdLog(`${OTHER} ${OTHER_PATH}`, `${KANAME} ${root}`);
    await writeFile(
      paths.activityStatePath,
      JSON.stringify({
        [OTHER]: { working: true, waiting: false, event: 'PreToolUse' },
        [KANAME]: { working: false, waiting: true, event: 'Notification' },
      }),
    );
    const read = createCompanySessionsReader(paths);
    await read();
    const result = await read();
    expect(result).toEqual({
      ok: true,
      found: 1,
      members: [
        { department: null, state: 'awaiting-permission' },
        { department: '経理', state: 'idle' },
      ],
      guests: [],
      guestsFound: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(new RegExp(`${OTHER}|${OTHER_PATH}|${dir}`));
  });

  it('reads a large log with many company relaunches in one pass', async () => {
    // A fixed short root (matched as a string, never touched on disk) keeps the log size independent of TMPDIR.
    const root = '/guild/conect-management';
    const seats: Seat[] = [
      { kind: 'company', department: null, cwd: root },
      { kind: 'company', department: '経理', cwd: `${root}/accounting` },
    ];
    const id = (i: number) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
    // About 13 MB, well under the 16 MiB cap: 200k lines, half of them new company sessions at かなめ's path.
    const lines = Array.from({ length: 200_000 }, (_, i) =>
      i % 2 === 0 ? `${id(i)} ${root}` : `${OTHER} ${OTHER_PATH}/${'x'.repeat(i % 7)}`,
    );
    await writeFile(paths.cwdLogPath, lines.map((line) => `\n${line}`).join(''));
    expect((await stat(paths.cwdLogPath)).size).toBeLessThan(15_000_000);
    await writeFile(
      paths.activityStatePath,
      JSON.stringify({ [id(199_998)]: { working: true, waiting: false, event: null } }),
    );
    const started = performance.now();
    await expect(readCompanySessions({ ...paths, seats })).resolves.toMatchObject({
      ok: true,
      found: 1,
      members: [{ department: null, state: 'working' }, expect.anything()],
    });
    expect(performance.now() - started).toBeLessThan(3_000);
  });
});

describe('readCompanySessions: a half-written last line', () => {
  const MINORI = 'aaaaaaaa-0000-4000-8000-000000000003';

  it('waits for the last line to stay the same before taking it', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    await writeFile(
      paths.activityStatePath,
      JSON.stringify({
        [KANAME]: { working: false, waiting: true, event: 'Notification' },
        [MINORI]: { working: true, waiting: false, event: 'PreToolUse' },
      }),
    );
    const read = createCompanySessionsReader(paths);
    const states = async () => {
      const result = await read();
      return result.ok ? result.members.map((m) => m.state) : result.kind;
    };
    // 経理's record caught while it was written: cut right after the company root.
    await writeFile(paths.cwdLogPath, `\n${KANAME} ${root}\n${MINORI} ${root}`);
    expect(await states()).toEqual(['awaiting-permission', 'idle']);
    await writeFile(paths.cwdLogPath, `\n${KANAME} ${root}\n${MINORI} ${root}/accounting`);
    expect(await states()).toEqual(['awaiting-permission', 'idle']);
    expect(await states()).toEqual(['awaiting-permission', 'working']);
  });
});

describe('readCompanySessions: failures', () => {
  it('ends with read-failed when the signal aborts', async () => {
    await writeCwdLog();
    await writeFile(paths.activityStatePath, '{}');
    const controller = new AbortController();
    controller.abort();
    await expect(readCompanySessions(paths, controller.signal)).resolves.toEqual({
      ok: false,
      kind: 'read-failed',
    });
  });

  it('is missing when the cwd log does not exist', async () => {
    await writeFile(paths.activityStatePath, '{}');
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'missing' });
  });

  it('is missing when the activity file does not exist', async () => {
    await writeCwdLog();
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'missing' });
  });

  it('is read-failed when a path is a directory', async () => {
    await writeFile(paths.cwdLogPath, '');
    await expect(readCompanySessions({ ...paths, activityStatePath: dir })).resolves.toEqual({
      ok: false,
      kind: 'read-failed',
    });
  });
});

describe('readCompanySessions: size and contents', () => {
  it('is too-large when the cwd log passes its limit', async () => {
    await writeFile(paths.cwdLogPath, Buffer.alloc(MAX_CWD_LOG_BYTES + 1, 0x61));
    await writeFile(paths.activityStatePath, '{}');
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'too-large' });
  });

  it('is too-large when the activity file passes its limit, and reads it at the limit', async () => {
    await writeCwdLog();
    await writeFile(paths.activityStatePath, `{}${' '.repeat(MAX_ACTIVITY_STATE_BYTES - 2)}`);
    await expect(readCompanySessions(paths)).resolves.toMatchObject({ ok: true });
    await writeFile(paths.activityStatePath, `{}${' '.repeat(MAX_ACTIVITY_STATE_BYTES - 1)}`);
    await expect(readCompanySessions(paths)).resolves.toEqual({ ok: false, kind: 'too-large' });
  });

  it.each([
    ['empty', ''],
    ['half written', '{"a":'],
  ])('is parse-failed when the activity file is %s', async (_label, text) => {
    await writeCwdLog();
    await writeFile(paths.activityStatePath, text);
    await expect(readCompanySessions(paths)).resolves.toEqual({
      ok: false,
      kind: 'parse-failed',
    });
  });

  it('leaves both files untouched', async () => {
    const root = paths.seats[0]?.cwd ?? '';
    await writeCwdLog(`${KANAME} ${root}`);
    await writeFile(paths.activityStatePath, '{}');
    const before = await Promise.all([
      stat(paths.cwdLogPath),
      stat(paths.activityStatePath),
      readFile(paths.cwdLogPath, 'utf8'),
    ]);
    await readCompanySessions(paths);
    const after = await Promise.all([
      stat(paths.cwdLogPath),
      stat(paths.activityStatePath),
      readFile(paths.cwdLogPath, 'utf8'),
    ]);
    expect(after[0].mtimeMs).toBe(before[0].mtimeMs);
    expect(after[1].mtimeMs).toBe(before[1].mtimeMs);
    expect(after[2]).toBe(before[2]);
  });
});
