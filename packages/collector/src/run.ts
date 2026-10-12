import { snapshotSchema, type GithubPart, type SnapshotSessions } from '@conect-guild/snapshot';
import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { parseCliArgs } from './args.ts';
import { collectSnapshot } from './collect.ts';
import { CollectorError, errorKind, type CollectorErrorKind } from './errors.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import {
  checkLabels,
  isLabelCheckDue,
  labelReport,
  missingAfter,
  type LabelCheck,
} from './labels.ts';
import type { SessionsReading } from './sessions.ts';
import { collectorStatusOf, statusContent, type GithubAttempt } from './status.ts';

export interface RunDeps {
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly gh: GhRunner;
  /** Reads the company sessions from MulmoTerminal's files. Never throws; ends on `signal`. */
  readonly readSessions: () => Promise<SessionsReading>;
  readonly writeSnapshot: (content: string) => Promise<void>;
  /** Writes apps/web/.data/collector-status.json (Issue #74) atomically. */
  readonly writeStatus: (content: string) => Promise<void>;
  /** Waits between cycles; resolves early when `signal` aborts. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly signal: AbortSignal;
}

type FailureKind = CollectorErrorKind | 'unexpected';

type GithubResult =
  | { readonly ok: true; readonly part: GithubPart }
  | { readonly ok: false; readonly kind: FailureKind };

export type CycleResult =
  | {
      readonly ok: true;
      readonly issues: number;
      readonly prs: number;
      /** Counts of the history: Issues ever opened, completed Issues, merged PRs. */
      readonly history: {
        readonly opened: number;
        readonly completed: number;
        readonly merged: number;
      };
    }
  | { readonly ok: false; readonly kind: FailureKind };

type WriteResult = { readonly ok: true } | { readonly ok: false; readonly kind: FailureKind };

