import { SNAPSHOT_SCHEMA_VERSION, githubPartSchema, type GithubPart } from '@conect-guild/snapshot';
import type { BranchPrefixRule } from '@conect-guild/snapshot/settings';
import {
  issueNumbersOf,
  recentCutoff,
  selectRecentPrs,
  toHistory,
  toSnapshotIssues,
  toSnapshotPr,
} from './build.ts';
import { parseOrThrow, type GhRunner } from './gh.ts';
import { fetchChangedFiles, fetchIssues, fetchPrs } from './github.ts';
import { bothOrThrow, mapWithConcurrency } from './limit.ts';

/** At most this many `gh` processes fetch changed files at once. */
export const CHANGED_FILES_CONCURRENCY = 4;

/**
 * Fetch issues and PRs of `repo` and build the validated GitHub part of the snapshot.
 * Throws a CollectorError if any request or validation fails.
 */
export async function collectSnapshot(
  gh: GhRunner,
  repo: string,
  now: Date,
  branchPrefixes: readonly BranchPrefixRule[],
): Promise<GithubPart> {
  const cutoff = recentCutoff(now);
  const [rawIssues, rawPrs] = await bothOrThrow(fetchIssues(gh, repo), fetchPrs(gh, repo));
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
  return parseOrThrow(githubPartSchema, {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    repo,
    issues: toSnapshotIssues(rawIssues, cutoff),
    prs,
    history: toHistory(rawIssues, rawPrs, repo, branchPrefixes),
  });
}
