import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { SessionDepartment } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';
import { expandHome } from './src/home.ts';
import { mulmoTerminalFiles } from './src/sessionFiles.ts';

// Kept here too: the settings writer imports it from src/home.ts, which loads no settings.
export { expandHome };

/**
 * Where a watched session is started: the directory MulmoTerminal records for its grid cell. A
 * company seat (かなめ when `department` is null) or a guest named in the settings (Issue #108),
 * by its position in `guests`.
 */
export type Seat =
  | {
      readonly kind: 'company';
      readonly department: SessionDepartment | null;
      readonly cwd: string;
    }
  | { readonly kind: 'guest'; readonly index: number; readonly cwd: string };

const HOME = homedir();

interface SessionDirSettings {
  readonly commanderSessionDir: string;
  readonly departments: readonly {
    readonly label: SessionDepartment;
    readonly sessionDir: string;
  }[];
  readonly guests?: readonly { readonly sessionDir: string }[];
}

/**
 * The company seats, then the guests' seats in the settings' order, with their directories
 * expanded. Two seats on the same directory (say `~` and the home directory written out) would
 * share one session, so that stops the collector.
 */
export function sessionSeatsOf(settings: SessionDirSettings, home: string): Seat[] {
  const seats: Seat[] = [
    { kind: 'company', department: null, cwd: expandHome(settings.commanderSessionDir, home) },
    ...settings.departments.map((d) => ({
      kind: 'company' as const,
      department: d.label,
      cwd: expandHome(d.sessionDir, home),
    })),
    ...(settings.guests ?? []).map((g, index) => ({
      kind: 'guest' as const,
      index,
      cwd: expandHome(g.sessionDir, home),
    })),
  ];
  if (new Set(seats.map((seat) => seat.cwd)).size !== seats.length) {
    throw new Error('guild.settings.json is invalid: two session dirs point to the same directory');
  }
  return seats;
}

// Fixed on purpose: the target repository, the company sessions, intervals and paths must not be
// changeable from command-line arguments or environment variables (docs/DESIGN.md 4.1, 4.7). The
// team's values come from guild.settings.local.json (if it exists) or guild.settings.json at the
// repository root (src/main.ts chooses).
export const COLLECTOR_CONFIG = {
  repo: GUILD_SETTINGS.repo,
  // Branch name prefix → department, for the history (the branch names themselves are not kept).
  branchPrefixes: GUILD_SETTINGS.branchPrefixes,
  // Issue #141: the label of the king's Issues; undefined without `president` in the settings.
  presidentLabel: GUILD_SETTINGS.president?.label,
  intervalMs: 60_000,
  // Issue #85: the check that each department label exists in the repository, at the start and
  // then this often, apart from the fetch above.
  labels: {
    intervalMs: 10 * 60_000,
    departments: GUILD_SETTINGS.departments,
  },
  // Issue #108: each guest's repository (null without one), fetched apart from the company's:
  // every 5 minutes, the first `offsetMs × (position + 1)` after the start, so the guests' fetches
  // never fall on the company's 60-second ones or on each other.
  guests: {
    intervalMs: 5 * 60_000,
    offsetMs: 20_000,
    repos: (GUILD_SETTINGS.guests ?? []).map((guest) => guest.repo ?? null),
  },
  // Outside apps/web/public so real data never enters a build (docs/DESIGN.md 5).
  snapshotPath: resolve(import.meta.dirname, '../../apps/web/.data/snapshot.json'),
  // How the last try went (Issue #74): the time, ok or not, and the error kind only.
  statusPath: resolve(import.meta.dirname, '../../apps/web/.data/collector-status.json'),
  sessions: {
    intervalMs: 5_000,
    seats: sessionSeatsOf(GUILD_SETTINGS, HOME),
    // MulmoTerminal's own files. Read only: never written or locked.
    ...mulmoTerminalFiles(HOME),
  },
} as const;
