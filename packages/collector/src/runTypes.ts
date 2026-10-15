import type { CollectorErrorKind } from './errors.ts';
import type { GhRunner } from './gh.ts';
import type { SessionsReading } from './sessions.ts';

export interface RunDeps {
  readonly now: () => Date;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
  readonly gh: GhRunner;
  /**
   * Issue #108: the guests of the settings by position, each its repository or null when it has
   * none. Fixed by the settings file (collector.config.ts), like the company repository.
   */
  readonly guestRepos: readonly (string | null)[];
  /** Reads the company sessions from MulmoTerminal's files. Never throws; ends on `signal`. */
  readonly readSessions: () => Promise<SessionsReading>;
  readonly writeSnapshot: (content: string) => Promise<void>;
  /** Writes apps/web/.data/collector-status.json (Issue #74) atomically. */
  readonly writeStatus: (content: string) => Promise<void>;
  /** Waits between cycles; resolves early when `signal` aborts. */
  readonly sleep: (ms: number) => Promise<void>;
  readonly signal: AbortSignal;
}

export type FailureKind = CollectorErrorKind | 'unexpected';

export type CycleResult =
  | {
      readonly ok: true;
      readonly issues: number;
      readonly prs: number;
      /** Issue #141: the king's open Issues; null when the settings have no `president`. */
      readonly president: number | null;
      /** Counts of the history: Issues ever opened, completed Issues, merged PRs. */
      readonly history: {
        readonly opened: number;
        readonly completed: number;
        readonly merged: number;
      };
    }
  | { readonly ok: false; readonly kind: FailureKind };
