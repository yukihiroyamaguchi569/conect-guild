import { SNAPSHOT_SCHEMA_VERSION, githubPartSchema, type GithubPart } from '@conect-guild/snapshot';
import type { Mixup } from '@conect-guild/snapshot/mixup';
import { DEPARTMENT_LABELS, type BranchPrefixRule } from '@conect-guild/snapshot/settings';
import {
  issueNumbersOf,
  recentCutoff,
  selectRecentPrs,
  splitPresidentIssues,
  toHistory,
  toSnapshotIssues,
  toSnapshotPr,
} from './build.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import {
  assertListsComplete,
  fetchChangedFiles,
  fetchIssues,
  fetchPrs,
  fetchTotals,
} from './github.ts';
import { mapWithConcurrency } from './limit.ts';
import { mixupsOf } from './mixups.ts';

/** At most this many `gh` processes fetch changed files at once. */
export const CHANGED_FILES_CONCURRENCY = 4;

/** The GitHub part of the snapshot, and what the same lists say about mixed-up departments. */
export interface GithubCollected {
  readonly part: GithubPart;
  /** Issue #94: kept out of the snapshot; positions and counts for the status file and logs. */
  readonly mixups: readonly Mixup[];
}

/** What the settings say about sorting the company's Issues and PRs. */
export interface CollectRules {
  readonly branchPrefixes: readonly BranchPrefixRule[];
  /** Issue #141: the open Issues with this label go to `president` instead of `issues`. */
  readonly presidentLabel?: string;
}

/**
 * Fetch issues and PRs of `repo` and build the validated GitHub part of the snapshot.
 * Throws a CollectorError if any request or validation fails, or a list is cut short (Issue #251).
 */
export async function collectSnapshot(
  gh: GhRunner,
  repo: string,
  now: Date,
  { branchPrefixes, presidentLabel }: CollectRules,
): Promise<GithubCollected> {
  const cutoff = recentCutoff(now);
  // The totals before the lists (Issue #251): see assertListsComplete for why.
  const totals = await fetchTotals(gh, repo);
  // PRs first, then Issues: every Issue that exists when the PRs are read is in the Issue list
  // read after, so a link to an Issue created between the two lists is kept (Issue #73).
  const rawPrs = await fetchPrs(gh, repo);
  const rawIssues = await fetchIssues(gh, repo);
  assertListsComplete(totals, rawIssues, rawPrs);
  const existingIssues = issueNumbersOf(rawIssues);
  const prs = await mapWithConcurrency(
    selectRecentPrs(rawPrs, cutoff),
    CHANGED_FILES_CONCURRENCY,
    async (pr) =>
      toSnapshotPr(
        pr,
        repo,
        existingIssues,
        pr.state === 'open' ? await fetchChangedFiles(gh, repo, pr.number) : [],
      ),
  );
  const { issues, president } = splitPresidentIssues(
    toSnapshotIssues(rawIssues, cutoff),
    presidentLabel,
  );
  const part = parseOrThrow(githubPartSchema, {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    repo,
    issues,
    prs,
    history: toHistory(rawIssues, rawPrs, repo, branchPrefixes),
    ...(president === undefined ? {} : { president }),
  });
  const departments = DEPARTMENT_LABELS;
  // The king's Issues are no department's (Issue #141), so they never tell a department's PRs.
  const mixupIssues =
    presidentLabel === undefined
      ? rawIssues
      : rawIssues.filter((issue) => !issue.labels.includes(presidentLabel));
  const context = { branchPrefixes, departments, now };
  return { part, mixups: mixupsOf(mixupIssues, rawPrs, repo, context) };
}
