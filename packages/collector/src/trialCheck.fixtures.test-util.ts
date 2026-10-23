import { HOME } from './trialCells.fixtures.test-util.ts';
import { runTrialCheck, TRIAL_DESCRIPTION, type CheckDeps, type GhResult } from './trialCheck.ts';
import { TRIAL_NOTE } from './trialScaffold.ts';

// Test-only: a made-up machine with one trial company `guild-trial` of `tester`, as /guild-trial
// leaves it. Tests change the parts they need.

export const ROOT = '/repo';
export const BASE = `${HOME}/guild-trial`;
export const FOLDER = `${BASE}/guild-trial`;
export const REPO = 'tester/guild-trial';
export const SETTINGS = `${ROOT}/guild.settings.local.json`;
export const BAK = `${SETTINGS}.bak`;
export const CLAUDE_MD = `${FOLDER}/CLAUDE.md`;
export const COMMANDER_MD = `# CLAUDE.md\n\n${TRIAL_NOTE}\n\n## 部門\n`;

export const settingsJson = (repo: string, dir: string): string =>
  JSON.stringify({ repo, commanderSessionDir: dir, departments: [] });

/** The trial repository's node id on GitHub (it stays when the repository is renamed). */
export const TRIAL_ID = 'R_kgDOtrial1';

export const repoJson = (
  nameWithOwner: string,
  isPrivate = true,
  description = TRIAL_DESCRIPTION,
  id = TRIAL_ID,
) =>
  ({
    ok: true,
    stdout: JSON.stringify({ id, nameWithOwner, isPrivate, description }),
  }) as const;

export const NOT_FOUND: GhResult = { ok: false, notFound: true };

export interface World {
  files: Map<string, string>;
  dirs: Set<string>;
  links: Set<string>;
  origins: Map<string, string>;
  repos: Map<string, GhResult>;
  /** The gh calls made, in order. */
  ghCalls: string[][];
}

export function trialWorld(): World {
  return {
    files: new Map([
      [SETTINGS, settingsJson(REPO, '~/guild-trial/guild-trial')],
      [BAK, settingsJson(REPO, FOLDER)],
      [CLAUDE_MD, COMMANDER_MD],
    ]),
    dirs: new Set([BASE, FOLDER]),
    links: new Set(),
    origins: new Map([[FOLDER, `https://github.com/${REPO}.git`]]),
    repos: new Map([[REPO, repoJson(REPO)]]),
    ghCalls: [],
  };
}

export function depsOf(world: World): CheckDeps {
  return {
    root: ROOT,
    home: HOME,
    entry: (path) => {
      if (world.links.has(path)) return 'link';
      if (world.dirs.has(path)) return 'dir';
      return world.files.has(path) ? 'file' : 'missing';
    },
    readText: (path) => {
      const text = world.files.get(path);
      if (text === undefined) throw new Error('no file');
      return text;
    },
    origin: async (dir) => Promise.resolve(world.origins.get(dir) ?? null),
    gh: async (args) => {
      world.ghCalls.push([...args]);
      return Promise.resolve(world.repos.get(args[2] ?? '') ?? NOT_FOUND);
    },
  };
}

/** Runs the command in `world`; the exit code and the parsed JSON line (null when none). */
export async function checkIn(
  world: World,
  args: readonly string[],
  deps: CheckDeps = depsOf(world),
): Promise<{ code: number; result: unknown; errors: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runTrialCheck(
    args,
    deps,
    (t) => out.push(t),
    (t) => err.push(t),
  );
  const line = out.join('');
  return { code, result: line === '' ? null : JSON.parse(line), errors: err.join('') };
}
