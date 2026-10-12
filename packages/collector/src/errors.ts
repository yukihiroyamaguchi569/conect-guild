import type { CollectorFailureKind } from '@conect-guild/snapshot';

/**
 * Error kinds are the only failure detail the collector ever logs or writes to its status file.
 * One list with the status file's schema (packages/snapshot), which adds 'unexpected'.
 */
export type CollectorErrorKind = Exclude<CollectorFailureKind, 'unexpected'>;

export class CollectorError extends Error {
  readonly kind: CollectorErrorKind;

  constructor(kind: CollectorErrorKind) {
    super(kind);
    this.name = 'CollectorError';
    this.kind = kind;
  }
}

/** Map any thrown value to a loggable kind without exposing its message. */
export function errorKind(error: unknown): CollectorFailureKind {
  return error instanceof CollectorError ? error.kind : 'unexpected';
}
