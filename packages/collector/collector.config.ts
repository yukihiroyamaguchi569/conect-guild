import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SessionDepartment } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';

/** Where a company session is started: the directory MulmoTerminal records for its grid cell. */
export interface CompanySeat {
  /** null is かなめ (the 司令塔). */
  readonly department: SessionDepartment | null;
  readonly cwd: string;
}

const HOME = homedir();
const MULMOTERMINAL_HOME = join(HOME, '.mulmoterminal');

/** `~` and `~/...` in guild.settings.json are under the home directory; other paths are absolute. */
export function expandHome(dir: string, home: string): string {
  if (dir === '~') return home;
  return dir.startsWith('~/') ? join(home, dir.slice(2)) : dir;
}

interface SessionDirSettings {
  readonly commanderSessionDir: string;
  readonly departments: readonly {
    readonly label: SessionDepartment;
    readonly sessionDir: string;
  }[];
}

/**
 * The company seats with their directories expanded. Two seats on the same directory (say `~` and
 * the home directory written out) would share one session, so that stops the collector.
 */
export function companySeatsOf(settings: SessionDirSettings, home: string): CompanySeat[] {
  const seats: CompanySeat[] = [
    { department: null, cwd: expandHome(settings.commanderSessionDir, home) },
    ...settings.departments.map((d) => ({
      department: d.label,
      cwd: expandHome(d.sessionDir, home),
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
  intervalMs: 60_000,
  // Issue #85: the check that each department label exists in the repository, at the start and
  // then this often, apart from the fetch above.
  labels: {
    intervalMs: 10 * 60_000,
    departments: GUILD_SETTINGS.departments,
  },
  // Outside apps/web/public so real data never enters a build (docs/DESIGN.md 5).
  snapshotPath: resolve(import.meta.dirname, '../../apps/web/.data/snapshot.json'),
  // How the last try went (Issue #74): the time, ok or not, and the error kind only.
  statusPath: resolve(import.meta.dirname, '../../apps/web/.data/collector-status.json'),
  sessions: {
    intervalMs: 5_000,
    seats: companySeatsOf(GUILD_SETTINGS, HOME),
    // MulmoTerminal's own files. Read only: never written or locked.
    cwdLogPath: join(MULMOTERMINAL_HOME, 'dev-terminal-cwds.json'),
    activityStatePath: join(MULMOTERMINAL_HOME, 'activity-state.json'),
  },
} as const;
