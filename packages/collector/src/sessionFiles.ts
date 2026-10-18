import { createReadStream, type ReadStream } from 'node:fs';
import { join } from 'node:path';
import type { Seat } from './seat.ts';
import {
  latestCompanySessionIds,
  readSeatStates,
  sessionDirsNewestFirst,
  settledLines,
  type SessionsFailureKind,
  type SessionsReading,
  type TailMark,
} from './sessions.ts';

/**
 * Upper bounds on what is read. Both files are small (the cwd log grows by one short line per new
 * session); a file past these is not what we expect, and reading it whole every 5 seconds would
 * cost memory and time, so it makes the sessions unavailable instead.
 */
export const MAX_CWD_LOG_BYTES = 16 * 1024 * 1024;
export const MAX_ACTIVITY_STATE_BYTES = 1024 * 1024;

class TooLargeError extends Error {}

/**
 * A read-only stream of at most `maxBytes + 1` bytes, so a file that grows while it is read is
 * still capped. {@link assertWithin} then tells whether the limit was passed.
 */
function cappedStream(path: string, maxBytes: number, signal?: AbortSignal): ReadStream {
  return createReadStream(path, { encoding: 'utf8', flags: 'r', start: 0, end: maxBytes, signal });
}

function assertWithin(stream: ReadStream, maxBytes: number): void {
  if (stream.bytesRead > maxBytes) throw new TooLargeError();
}

/** MulmoTerminal's own files under `home` (docs/DESIGN.md 4.7). Read only: never written or locked. */
export function mulmoTerminalFiles(home: string): {
  cwdLogPath: string;
  activityStatePath: string;
} {
  const dir = join(home, '.mulmoterminal');
  return {
    cwdLogPath: join(dir, 'dev-terminal-cwds.json'),
    activityStatePath: join(dir, 'activity-state.json'),
  };
}

export interface SessionFilePaths {
  readonly seats: readonly Seat[];
  readonly cwdLogPath: string;
  readonly activityStatePath: string;
}

function failureKindOf(error: unknown): SessionsFailureKind {
  if (error instanceof TooLargeError) return 'too-large';
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
    ? 'missing'
    : 'read-failed';
}

async function* textChunks(stream: ReadStream): AsyncGenerator<string> {
  for await (const chunk of stream) yield String(chunk);
}

/**
 * The cwd log, streamed: each line is handed to `consume` and dropped, so the lines of other
 * directories are never held together. The unterminated last line counts only when it is the same
 * as at the previous read (settledLines).
 */
async function readCwdLog<T>(
  path: string,
  tail: { last: TailMark | null },
  consume: (lines: AsyncIterable<string>) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const stream = cappedStream(path, MAX_CWD_LOG_BYTES, signal);
  const lines = settledLines(textChunks(stream), tail.last, (next) => {
    tail.last = next;
  });
  const result = await consume(lines);
  assertWithin(stream, MAX_CWD_LOG_BYTES);
  return result;
}

async function readActivityState(path: string, signal: AbortSignal | undefined): Promise<string> {
  let text = '';
  const stream = cappedStream(path, MAX_ACTIVITY_STATE_BYTES, signal);
  for await (const chunk of textChunks(stream)) text += chunk;
  assertWithin(stream, MAX_ACTIVITY_STATE_BYTES);
  return text;
}

export type CompanySessionsReader = (signal?: AbortSignal) => Promise<SessionsReading>;

/**
 * A reader of MulmoTerminal's two files that returns the seats' states (company and guests). It remembers only
 * the cwd log's last line as a hash and an end (settledLines), so its first read never takes an
 * unterminated last line. Never throws; an abort of `signal` ends the reading (read-failed). Both
 * files are opened read-only; MulmoTerminal's files are never written or locked.
 */
export function createCompanySessionsReader(paths: SessionFilePaths): CompanySessionsReader {
  const tail: { last: TailMark | null } = { last: null };
  return async (signal) => {
    try {
      const ids = await readCwdLog(
        paths.cwdLogPath,
        tail,
        (lines) => latestCompanySessionIds(lines, paths.seats),
        signal,
      );
      const activity = await readActivityState(paths.activityStatePath, signal);
      return readSeatStates(activity, paths.seats, ids);
    } catch (error) {
      return { ok: false, kind: failureKindOf(error) };
    }
  };
}

export type SessionDirsReading =
  | { readonly ok: true; readonly dirs: readonly string[] }
  | { readonly ok: false; readonly kind: SessionsFailureKind };

async function drain(lines: AsyncIterable<string>): Promise<void> {
  const iterator = lines[Symbol.asyncIterator]();
  while ((await iterator.next()).done !== true) {
    // Each line is dropped: only the tail mark of this read is wanted.
  }
}

/**
 * Issue #118: the directories of the sessions in the cwd log, newest first, without `excluded`
 * (sessionDirsNewestFirst). The log is read twice with `settle` in between, so its unterminated
 * last line (the newest session) counts when it stayed the same, as the collector does across its
 * cycles. Never throws. For `npm run settings:list-sessions` only: nothing is kept or logged.
 */
export async function readSessionDirs(
  cwdLogPath: string,
  excluded: ReadonlySet<string>,
  settle: () => Promise<void>,
): Promise<SessionDirsReading> {
  const tail: { last: TailMark | null } = { last: null };
  try {
    await readCwdLog(cwdLogPath, tail, drain);
    await settle();
    const dirs = await readCwdLog(cwdLogPath, tail, (lines) =>
      sessionDirsNewestFirst(lines, excluded),
    );
    return { ok: true, dirs };
  } catch (error) {
    return { ok: false, kind: failureKindOf(error) };
  }
}
