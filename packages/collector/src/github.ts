import { z } from 'zod';
import { ghApiProjected, parseOrThrow, type GhRunner } from './gh.ts';

// Each list is projected inside gh (jq) to exactly these fields, so issue
// bodies and file diffs never reach the collector. strictObject catches a
// projection that lets anything else through.
const ISSUE_PROJECTION =
  '{number, title, state, state_reason, labels: [.labels[].name], created_at, updated_at, closed_at, is_pull_request: has("pull_request")}';
const PR_PROJECTION = '{number, title, body, state, merged_at, closed_at, head_ref: .head.ref}';
const FILE_PROJECTION = '.filename';
const LABEL_PROJECTION = '.name';

const rawIssueSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  // completed, not_planned, duplicate, reopened or null. Kept as a string so a reason GitHub adds
  // later does not stop the collector; only `completed` counts (build.ts toHistory).
  state_reason: z.string().nullable(),
  labels: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  closed_at: z.iso.datetime().nullable(),
  // The issues list also returns pull requests; they carry a pull_request key.
  is_pull_request: z.boolean(),
});

const rawPrSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  // Read only to find linked issue numbers; never stored.
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  merged_at: z.iso.datetime().nullable(),
  closed_at: z.iso.datetime().nullable(),
  head_ref: z.string(),
});

export type RawIssue = z.infer<typeof rawIssueSchema>;
export type RawPr = z.infer<typeof rawPrSchema>;

const PER_PAGE = 'per_page=100';

/**
 * Every issue, open and closed, the whole history (PRs still included), from one list. One list
 * sorted by creation time means an issue that closes or reopens while the pages are read is still
 * read once with one of its states; two lists (open, closed) could miss it in both. A new issue
 * created meanwhile shifts the pages and repeats an item; build.ts keeps the copy read last. The
 * history of the snapshot is counted afresh from these on every fetch (docs/DESIGN.md 4.1).
 */
export async function fetchIssues(gh: GhRunner, repo: string): Promise<RawIssue[]> {
  const issues = await ghApiProjected(
    gh,
    `repos/${repo}/issues?state=all&sort=created&direction=desc&${PER_PAGE}`,
    ISSUE_PROJECTION,
  );
  return parseOrThrow(z.array(rawIssueSchema), issues);
}

/**
 * Every PR, open and closed, from one list sorted by creation time, for the same reason as
 * fetchIssues: a PR updated, merged or closed while the pages are read keeps its place, so it is
 * read at least once (a list sorted by update time would move it to the front, past the pages
 * already read). A PR read twice (a new PR shifted the pages) is newest in the copy read last.
 */
export async function fetchPrs(gh: GhRunner, repo: string): Promise<RawPr[]> {
  const prs = await ghApiProjected(
    gh,
    `repos/${repo}/pulls?state=all&sort=created&direction=desc&${PER_PAGE}`,
    PR_PROJECTION,
  );
  return parseOrThrow(z.array(rawPrSchema), prs);
}

/** Paths of the files a PR changes (never the diff itself). */
export async function fetchChangedFiles(
  gh: GhRunner,
  repo: string,
  prNumber: number,
): Promise<string[]> {
  const files = await ghApiProjected(
    gh,
    `repos/${repo}/pulls/${String(prNumber)}/files?${PER_PAGE}`,
    FILE_PROJECTION,
  );
  return parseOrThrow(z.array(z.string()), files);
}

/** The names of the repository's labels (Issue #85); nothing else of a label is read. */
export async function fetchLabelNames(gh: GhRunner, repo: string): Promise<string[]> {
  const names = await ghApiProjected(gh, `repos/${repo}/labels?${PER_PAGE}`, LABEL_PROJECTION);
  return parseOrThrow(z.array(z.string()), names);
}
