import { join } from 'node:path';
import { loadSettingsFile, type SettingsReader } from '@conect-guild/snapshot/settingsFile';
import { escapeForTerminal, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { expandHome } from './home.ts';
import type { CallFailure, MulmoTerminalClient } from './mulmoTerminal.ts';
import {
  forgetTargets,
  pathTail,
  projectId,
  trialCells,
  type Cell,
  type CellsResult,
} from './trialCells.ts';

/**
 * Issue #223: `npm run trial:open-cells` opens a MulmoTerminal cell for the 司令塔 and each
 * department of the trial company in the settings in use (/guild-trial's only). With `--forget`
 * it takes the trial folders that no longer exist out of MulmoTerminal's recent folders (after
 * /guild-trial-cleanup). The user types it: Claude does not run it.
 */

export const OPEN_CELLS_USAGE = '使い方: npm run trial:open-cells [-- --forget]\n';

const NOT_RUNNING = 'MulmoTerminal が動いていないので開きません\n';
const NOT_RUNNING_FORGET = 'MulmoTerminal が動いていないので外せません\n';

/** Everything outside; tests pass fakes. */
export interface OpenCellsDeps extends SettingsReader {
  /** The repository root, where the settings files sit. */
  readonly root: string;
  readonly home: string;
  /** True when the path itself is a symbolic link (lstat). */
  readonly isSymlink: (path: string) => boolean;
  /** null when MULMOTERMINAL_PORT is not a port number. */
  readonly client: MulmoTerminalClient | null;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

const FAILURE_TEXT: Record<CallFailure, string> = {
  unreachable: 'MulmoTerminal が応答しません',
  http: 'MulmoTerminal がエラーを返しました',
  'bad-answer': 'MulmoTerminal に断られました',
};

/** The text of the 司令塔's CLAUDE.md, or null when it is missing or unreadable. */
function readClaudeMd(deps: OpenCellsDeps, dir: string): string | null {
  const path = join(expandHome(dir, deps.home), 'CLAUDE.md');
  try {
    return deps.exists(path) ? deps.readText(path) : null;
  } catch {
    return null;
  }
}

function cellsToOpen(deps: OpenCellsDeps): CellsResult {
  let loaded: GuildSettings;
  try {
    loaded = loadSettingsFile(deps.root, deps).settings;
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : '設定を読めません' };
  }
  const claudeMd = readClaudeMd(deps, loaded.commanderSessionDir);
  return trialCells(loaded, deps.home, claudeMd, deps.isSymlink);
}

/** Record then spawn; null when opened, else why not. */
async function openCell(client: MulmoTerminalClient, cell: Cell): Promise<CallFailure | null> {
  const recorded = await client.record(cell.path, cell.label);
  if (!recorded.ok) return recorded.failure;
  const spawned = await client.spawn(projectId(cell.path), cell.message);
  return spawned.ok ? null : spawned.failure;
}

async function openAll(deps: OpenCellsDeps, client: MulmoTerminalClient): Promise<number> {
  const result = cellsToOpen(deps);
  if (!result.ok) {
    deps.err(`${result.reason}\n`);
    return 1;
  }
  const { cells } = result;
  let failed = 0;
  for (const [i, cell] of cells.entries()) {
    const failure = await openCell(client, cell);
    if (failure === 'unreachable' && i === 0) {
      deps.err(NOT_RUNNING);
      return 1;
    }
    const where = cell.logName;
    if (failure === null) {
      deps.out(`開きました: ${where}\n`);
    } else {
      failed += 1;
      deps.out(`開けませんでした: ${where}（${FAILURE_TEXT[failure]}）\n`);
    }
  }
  if (failed === 0) deps.out('各セルで「信頼しますか？」と聞かれたら答えてください\n');
  return failed === 0 ? 0 : 1;
}

async function forgetAll(deps: OpenCellsDeps, client: MulmoTerminalClient): Promise<number> {
  const listed = await client.presetPaths();
  if (!listed.ok) {
    deps.err(
      listed.failure === 'unreachable' ? NOT_RUNNING_FORGET : `${FAILURE_TEXT[listed.failure]}\n`,
    );
    return 1;
  }
  const targets = forgetTargets(listed.value, deps.home, deps.exists);
  if (targets.length === 0) {
    deps.out('外すお試しのフォルダはありません\n');
    return 0;
  }
  let failed = 0;
  for (const path of targets) {
    const removed = await client.remove(path);
    if (removed.ok) {
      deps.out(`外しました: ${escapeForTerminal(pathTail(path))}\n`);
    } else {
      failed += 1;
      deps.out(
        `外せませんでした: ${escapeForTerminal(pathTail(path))}（${FAILURE_TEXT[removed.failure]}）\n`,
      );
    }
  }
  return failed === 0 ? 0 : 1;
}

/** Runs the command; resolves with the exit code (0 done, 1 not or partly, 2 usage). */
export async function runTrialOpenCells(
  args: readonly string[],
  deps: OpenCellsDeps,
): Promise<number> {
  const forget = args.length === 1 && args[0] === '--forget';
  if (args.length > 0 && !forget) {
    deps.err(OPEN_CELLS_USAGE);
    return 2;
  }
  if (deps.client === null) {
    deps.err('MULMOTERMINAL_PORT がポートの番号ではありません\n');
    return 1;
  }
  return forget ? forgetAll(deps, deps.client) : openAll(deps, deps.client);
}
