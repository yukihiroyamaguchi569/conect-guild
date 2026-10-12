import type { Snapshot, SnapshotIssue, SnapshotPr } from '@conect-guild/snapshot';
import { EVENT_GAP_LIMIT_MS, type DepartmentLabel } from '../guild.config';
import { repoFingerprint, toBaseline, type Baseline } from './baseline';
import { levelUps, type MemberLevels } from './levelUp';
import { assignPr, indexIssues, type IssueIndex } from './party';
import { pickDepartment } from './quest';

export type GuildEventKind = 'issue-opened' | 'pr-merged' | 'issue-closed' | 'level-up';

export interface GuildEvent {
  /**
   * Kind + number, e.g. `issue-closed#123`; a level-up adds whose it is (`level-up:経理#4`; かなめ's is `level-up:kaname#4`).
   * Unique within one diff.
   */
  readonly id: string;
  readonly kind: GuildEventKind;
  /** Issue number for issue events, PR number for `pr-merged`, the level reached for `level-up`. */
  readonly number: number;
  /** Who acts in the scene; null means かなめ's reception (no department found). */
  readonly department: DepartmentLabel | null;
}

export const GAP_NOTICE_MESSAGE = 'この期間の出来事は復元できません';

export interface DiffNotice {
  readonly kind: 'gap-unrecoverable';
  readonly message: string;
}

/** What to do with the stored baseline after this diff. */
export type BaselineUpdate =
  { readonly action: 'replace'; readonly baseline: Baseline } | { readonly action: 'keep' };

export interface DiffResult {
  readonly events: readonly GuildEvent[];
  readonly baselineUpdate: BaselineUpdate;
  readonly notice: DiffNotice | null;
}

/** The kinds read from the Issues and PRs (a level-up is read from the levels). */
type ItemEventKind = Exclude<GuildEventKind, 'level-up'>;
type ItemEvent = GuildEvent & { readonly kind: ItemEventKind };

const KIND_ORDER: readonly ItemEventKind[] = ['issue-opened', 'pr-merged', 'issue-closed'];

function makeEvent(
  kind: ItemEventKind,
  number: number,
  department: DepartmentLabel | null,
): ItemEvent {
  return { id: `${kind}#${String(number)}`, kind, number, department };
}

function closedAfter(issue: SnapshotIssue, baselineAt: number): boolean {
  return issue.closedAt !== null && Date.parse(issue.closedAt) > baselineAt;
}

function issueEvent(
  issue: SnapshotIssue,
  before: Baseline['issues'][number] | undefined,
  baselineAt: number,
): ItemEventKind | null {
  if (before === undefined) {
    if (issue.state === 'open') return 'issue-opened';
    // Opened and closed between two fetches: show only the clear.
    return closedAfter(issue, baselineAt) ? 'issue-closed' : null;
  }
  if (issue.state !== 'closed') return null;
  return before.state === 'open' || reclosed(issue, before) ? 'issue-closed' : null;
}

/**
 * Closed in the baseline too: only a reopen and re-close between fetches counts, seen as a
 * closedAt later than the baseline's. Comparing with the baseline's fetchedAt instead would clear
 * again on every fetch an Issue whose closedAt is later than that fetch (clock skew, sample data).
 * A closedAt that moved earlier is no new close.
 */
function reclosed(issue: SnapshotIssue, before: Baseline['issues'][number]): boolean {
  if (issue.closedAt === null || before.closedAt === null) return false;
  return Date.parse(issue.closedAt) > Date.parse(before.closedAt);
}

function prMerged(
  pr: SnapshotPr,
  before: Baseline['prs'][number] | undefined,
  baselineAt: number,
): boolean {
  if (pr.mergedAt === null) return false;
  if (before === undefined) return Date.parse(pr.mergedAt) > baselineAt;
  return before.mergedAt === null;
}

function collectEvents(baseline: Baseline, snapshot: Snapshot, index: IssueIndex): ItemEvent[] {
  const baselineAt = Date.parse(baseline.fetchedAt);
  const issuesBefore = new Map(baseline.issues.map((i) => [i.number, i]));
  const prsBefore = new Map(baseline.prs.map((p) => [p.number, p]));
  const byId = new Map<string, ItemEvent>();
  for (const issue of snapshot.issues) {
    const kind = issueEvent(issue, issuesBefore.get(issue.number), baselineAt);
    if (kind === null) continue;
    const event = makeEvent(kind, issue.number, pickDepartment(issue.labels).department);
    byId.set(event.id, event);
  }
  for (const pr of snapshot.prs) {
    if (!prMerged(pr, prsBefore.get(pr.number), baselineAt)) continue;
    const event = makeEvent('pr-merged', pr.number, assignPr(pr, index).department);
    byId.set(event.id, event);
  }
  return [...byId.values()].toSorted(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.number - b.number,
  );
}

/**
 * One event per member whose level went up (two or more levels at once are one event), after the
 * other events of the diff so the window reads 「クリアした！」 before 「あがった！」.
 */
function levelUpEvents(before: MemberLevels, after: MemberLevels): GuildEvent[] {
  return levelUps(before, after).map(({ department, level }) => ({
    id: `level-up:${department ?? 'kaname'}#${String(level)}`,
    kind: 'level-up',
    number: level,
    department,
  }));
}

/**
 * Compares the stored baseline with a freshly fetched and validated snapshot (docs/DESIGN.md 4.4).
 * - no baseline (absent, malformed or another version → pass null): no events, store the snapshot
 * - snapshot not newer than the baseline: nothing at all, keep the baseline (never rewind)
 * - baseline older than `gapLimitMs` before the snapshot: store it, show the gap notice, and only
 *   the level-ups (the levels are counted afresh from the whole history, so none is missed)
 * - otherwise: opened / merged / closed events, each at most once, then the level-ups, then store
 *   the snapshot
 * Call it only after a successful fetch; a failed fetch must leave the baseline alone.
 */
export function diffSnapshot(
  baseline: Baseline | null,
  snapshot: Snapshot,
  gapLimitMs: number = EVENT_GAP_LIMIT_MS,
): DiffResult {
  const next = toBaseline(snapshot);
  const replace: BaselineUpdate = { action: 'replace', baseline: next };
  // A baseline of another repository (guild.settings.json changed) counts as the first load.
  if (baseline?.repo !== repoFingerprint(snapshot.repo)) {
    return { events: [], baselineUpdate: replace, notice: null };
  }
  const gap = Date.parse(snapshot.fetchedAt) - Date.parse(baseline.fetchedAt);
  if (gap <= 0) return { events: [], baselineUpdate: { action: 'keep' }, notice: null };
  if (gap > gapLimitMs) {
    const notice: DiffNotice = { kind: 'gap-unrecoverable', message: GAP_NOTICE_MESSAGE };
    return { events: levelUpEvents(baseline.levels, next.levels), baselineUpdate: replace, notice };
  }
  const events = [
    ...collectEvents(baseline, snapshot, indexIssues(snapshot.issues)),
    ...levelUpEvents(baseline.levels, next.levels),
  ];
  return { events, baselineUpdate: replace, notice: null };
}
