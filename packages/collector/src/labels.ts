import type { CollectorFailureKind } from '@conect-guild/snapshot';
import { errorKind } from './errors.ts';
import type { GhRunner } from './gh.ts';
import { fetchLabelNames } from './github.ts';

/**
 * Issue #85: does the repository have each department label of the settings? A label that is not
 * there leaves that department's Issues at the reception, which is hard to notice.
 */

/**
 * The positions in `departments` whose label is not among `repoLabels`. Compared exactly as the
 * collector ties an Issue's labels to a department (build.ts: the same string, case and spaces
 * included). Pure, and free of the collector's state, so a settings check can call it too.
 */
export function missingLabelPositions(
  departments: readonly { readonly label: string }[],
  repoLabels: readonly string[],
): number[] {
  return departments.flatMap((department, i) => (repoLabels.includes(department.label) ? [] : [i]));
}

/** One check: the positions that are missing (of `total`), or why the labels could not be read. */
export type LabelCheck =
  | { readonly ok: true; readonly missing: readonly number[]; readonly total: number }
  | { readonly ok: false; readonly kind: CollectorFailureKind };

/** Reads the label names and compares them. Never throws: a failure is "not known". */
export async function checkLabels(
  gh: GhRunner,
  repo: string,
  departments: readonly { readonly label: string }[],
): Promise<LabelCheck> {
  try {
    const names = await fetchLabelNames(gh, repo);
    return {
      ok: true,
      missing: missingLabelPositions(departments, names),
      total: departments.length,
    };
  } catch (error) {
    return { ok: false, kind: errorKind(error) };
  }
}

/** True when the check never ran or `intervalMs` has passed since it last started (epoch ms). */
export function isLabelCheckDue(
  lastAttemptAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  return lastAttemptAt === null || now - lastAttemptAt >= intervalMs;
}

/**
 * What the missing labels are after `check`: a failed check keeps what the last good one found
 * (null: nothing known yet), so a failure never reads as "missing" nor clears a real finding.
 */
export function missingAfter(
  previous: readonly number[] | null,
  check: LabelCheck,
): readonly number[] | null {
  return check.ok ? check.missing : previous;
}

const LABELS_NEXT_STEP =
  '次にやること: 設定（guild.settings.local.ts、無ければ guild.settings.ts）の departments[n].label を GitHub のラベル名と 1 文字も違わないようにそろえるか、gh label create でラベルを作ってください（docs/setup.md の「困ったとき」）';

/** The log lines of a check: positions, counts and kinds only (never a label name or title). */
export interface LabelReport {
  readonly level: 'log' | 'error';
  readonly lines: readonly string[];
}

export function labelReport(check: LabelCheck): LabelReport {
  if (!check.ok) return { level: 'error', lines: [`labels unknown: ${check.kind}`] };
  if (check.missing.length === 0)
    return { level: 'log', lines: [`labels ok: ${String(check.total)}/${String(check.total)}`] };
  const positions = check.missing.map((i) => `departments[${String(i)}]`).join(', ');
  const count = `${String(check.missing.length)}/${String(check.total)}`;
  return {
    level: 'error',
    lines: [`labels missing ${count}: ${positions} のラベルがリポジトリに無い`, LABELS_NEXT_STEP],
  };
}
