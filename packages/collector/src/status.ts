import type { CollectorFailureKind, CollectorStatus } from '@conect-guild/snapshot';

/** The last try at GitHub: when it started, and its failure kind (null: it succeeded). */
export interface GithubAttempt {
  readonly at: Date;
  readonly failure: CollectorFailureKind | null;
}

/**
 * What apps/web/.data/collector-status.json says (Issue #74). A snapshot that fails to be written
 * counts as a failure too: the page has nothing new either way. The time and the kind only.
 */
export function collectorStatusOf(
  attempt: GithubAttempt,
  writeFailure: CollectorFailureKind | null,
): CollectorStatus {
  const attemptedAt = attempt.at.toISOString();
  const kind = attempt.failure ?? writeFailure;
  return kind === null ? { ok: true, attemptedAt } : { ok: false, attemptedAt, kind };
}

/** The file's content: one JSON object and a newline. */
export function statusContent(status: CollectorStatus): string {
  return `${JSON.stringify(status)}\n`;
}
