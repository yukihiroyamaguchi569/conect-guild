import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  COMMANDER_ID,
  SUPPORTED_DEPARTMENT_COUNTS,
  type GuildSettings,
} from '@conect-guild/snapshot/settingsSchema';
import { expandHome } from './home.ts';
import { TRIAL_DEPARTMENTS } from './trialScaffold.ts';

/**
 * Issue #223: what `npm run trial:open-cells` opens in MulmoTerminal, and what `--forget` takes
 * out of its recent folders. Pure: the settings, the 司令塔's CLAUDE.md and the folders that
 * still exist are handed in.
 */

/** What /guild-trial's tool writes into the 司令塔's CLAUDE.md (trialScaffold.ts). */
export const TRIAL_MARK = '架空の会社「お試し商会」';

/** The names /guild-trial gives a trial company now: `guild-trial`, `guild-trial-<n>`. */
export const CURRENT_TRIAL_NAME = /^guild-trial(?:-[1-9]\d*)?$/;

/** The names it gave before Issue #221: `<date>-<4 hex>`. */
const OLD_TRIAL_NAME = /^\d{8}-[0-9a-f]{4}$/;

/** A name /guild-trial gives a trial company (the same as /guild-trial-cleanup's). */
export function isTrialName(name: string): boolean {
  return CURRENT_TRIAL_NAME.test(name) || OLD_TRIAL_NAME.test(name);
}

export interface Cell {
  /** Absolute, `~` expanded. */
  readonly path: string;
  /** Shown in MulmoTerminal: the member's name from the settings and the role. */
  readonly label: string;
  /** For the log: fixed text only (司令塔 or the trial table's department name). */
  readonly logName: string;
  /** The first message of the session: fixed text and a department label of the trial table. */
  readonly message: string;
}

export type CellsResult =
  | { readonly ok: true; readonly cells: readonly Cell[] }
  | { readonly ok: false; readonly reason: string };

const COMMANDER_MESSAGE =
  'あなたはお試し商会の司令塔です。CLAUDE.md を読み、社長の依頼を待ってください。';

function departmentMessage(label: string): string {
  return `あなたはお試し商会の${label}部門です。CLAUDE.md を読み、Issue を待ってください。`;
}

/** The trial company's folder `<home>/guild-trial/<name>` that `path` is or is under, or null. */
export function trialCompanyOf(path: string, home: string): string | null {
  const root = join(home, 'guild-trial');
  if (!path.startsWith(`${root}/`)) return null;
  const name = path.slice(root.length + 1).split('/')[0] ?? '';
  return isTrialName(name) ? join(root, name) : null;
}

const NOT_TRIAL = 'お試しの会社の設定ではないので、まとめて開きません';

/** A department's cell with its label as the role; null unless it is exactly its trial folder. */
function departmentCell(
  d: GuildSettings['departments'][number],
  commander: string,
  home: string,
  isSymlink: (path: string) => boolean,
): Cell | null {
  const path = expandHome(d.sessionDir, home);
  const known = TRIAL_DEPARTMENTS.find((t) => t.label === d.label);
  if (known === undefined || path !== join(commander, known.folder) || isSymlink(path)) return null;
  return {
    path,
    label: known.label,
    logName: known.name,
    message: departmentMessage(known.label),
  };
}

/**
 * The cells of the trial company in `settings`: the 司令塔 first, then the departments in order.
 * Refuses settings that are not /guild-trial's: the 司令塔 is not `~/guild-trial/<name>`, its
 * CLAUDE.md (null when unreadable) lacks the trial mark, a department is not exactly the folder
 * of its label in the trial table, the count is not 2..6, or `~/guild-trial`, the 司令塔 or a
 * department folder is a symbolic link (a session would start where the link points).
 */
export function trialCells(
  settings: GuildSettings,
  home: string,
  commanderClaudeMd: string | null,
  isSymlink: (path: string) => boolean,
): CellsResult {
  const refused = { ok: false, reason: NOT_TRIAL } as const;
  const commander = expandHome(settings.commanderSessionDir, home);
  if (trialCompanyOf(commander, home) !== commander) return refused;
  if (commanderClaudeMd?.includes(TRIAL_MARK) !== true) return refused;
  if (!SUPPORTED_DEPARTMENT_COUNTS.includes(settings.departments.length)) return refused;
  if (isSymlink(join(home, 'guild-trial')) || isSymlink(commander)) return refused;
  const nameOf = (id: keyof GuildSettings['members']): string => settings.members[id]?.name ?? id;
  const cells: Cell[] = [
    {
      path: commander,
      label: `${nameOf(COMMANDER_ID)}（司令塔）`,
      logName: '司令塔',
      message: COMMANDER_MESSAGE,
    },
  ];
  for (const d of settings.departments) {
    const cell = departmentCell(d, commander, home, isSymlink);
    if (cell === null) return refused;
    cells.push({ ...cell, label: `${nameOf(d.member)}（${cell.label}）` });
  }
  return { ok: true, cells };
}

/** MulmoTerminal's id for a registered folder: sha256 of the path, first 16 hex characters. */
export function projectId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

/**
 * The recent folders to take out after /guild-trial-cleanup: under `~/guild-trial/<trial name>`
 * and no longer on disk. A trial company that is still there keeps its folders. Returns the paths
 * exactly as MulmoTerminal holds them (removal matches the string).
 */
export function forgetTargets(
  presetPaths: readonly string[],
  home: string,
  exists: (path: string) => boolean,
): string[] {
  return presetPaths.filter((preset) => {
    const path = expandHome(preset, home);
    return trialCompanyOf(path, home) !== null && !exists(path);
  });
}

/** The last segment of a path, for the log (never the whole path). */
export function pathTail(path: string): string {
  return path.split('/').at(-1) ?? '';
}