async function fetchGithub(deps: RunDeps, now: Date): Promise<GithubResult> {
  try {
    return {
      ok: true,
      part: await collectSnapshot(
        deps.gh,
        COLLECTOR_CONFIG.repo,
        now,
        COLLECTOR_CONFIG.branchPrefixes,
      ),
    };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

/** A reader that throws anyway counts as read-failed, so the loop and the GitHub part go on. */
async function readSessionsSafely(deps: RunDeps): Promise<SessionsReading> {
  try {
    return await deps.readSessions();
  } catch {
    return { ok: false, kind: 'read-failed' };
  }
}

/** The sessions part of the snapshot. A failed reading becomes `unavailable`. */
function toSnapshotSessions(reading: SessionsReading, checkedAt: Date): SnapshotSessions {
  const at = checkedAt.toISOString();
  return reading.ok
    ? { status: 'ok', checkedAt: at, members: [...reading.members] }
    : { status: 'unavailable', checkedAt: at };
}

/**
 * Validates the whole snapshot (the last good GitHub part + this reading of the sessions) and
 * writes it atomically. A failed sessions reading never stops the GitHub part from being written.
 */
async function writeSnapshot(
  deps: RunDeps,
  github: GithubPart,
  reading: SessionsReading,
): Promise<WriteResult> {
  try {
    const sessions = toSnapshotSessions(reading, deps.now());
    const snapshot = parseOrThrow(snapshotSchema, { ...github, sessions });
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    try {
      await deps.writeSnapshot(content);
    } catch {
      throw new CollectorError('write-failed');
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

function cycleResult(github: GithubResult, write: WriteResult | null): CycleResult {
  if (!github.ok) return github;
  if (write !== null && !write.ok) return write;
  const { history } = github.part;
  return {
    ok: true,
    issues: github.part.issues.length,
    prs: github.part.prs.length,
    history: {
      opened: history.openedIssueCount,
      completed: history.completedIssues.length,
      merged: history.mergedPrs.length,
    },
  };
}

/** One full cycle (GitHub, sessions, write). Nothing is written unless GitHub succeeds. */
export async function collectOnce(
  deps: RunDeps,
): Promise<{ readonly github: CycleResult; readonly sessions: SessionsReading }> {
  const github = await fetchGithub(deps, deps.now());
  const sessions = await readSessionsSafely(deps);
  const write = github.ok ? await writeSnapshot(deps, github.part, sessions) : null;
  return { github: cycleResult(github, write), sessions };
}

function prefix(deps: RunDeps): string {
  return `[collector] ${deps.now().toISOString()}`;
}

/**
 * What to do after `gh-failed` (Issue #74). The repository stays `<owner/name>`: the logs carry no
 * repository name, like no title or path.
 */
const GH_FAILED_NEXT_STEP =
  '次にやること: guild.settings.local.ts（無ければ guild.settings.ts）の repo を gh のアカウントで読めるか、gh repo view <owner/name> で確かめてください';

/** Logs carry only counts, times and error kinds (no titles, bodies, branch names, paths or ids). */
function reportCycle(deps: RunDeps, result: CycleResult): void {
  if (result.ok) {
    const { opened, completed, merged } = result.history;
    deps.log(
      `${prefix(deps)} ok: issues=${String(result.issues)} prs=${String(result.prs)}` +
        ` history: opened=${String(opened)} completed=${String(completed)} merged=${String(merged)}`,
    );
  } else {
    deps.error(`${prefix(deps)} failed: ${result.kind}`);
    if (result.kind === 'gh-failed') deps.error(`${prefix(deps)} ${GH_FAILED_NEXT_STEP}`);
  }
}

function checkRepoLabels(deps: RunDeps): Promise<LabelCheck> {
  return checkLabels(deps.gh, COLLECTOR_CONFIG.repo, COLLECTOR_CONFIG.labels.departments);
}

/** Positions and kinds only (Issue #85); the label names stay out of the logs. */
function reportLabels(deps: RunDeps, check: LabelCheck): void {
  const report = labelReport(check);
  for (const line of report.lines) deps[report.level](`${prefix(deps)} ${line}`);
}

/** Writes the status file; false when it could not. */
async function writeStatusSafely(deps: RunDeps, content: string): Promise<boolean> {
  try {
    await deps.writeStatus(content);
    return true;
  } catch {
    return false;
  }
}

function reportStatusNotWritten(deps: RunDeps): void {
  deps.error(`${prefix(deps)} status not written: write-failed`);
}

/** e.g. `sessions=5 ok` or `sessions unavailable: parse-failed`. */
function sessionsSummary(reading: SessionsReading): string {
  return reading.ok
    ? `sessions=${String(reading.found)} ok`
    : `sessions unavailable: ${reading.kind}`;
}

/** What the loop remembers between ticks. */
interface LoopState {
  github: GithubPart | null;
  githubAttemptAt: number | null;
  /** The GitHub fetch still running, if any; ticks go on without waiting for it. */
  githubInFlight: Promise<void> | null;
  /** The last logged sessions summary; the loop logs only changes (it reads every 5 seconds). */
  sessionsLogged: string | null;
  writeFailing: boolean;
  /** The last finished GitHub fetch, for the status file; null before the first. */
  githubAttempt: GithubAttempt | null;
  /** The status file's content as last written; null when nothing is written yet or it failed. */
  statusWritten: string | null;
  statusFailing: boolean;
  /** Issue #85: when the label check last started, and the one still running, if any. */
  labelsAttemptAt: number | null;
  labelsInFlight: Promise<void> | null;
  /** Positions of the missing labels from the last check that read them; null before one did. */
  missingLabels: readonly number[] | null;
  /** The last label report logged; a check is logged only when it says something new. */
  labelsLogged: string | null;
}

function isGithubDue(lastAttemptAt: number | null, now: number): boolean {
  return lastAttemptAt === null || now - lastAttemptAt >= COLLECTOR_CONFIG.intervalMs;
}

function reportSessions(deps: RunDeps, state: LoopState, reading: SessionsReading): void {
  const summary = sessionsSummary(reading);
  if (summary === state.sessionsLogged) return;
  state.sessionsLogged = summary;
  deps.log(`${prefix(deps)} ${summary}`);
}

/** A write failure is logged once, when it starts (the loop writes every 5 seconds). */
function reportWrite(deps: RunDeps, state: LoopState, write: WriteResult | null): void {
  const failing = write !== null && !write.ok;
  if (failing && !state.writeFailing) deps.error(`${prefix(deps)} failed: ${write.kind}`);
  state.writeFailing = failing;
}

/**
 * Writes the status file when it changes: after each GitHub fetch (once a minute) and when writing
 * the snapshot starts or stops failing. A failed write is logged once and retried on the next tick.
 */
async function updateStatus(
  deps: RunDeps,
  state: LoopState,
  write: WriteResult | null,
): Promise<void> {
  if (state.githubAttempt === null) return;
  const writeFailure = write !== null && !write.ok ? write.kind : null;
  const content = statusContent(
    collectorStatusOf(state.githubAttempt, writeFailure, state.missingLabels),
  );
  if (content === state.statusWritten) return;
  const written = await writeStatusSafely(deps, content);
  if (!written && !state.statusFailing) reportStatusNotWritten(deps);
  state.statusFailing = !written;
  state.statusWritten = written ? content : null;
}

/**
 * Starts a GitHub fetch in the background, so a slow GitHub does not hold up the 5-second
 * sessions. A failed fetch keeps the last good part. An interrupted one ends quietly.
 */
function startGithub(deps: RunDeps, state: LoopState, now: Date): Promise<void> {
  state.githubAttemptAt = now.getTime();
  const running = fetchGithub(deps, now).then((result) => {
    state.githubInFlight = null;
    if (deps.signal.aborted) return;
    state.githubAttempt = { at: now, failure: result.ok ? null : result.kind };
    if (result.ok) state.github = result.part;
    reportCycle(deps, cycleResult(result, null));
  });
  state.githubInFlight = running;
  return running;
}

/**
 * Starts the label check in the background (Issue #85), apart from the GitHub fetch: its failure
 * or slowness never holds up the snapshot. A failed check keeps what the last good one found.
 */
function startLabelCheck(deps: RunDeps, state: LoopState, now: Date): void {
  state.labelsAttemptAt = now.getTime();
  state.labelsInFlight = checkRepoLabels(deps).then((check) => {
    state.labelsInFlight = null;
    if (deps.signal.aborted) return;
    state.missingLabels = missingAfter(state.missingLabels, check);
    const logged = labelReport(check).lines.join('\n');
    if (logged === state.labelsLogged) return;
    state.labelsLogged = logged;
    reportLabels(deps, check);
  });
}

/**
 * One tick of the loop: start GitHub when its interval has passed, read the sessions, and write
 * both atomically. Only the very first fetch is waited for (there is nothing to write before it);
 * retries run in the background like every later fetch.
 */
async function tick(deps: RunDeps, state: LoopState): Promise<void> {
  // A function call keeps TypeScript from narrowing `aborted` across awaits.
  const stopped = (): boolean => deps.signal.aborted;
  const now = deps.now();
  const labelsDue = isLabelCheckDue(
    state.labelsAttemptAt,
    now.getTime(),
    COLLECTOR_CONFIG.labels.intervalMs,
  );
  if (state.labelsInFlight === null && labelsDue) startLabelCheck(deps, state, now);
  if (state.githubInFlight === null && isGithubDue(state.githubAttemptAt, now.getTime())) {
    const first = state.githubAttemptAt === null;
    const running = startGithub(deps, state, now);
    if (first) await running;
  }
  if (stopped()) return;
  const reading = await readSessionsSafely(deps);
  if (stopped()) return;
  const write = state.github === null ? null : await writeSnapshot(deps, state.github, reading);
  reportWrite(deps, state, write);
  reportSessions(deps, state, reading);
  // After the snapshot, so the page never reads a success before the file it is about.
  await updateStatus(deps, state, write);
}

/**
 * When the tick after the one scheduled at `scheduledAt` should start, given that the tick ended at
 * `now` (epoch ms). The tick's own time counts towards the interval. A tick that overran the
 * interval does not start the missed ticks back to back: it skips to the first schedule from now.
 */
export function nextTickAt(scheduledAt: number, now: number, intervalMs: number): number {
  const steps = Math.max(1, Math.ceil((now - scheduledAt) / intervalMs));
  return scheduledAt + steps * intervalMs;
}

/** Collect until the signal aborts. Failures are retried on the next tick. */
async function runLoop(deps: RunDeps): Promise<void> {
  const state: LoopState = {
    github: null,
    githubAttemptAt: null,
    githubInFlight: null,
    sessionsLogged: null,
    writeFailing: false,
    githubAttempt: null,
    statusWritten: null,
    statusFailing: false,
    labelsAttemptAt: null,
    labelsInFlight: null,
    missingLabels: null,
    labelsLogged: null,
  };
  // A function call keeps TypeScript from narrowing `aborted` across awaits.
  const stopped = (): boolean => deps.signal.aborted;
  let scheduledAt = deps.now().getTime();
  while (!stopped()) {
    await tick(deps, state);
    // An interrupt during a tick ends quietly instead of reporting the killed gh.
    if (stopped()) break;
    const now = deps.now().getTime();
    scheduledAt = nextTickAt(scheduledAt, now, COLLECTOR_CONFIG.sessions.intervalMs);
    await deps.sleep(scheduledAt - now);
  }
  // No gh process outlives the loop.
  await state.githubInFlight;
  await state.labelsInFlight;
}

/** Entry logic of the collector. Resolves with the process exit code. */
export async function runCollector(args: readonly string[], deps: RunDeps): Promise<number> {
  const mode = parseCliArgs(args);
  if (mode === 'once') {
    const at = deps.now();
    const [result, labels] = await Promise.all([collectOnce(deps), checkRepoLabels(deps)]);
    reportCycle(deps, result.github);
    reportLabels(deps, labels);
    deps.log(`${prefix(deps)} ${sessionsSummary(result.sessions)}`);
    const failure = result.github.ok ? null : result.github.kind;
    const status = collectorStatusOf({ at, failure }, null, missingAfter(null, labels));
    if (!(await writeStatusSafely(deps, statusContent(status)))) reportStatusNotWritten(deps);
    return result.github.ok ? 0 : 1;
  }
  if (mode === 'loop') {
    await runLoop(deps);
    return 0;
  }
  deps.error('[collector] unknown arguments; usage: main.ts [--once]');
  return 2;
}
