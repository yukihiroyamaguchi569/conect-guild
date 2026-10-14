import { loadSettingsFile, type SettingsReader } from '@conect-guild/snapshot/settingsFile';
import {
  escapeForTerminal,
  isSessionDir,
  maxGuestsFor,
  type GuildSettings,
} from '@conect-guild/snapshot/settingsSchema';
import { contractHome, expandHome } from './home.ts';
import type { SessionDirsReading } from './sessionFiles.ts';
import { quote } from './settingsText.ts';

/**
 * Issue #118: `npm run settings:list-sessions`. Prints the folders of the sessions MulmoTerminal
 * has (its cwd log, docs/DESIGN.md 4.7), numbered and newest first, without the company's (the
 * 司令塔 and the departments of the settings in use), for /guild-setup to offer as guests. The
 * folders go to stdout only: never to a file, a log or the snapshot. Takes no argument.
 */

export const LIST_USAGE = '使い方: npm run --silent settings:list-sessions\n';

/** Everything outside; tests pass fakes. */
export interface ListSessionsDeps extends SettingsReader {
  /** The repository root, where the settings files sit. */
  readonly root: string;
  readonly home: string;
  /** The session folders without `excluded` (readSessionDirs on MulmoTerminal's cwd log). */
  readonly readDirs: (excluded: ReadonlySet<string>) => Promise<SessionDirsReading>;
  readonly out: (text: string) => void;
}

function companyDirs(settings: GuildSettings, home: string): Set<string> {
  const dirs = [settings.commanderSessionDir, ...settings.departments.map((d) => d.sessionDir)];
  return new Set(dirs.map((dir) => expandHome(dir, home)));
}

function guestLines(settings: GuildSettings): string[] {
  const guests = settings.guests ?? [];
  const max = maxGuestsFor(settings.departments.length);
  const head = `お客さんは ${String(max)} 人まで（${String(settings.departments.length)} 部門）。いまのお客さん: ${String(guests.length)} 人`;
  return [
    head,
    ...guests.map((g, i) => {
      const repo = g.repo === undefined ? '' : ` repo ${quote(g.repo)}`;
      return `  guests[${String(i)}] ${quote(g.name)} ${quote(g.sessionDir)}${repo}`;
    }),
  ];
}

/**
 * The listed folders with `~` for the home directory. A folder a guest could not be set to (a
 * trailing `/`, a control character: isSessionDir) is left out. Each one is escaped for the
 * terminal, so a folder name can never move the cursor or add a line.
 */
export function listedDirs(dirs: readonly string[], home: string): string[] {
  return dirs.map((dir) => contractHome(dir, home)).filter(isSessionDir);
}

function dirLines(dirs: readonly string[]): string[] {
  if (dirs.length === 0) return ['司令塔と部門のほかに、セッションのフォルダは見つかりません'];
  return [
    'セッションのフォルダ（新しい順。司令塔と部門のフォルダは除く）:',
    ...dirs.map((dir, i) => `  ${String(i + 1)}. ${escapeForTerminal(dir)}`),
  ];
}

type Loaded = { ok: true; settings: GuildSettings } | { ok: false; error: string };

function loadSettings(deps: ListSessionsDeps): Loaded {
  try {
    return { ok: true, settings: loadSettingsFile(deps.root, deps).settings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '設定を読めません' };
  }
}

/** Runs the command; resolves with the exit code (0 listed, 1 unreadable, 2 usage). */
export async function runListSessions(
  args: readonly string[],
  deps: ListSessionsDeps,
): Promise<number> {
  if (args.length > 0) {
    deps.out(LIST_USAGE);
    return 2;
  }
  const loaded = loadSettings(deps);
  if (!loaded.ok) {
    deps.out(`${loaded.error}\n`);
    return 1;
  }
  const { settings } = loaded;
  const reading = await deps.readDirs(companyDirs(settings, deps.home));
  const lines = reading.ok
    ? dirLines(listedDirs(reading.dirs, deps.home))
    : [`MulmoTerminal のセッションの記録を読めません（${reading.kind}）`];
  deps.out(`${[...guestLines(settings), ...lines].join('\n')}\n`);
  return reading.ok ? 0 : 1;
}
