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
  missingLabels: readonly number[] | null = null,
): CollectorStatus {
  const attemptedAt = attempt.at.toISOString();
  const kind = attempt.failure ?? writeFailure;
  // Issue #85: only when a check found labels missing; left out when all are there or unknown.
  const labels =
    missingLabels !== null && missingLabels.length > 0 ? { missingLabels: [...missingLabels] } : {};
  return kind === null
    ? { ok: true, attemptedAt, ...labels }
    : { ok: false, attemptedAt, kind, ...labels };
}

/** The file's content: one JSON object and a newline. */
export function statusContent(status: CollectorStatus): string {
  return `${JSON.stringify(status)}\n`;
}
