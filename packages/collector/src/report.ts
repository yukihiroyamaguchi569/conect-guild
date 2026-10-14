import type { Mixup } from '@conect-guild/snapshot/mixup';
import { labelReport, type LabelCheck } from './labels.ts';
import { mixupReport } from './mixups.ts';
import type { CycleResult, RunDeps } from './run.ts';
import type { SessionsReading } from './sessions.ts';

/**
 * The collector's log lines. Logs carry only counts, times and error kinds (no titles, bodies,
 * branch names, paths or ids).
 */

type ReportDeps = Pick<RunDeps, 'now' | 'log' | 'error'>;

export function prefix(deps: ReportDeps): string {
  return `[collector] ${deps.now().toISOString()}`;
}

/**
 * What to do after `gh-failed` (Issue #74). The repository stays `<owner/name>`: the logs carry no
 * repository name, like no title or path.
 */
const GH_FAILED_NEXT_STEP =
  '次にやること: guild.settings.local.json（無ければ guild.settings.json）の repo を gh のアカウントで読めるか、gh repo view <owner/name> で確かめてください';

/** Logs carry only counts, times and error kinds (no titles, bodies, branch names, paths or ids). */
export function reportCycle(deps: ReportDeps, result: CycleResult): void {
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

/** Positions and kinds only (Issue #85); the label names stay out of the logs. */
export function reportLabels(deps: ReportDeps, check: LabelCheck): void {
  const report = labelReport(check);
  for (const line of report.lines) deps[report.level](`${prefix(deps)} ${line}`);
}

/** Positions and counts only (Issue #94); label names, titles and branch names stay out. */
export function reportMixups(deps: ReportDeps, mixups: readonly Mixup[]): void {
  const report = mixupReport(mixups);
  for (const line of report.lines) deps[report.level](`${prefix(deps)} ${line}`);
}

export function reportStatusNotWritten(deps: ReportDeps): void {
  deps.error(`${prefix(deps)} status not written: write-failed`);
}

/** e.g. `sessions=5 ok` or `sessions unavailable: parse-failed`. */
export function sessionsSummary(reading: SessionsReading): string {
  return reading.ok
    ? `sessions=${String(reading.found)} ok`
    : `sessions unavailable: ${reading.kind}`;
}
