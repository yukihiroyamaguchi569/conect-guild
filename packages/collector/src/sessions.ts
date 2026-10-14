import { createHash } from 'node:crypto';
import type { SessionState, SnapshotSession } from '@conect-guild/snapshot';
import { z } from 'zod';
import type { Seat } from '../collector.config.ts';

/**
 * Company and guest session states from MulmoTerminal's files (docs/DESIGN.md 4.7). Pure: the
 * caller reads the files. Only the seats' directories (the five company ones and the guests named
 * in the settings, Issue #108) are kept, by exact match; every other line is dropped where it is
 * read, and nothing of it (path, id or count) leaves these functions.
 */

/** MulmoTerminal's session id (a UUID, `SESSION_ID_RE` in its server/config/env.ts). */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One line of dev-terminal-cwds.json: `<id> <absolute path>`. The id holds no space, so the first
 * space splits it and the rest (spaces included) is the path. Trimmed as MulmoTerminal does.
 * Private on purpose: it returns any line's id and path, and only the seats' ones may leave (and,
 * for the list printed by `npm run settings:list-sessions`, the other directories: Issue #118).
 */
function parseCwdLine(line: string): { id: string; cwd: string } | null {
  const text = line.trim();
  const at = text.indexOf(' ');
  if (at <= 0) return null;
  const id = text.slice(0, at);
  const cwd = text.slice(at + 1).trim();
  return SESSION_ID.test(id) && cwd !== '' ? { id, cwd } : null;
}

/**
 * The last line of the log when no newline follows it, kept between reads as a hash of its text
 * and where it ends (chars from the start). The text itself is not kept: it may be another
 * directory's line.
 */
export interface TailMark {
  readonly hash: string;
  readonly end: number;
}

function sameTail(a: TailMark | null, b: TailMark | null): boolean {
  return a !== null && b !== null && a.hash === b.hash && a.end === b.end;
}

/**
 * The lines of the log from its text chunks, for {@link latestCompanySessionIds}. MulmoTerminal
 * appends each record as `\n<id> <path>`, so the last line has no newline after it and may be half
 * written (a department's path cut at the company root would read as かなめ's). It is passed on
 * only when the previous read ended with the same tail at the same place (`previous`): the file has
 * not moved since, so the line is whole. A new session thus shows up one read later. `onTail` gets
 * this read's tail (null when the text ends with a newline) for the next read.
 */
export async function* settledLines(
  chunks: AsyncIterable<string> | Iterable<string>,
  previous: TailMark | null,
  onTail: (tail: TailMark | null) => void,
): AsyncGenerator<string> {
  let rest = '';
  let end = 0;
  for await (const chunk of chunks) {
    end += chunk.length;
    const lines = (rest + chunk).split('\n');
    rest = lines.pop() ?? '';
    yield* lines;
  }
  const tail = rest === '' ? null : { hash: createHash('sha256').update(rest).digest('hex'), end };
  onTail(tail);
  if (sameTail(tail, previous)) yield rest;
}

/**
 * The current session id of each seat (company or guest), keyed by the seat's cwd.
 *
 * The log only grows and the last line of an id is its truth, so for each seat this is the id of
 * its last line whose id was not moved elsewhere later. Lines of other directories are only
 * compared and dropped: their path and id are never stored, so they cannot leak.
 */
export async function latestCompanySessionIds(
  lines: AsyncIterable<string> | Iterable<string>,
  seats: readonly Seat[],
): Promise<ReadonlyMap<string, string>> {
  const seatPaths = new Set(seats.map((seat) => seat.cwd));
  // Seat ids only: where each one was last seen and on which line. One pass, no rescans.
  const lastSeen = new Map<string, { cwd: string; line: number }>();
  let line = 0;
  for await (const text of lines) {
    line += 1;
    const record = parseCwdLine(text);
    if (record === null) continue;
    if (seatPaths.has(record.cwd)) lastSeen.set(record.id, { cwd: record.cwd, line });
    else lastSeen.delete(record.id);
  }
  const latest = new Map<string, { id: string; line: number }>();
  for (const [id, seen] of lastSeen) {
    const current = latest.get(seen.cwd);
    if (current === undefined || seen.line > current.line)
      latest.set(seen.cwd, { id, line: seen.line });
  }
  return new Map([...latest].map(([cwd, { id }]) => [cwd, id]));
}

/**
 * Issue #118: the directory of each session in the cwd log (the one of its id's last line), each
 * directory once, newest first, without `excluded` (the company's). Only for
 * `npm run settings:list-sessions`, which prints them to its own terminal: the collector never
 * calls this, and the directories are never stored, logged or put in the snapshot.
 */
export async function sessionDirsNewestFirst(
  lines: AsyncIterable<string> | Iterable<string>,
  excluded: ReadonlySet<string>,
): Promise<string[]> {
  const lastOf = new Map<string, { cwd: string; line: number }>();
  let line = 0;
  for await (const text of lines) {
    line += 1;
    const record = parseCwdLine(text);
    if (record !== null) lastOf.set(record.id, { cwd: record.cwd, line });
  }
  const newest = new Map<string, number>();
  for (const { cwd, line: at } of lastOf.values()) {
    if (!excluded.has(cwd)) newest.set(cwd, Math.max(newest.get(cwd) ?? 0, at));
  }
  return [...newest].toSorted((a, b) => b[1] - a[1]).map(([cwd]) => cwd);
}

/** One entry of activity-state.json. Extra keys are ignored; a missing or mistyped one fails. */
const activityEntrySchema = z.object({
  working: z.boolean(),
  waiting: z.boolean(),
  event: z.string().nullable(),
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;

/**
 * The rules, top first: a Notification while waiting asks for a permission; a turn in progress is
 * working; any other wait (Stop, MarkedUnread) finished a turn; no entry is idle.
 */
export function sessionStateOf(entry: ActivityEntry | undefined): SessionState {
  if (entry === undefined) return 'idle';
  if (entry.waiting && entry.event === 'Notification') return 'awaiting-permission';
  if (entry.working) return 'working';
  if (entry.waiting) return 'resting';
  return 'idle';
}

export type SessionsFailureKind =
  'missing' | 'read-failed' | 'too-large' | 'parse-failed' | 'invalid';

export type SessionsReading =
  | {
      readonly ok: true;
      readonly members: readonly SnapshotSession[];
      /** The guests' states (Issue #108), in the settings' order. */
      readonly guests: readonly SessionState[];
      /** How many company seats have a session in the cwd log. */
      readonly found: number;
      /** How many guest seats have a session in the cwd log. */
      readonly guestsFound: number;
    }
  | { readonly ok: false; readonly kind: SessionsFailureKind };

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

type EntryLookup = { ok: true; entry: ActivityEntry | undefined } | { ok: false };

/** The file must be a JSON object (not an array). Its keys are not walked or copied. */
function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lookupEntry(file: Readonly<Record<string, unknown>>, id: string | undefined): EntryLookup {
  if (id === undefined || !Object.hasOwn(file, id)) return { ok: true, entry: undefined };
  const entry = activityEntrySchema.safeParse(file[id]);
  return entry.success ? { ok: true, entry: entry.data } : { ok: false };
}

/**
 * Each seat's state from the activity-state.json text. The file is rewritten in place by
 * MulmoTerminal, so an empty or half written text is normal now and then: it fails this cycle and
 * the next one reads it again.
 */
export function readSeatStates(
  activityText: string,
  seats: readonly Seat[],
  ids: ReadonlyMap<string, string>,
): SessionsReading {
  const json = parseJson(activityText);
  if (!json.ok) return { ok: false, kind: 'parse-failed' };
  return seatStatesOf(json.value, seats, ids);
}

/**
 * Each seat's state from the parsed activity-state.json. Only the seats' ids are looked up (own
 * keys, each entry checked by zod); other keys are never listed, read or copied.
 */
export function seatStatesOf(
  file: unknown,
  seats: readonly Seat[],
  ids: ReadonlyMap<string, string>,
): SessionsReading {
  if (!isJsonObject(file)) return { ok: false, kind: 'invalid' };
  const members: SnapshotSession[] = [];
  const guests: { index: number; state: SessionState }[] = [];
  for (const seat of seats) {
    const lookup = lookupEntry(file, ids.get(seat.cwd));
    if (!lookup.ok) return { ok: false, kind: 'invalid' };
    const state = sessionStateOf(lookup.entry);
    if (seat.kind === 'company') members.push({ department: seat.department, state });
    else guests.push({ index: seat.index, state });
  }
  const found = (kind: Seat['kind']): number =>
    seats.filter((seat) => seat.kind === kind && ids.has(seat.cwd)).length;
  return {
    ok: true,
    members,
    guests: guests.toSorted((a, b) => a.index - b.index).map((guest) => guest.state),
    found: found('company'),
    guestsFound: found('guest'),
  };
}
