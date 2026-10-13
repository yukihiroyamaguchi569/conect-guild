/**
 * Issue #94: a mix-up of the departments in the settings, noticed once the company is running.
 * When the PRs on department i's branch prefix keep tying to Issues with department j's label, the
 * settings may have i and j the wrong way round. Pure and free of the collector's state, so the
 * settings tools (#79) can call it too. Positions are indices into `departments` of the settings.
 */

/** How far back the merged PRs are looked at. */
export const MIXUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** At least this many PRs must point at the other department, so a few strays do not count. */
export const MIXUP_MIN_COUNT = 3;

/** A merged PR, reduced to what the check needs. */
export interface MixupPr {
  /** The department its branch prefix points at (`branchPrefixes`), or null when none does. */
  readonly branchPosition: number | null;
  /** When it was merged (epoch ms). */
  readonly mergedAt: number;
  /** For each Issue it is tied to, the departments whose labels that Issue has. */
  readonly linkedIssuePositions: readonly (readonly number[])[];
}

/** PRs on department `from`'s prefix tie to department `to`'s Issues: `count` of `total`. */
export interface Mixup {
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly total: number;
}

/**
 * The department a PR counts for, or null when it does not count: no prefix department, or the
 * tied Issues that have exactly one department label do not all name the same one (none such, or
 * work across departments). Issues with no department label or with two or more are left out.
 */
function linkedDepartment(pr: MixupPr): number | null {
  const single = new Set(
    pr.linkedIssuePositions.flatMap((positions) => (positions.length === 1 ? positions : [])),
  );
  if (single.size !== 1) return null;
  return [...single][0] ?? null;
}

/** Per prefix department, how many counted PRs tie to each department. */
function tally(
  prs: readonly MixupPr[],
  departmentCount: number,
  now: number,
  windowMs: number,
): number[][] {
  const counts = Array.from({ length: departmentCount }, () =>
    Array.from({ length: departmentCount }, () => 0),
  );
  for (const pr of prs) {
    if (now - pr.mergedAt > windowMs) continue;
    const linked = linkedDepartment(pr);
    if (pr.branchPosition === null || linked === null) continue;
    const row = counts[pr.branchPosition];
    if (row?.[linked] !== undefined) row[linked] += 1;
  }
  return counts;
}

/**
 * The suspected mix-ups, by `from`: among the PRs merged within `windowMs` before `now` (both epoch
 * ms; exactly `windowMs` ago still counts) that count for department `from`, those tied to one
 * other department `to` are at least `minCount` and more than half. At most one `to` per `from`.
 */
export function suspectedMixups(
  prs: readonly MixupPr[],
  departmentCount: number,
  now: number,
  { windowMs = MIXUP_WINDOW_MS, minCount = MIXUP_MIN_COUNT } = {},
): Mixup[] {
  return tally(prs, departmentCount, now, windowMs).flatMap((row, from) => {
    const total = row.reduce((sum, n) => sum + n, 0);
    return row.flatMap((count, to) =>
      to !== from && count >= minCount && count * 2 > total ? [{ from, to, count, total }] : [],
    );
  });
}

/** The positions of the departments whose labels are among `issueLabels` (exact match). */
export function departmentPositionsOf(
  issueLabels: readonly string[],
  departmentLabels: readonly string[],
): number[] {
  return departmentLabels.flatMap((label, i) => (issueLabels.includes(label) ? [i] : []));
}

/** How to tell it: both ways round is a swap; one way only is a one-way mix-up. */
export type MixupFinding =
  | { readonly kind: 'swap'; readonly a: number; readonly b: number }
  | { readonly kind: 'one-way'; readonly from: number; readonly to: number };

/**
 * The mix-ups paired up: `from`→`to` and `to`→`from` both found are one swap (the lower position
 * first); the rest stay one-way. In the order of their first position.
 */
export function mixupFindings(
  mixups: readonly { readonly from: number; readonly to: number }[],
): MixupFinding[] {
  const has = (from: number, to: number): boolean =>
    mixups.some((m) => m.from === from && m.to === to);
  return mixups
    .flatMap((m): MixupFinding[] => {
      if (!has(m.to, m.from)) return [{ kind: 'one-way', from: m.from, to: m.to }];
      return m.from < m.to ? [{ kind: 'swap', a: m.from, b: m.to }] : [];
    })
    .toSorted((x, y) => firstOf(x) - firstOf(y));
}

function firstOf(finding: MixupFinding): number {
  return finding.kind === 'swap' ? finding.a : finding.from;
}
