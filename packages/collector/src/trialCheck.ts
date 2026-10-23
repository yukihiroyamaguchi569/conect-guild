import { join } from 'node:path';
import { z } from 'zod';
import { expandHome } from './home.ts';
import { CURRENT_TRIAL_NAME, isTrialName, TRIAL_MARK } from './trialCells.ts';
import { TRIAL_NOTE } from './trialScaffold.ts';

/**
 * Issue #253: `npm run trial:check`. Checks in code, not in the skill's prose, that a repository
 * and a folder are /guild-trial's trial company before /guild-trial-cleanup deletes them or
 * /guild-trial-renew renames and moves them. Prints one JSON line; the skills use only the
 * repository and the folder it prints. It changes nothing.
 */

export const CHECK_USAGE =
  '使い方: npm run --silent trial:check -- cleanup|renew <owner>/<名前> | renewing <owner>/<名前> <新しい名前> <id>\n';

/** What /guild-trial gives the repository (`gh repo create --description`). */
export const TRIAL_DESCRIPTION = 'conect-guild のお試し商会（架空の会社）';

/** What /guild-trial-renew gives the repository first (its step 4-1). */
export const renewedDescription = (newName: string): string => `${newName} の会社`;

const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const NEW_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NEW_NAME_MAX = 100;
/** A GitHub node id (`gh repo view --json id`), e.g. `R_kgDOabc123`. */
const NODE_ID = /^[A-Za-z0-9_=-]{1,200}$/;

/** What lstat says about a path (a symbolic link is never followed). */
export type Entry = 'missing' | 'link' | 'dir' | 'file' | 'other';

/** A gh run: its stdout, or whether it failed because the repository does not exist. */
export type GhResult =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly notFound: boolean };

/** Everything outside; tests pass fakes. `entry` and `readText` throw when they cannot read. */
export interface CheckDeps {
  /** The conect-guild root, where guild.settings.local.json sits. */
  readonly root: string;
  readonly home: string;
  readonly entry: (path: string) => Entry;
  readonly readText: (path: string) => string;
  /** `git -C <dir> remote get-url origin`, or null when it fails. */
  readonly origin: (dir: string) => Promise<string | null>;
  readonly gh: (args: readonly string[]) => Promise<GhResult>;
}

export type CheckResult =
  | {
      readonly ok: true;
      readonly repo: string | null;
      readonly folder: string | null;
      /** renew only: the repository's node id, for renewing to know it is the same one. */
      readonly id?: string;
      readonly settings?: boolean;
      readonly settingsBak?: boolean;
      readonly kept?: readonly string[];
    }
  | { readonly ok: false; readonly failed: readonly string[] };

interface Target {
  readonly owner: string;
  readonly name: string;
  readonly full: string;
  readonly base: string;
  readonly folder: string;
}

/** What is wrong with `<owner>/<trial name>` (checked before the name builds any path). */
function targetKinds(arg: string): string[] {
  const [owner = '', name = '', ...rest] = arg.split('/');
  return [
    ...(OWNER.test(owner) && rest.length === 0 ? [] : ['owner']),
    ...(isTrialName(name) ? [] : ['name']),
  ];
}

/** Only for an `arg` without {@link targetKinds}. */
function toTarget(arg: string, home: string): Target {
  const [owner = '', name = ''] = arg.split('/');
  const base = join(home, 'guild-trial');
  return { owner, name, full: `${owner}/${name}`, base, folder: join(base, name) };
}

const SettingsPointer = z.object({ repo: z.string(), commanderSessionDir: z.string() });

type Pointer = 'yes' | 'no' | 'unreadable';

/** Whether a settings file points at the trial (`repo` and `commanderSessionDir` both). */
function pointsAt(file: string, t: Target, deps: CheckDeps): Pointer {
  const entry = deps.entry(join(deps.root, file));
  if (entry === 'missing') return 'no';
  if (entry !== 'file') return 'unreadable';
  let value: unknown;
  try {
    value = JSON.parse(deps.readText(join(deps.root, file)));
  } catch {
    return 'unreadable';
  }
  const parsed = SettingsPointer.safeParse(value);
  if (!parsed.success) return 'unreadable';
  const { repo, commanderSessionDir } = parsed.data;
  return repo === t.full && expandHome(commanderSessionDir, deps.home) === t.folder ? 'yes' : 'no';
}

interface FolderFacts {
  readonly entry: Entry;
  readonly claudeMd: Entry;
  /** Lines with the trial mark, and lines that are exactly TRIAL_NOTE, in the 司令塔's CLAUDE.md. */
  readonly marks: number;
  readonly notes: number;
  readonly origin: string | null;
}

async function folderFacts(t: Target, deps: CheckDeps): Promise<FolderFacts> {
  const entry = deps.entry(t.folder);
  if (entry !== 'dir') return { entry, claudeMd: 'missing', marks: 0, notes: 0, origin: null };
  const path = join(t.folder, 'CLAUDE.md');
  const claudeMd = deps.entry(path);
  const lines = claudeMd === 'file' ? deps.readText(path).split('\n') : [];
  return {
    entry,
    claudeMd,
    marks: lines.filter((line) => line.includes(TRIAL_MARK)).length,
    notes: lines.filter((line) => line === TRIAL_NOTE).length,
    origin: await deps.origin(t.folder),
  };
}

/** The origin URLs that point at `<owner>/<name>` on GitHub (https or ssh, `.git` optional). */
function pointsToRepo(origin: string | null, full: string): boolean {
  const urls = [`https://github.com/${full}`, `git@github.com:${full}`];
  return urls.some((url) => origin === url || origin === `${url}.git`);
}

const RepoView = z.object({
  id: z.string(),
  nameWithOwner: z.string(),
  isPrivate: z.boolean(),
  description: z.string().nullable(),
});

type RepoFacts = z.infer<typeof RepoView> | 'missing' | 'gh-failed' | 'gh-invalid';

async function viewRepo(full: string, deps: CheckDeps): Promise<RepoFacts> {
  const result = await deps.gh([
    'repo',
    'view',
    full,
    '--json',
    'id,nameWithOwner,isPrivate,description',
  ]);
  if (!result.ok) return result.notFound ? 'missing' : 'gh-failed';
  try {
    const parsed = RepoView.safeParse(JSON.parse(result.stdout));
    return parsed.success ? parsed.data : 'gh-invalid';
  } catch {
    return 'gh-invalid';
  }
}

/**
 * What is wrong with the repository; `description` null accepts any (the old-form names), `id`
 * null any repository.
 */
function repoKinds(
  facts: RepoFacts,
  full: string,
  description: string | null,
  id: string | null = null,
): string[] {
  if (typeof facts === 'string') return [facts === 'missing' ? 'repo-missing' : facts];
  return [
    ...(id === null || facts.id === id ? [] : ['repo-id']),
    ...(facts.nameWithOwner === full ? [] : ['repo-name']),
    ...(facts.isPrivate ? [] : ['repo-public']),
    ...(description === null || facts.description === description ? [] : ['repo-description']),
  ];
}

/**
 * /guild-trial-cleanup: what of this trial may be deleted. Stops (ok false) only when it cannot
 * tell: `~/guild-trial` is a link, a settings file is unreadable, gh fails or answers oddly.
 * Otherwise lists what it keeps and why.
 */
async function checkCleanup(t: Target, deps: CheckDeps): Promise<CheckResult> {
  if (deps.entry(t.base) === 'link') return { ok: false, failed: ['base-symlink'] };
  const settings = cleanupSettings(t, deps);
  if (settings === null) return { ok: false, failed: ['settings-unreadable'] };
  const folder = await folderFacts(t, deps);
  const trialFolder = isTrialFolder(folder, t);
  const linked = settings.settings || trialFolder;
  const repoKept = linked ? await cleanupRepoKinds(t, deps) : ['repo-not-linked'];
  if (repoKept.includes('gh-failed') || repoKept.includes('gh-invalid')) {
    return { ok: false, failed: repoKept };
  }
  return {
    ok: true,
    repo: repoKept.length === 0 ? t.full : null,
    folder: trialFolder ? t.folder : null,
    ...settings,
    kept: [...folderKept(folder.entry, trialFolder), ...repoKept],
  };
}

/**
 * Whether guild.settings.local.json and its .bak point at the trial; null when unreadable. The
 * .bak goes only with the settings it backs up, so it is read only then.
 */
function cleanupSettings(
  t: Target,
  deps: CheckDeps,
): { settings: boolean; settingsBak: boolean } | null {
  const settings = pointsAt('guild.settings.local.json', t, deps);
  const bak = settings === 'yes' ? pointsAt('guild.settings.local.json.bak', t, deps) : 'no';
  if (settings === 'unreadable' || bak === 'unreadable') return null;
  return { settings: settings === 'yes', settingsBak: bak === 'yes' };
}

/**
 * A real folder whose 司令塔's CLAUDE.md (a file, not a link) has the trial mark and whose origin
 * is the trial's repository. /guild-trial always gives it that origin (`gh repo create --source`),
 * so the mark alone, which any text can carry, is not enough.
 */
const isTrialFolder = (folder: FolderFacts, t: Target): boolean =>
  folder.entry === 'dir' &&
  folder.claudeMd === 'file' &&
  folder.marks > 0 &&
  pointsToRepo(folder.origin, t.full);

/**
 * The repository must have /guild-trial's description, whatever the name's form. Without it, it
 * may be a real one made under the trial's name after the trial was deleted by hand (a leftover
 * folder's origin then points at it too), so an old-form one, made before the description, is
 * kept for the user to delete on GitHub.
 */
async function cleanupRepoKinds(t: Target, deps: CheckDeps): Promise<string[]> {
  return repoKinds(await viewRepo(t.full, deps), t.full, TRIAL_DESCRIPTION);
}

/** Why cleanup keeps a folder that is there (none when it deletes it or there is none). */
function folderKept(entry: Entry, trialFolder: boolean): string[] {
  if (entry === 'link') return ['folder-symlink'];
  return entry === 'missing' || trialFolder ? [] : ['folder-not-trial'];
}

/** The checks /guild-trial-renew makes on the folder and the settings at every stage. */
function placeKinds(t: Target, settings: Pointer, folder: FolderFacts, base: Entry): string[] {
  const settingsKind = settings === 'no' ? 'settings-not-trial' : 'settings-unreadable';
  const folderKind = folder.entry === 'link' ? 'folder-symlink' : 'folder-missing';
  return [
    ...(CURRENT_TRIAL_NAME.test(t.name) ? [] : ['name-old-form']),
    ...(base === 'link' ? ['base-symlink'] : []),
    ...(settings === 'yes' ? [] : [settingsKind]),
    ...(folder.entry === 'dir' ? [] : [folderKind]),
  ];
}

/** /guild-trial-renew before it changes anything: the trial exactly as /guild-trial made it. */
async function checkRenew(t: Target, deps: CheckDeps): Promise<CheckResult> {
  const settings = pointsAt('guild.settings.local.json', t, deps);
  const folder = await folderFacts(t, deps);
  const failed = placeKinds(t, settings, folder, deps.entry(t.base));
  if (folder.entry === 'dir') {
    if (folder.claudeMd === 'link') failed.push('claude-md-symlink');
    if (folder.marks !== 1) failed.push('mark-count');
    if (folder.notes !== 1) failed.push('note-count');
    if (!pointsToRepo(folder.origin, t.full)) failed.push('origin');
  }
  const facts = await viewRepo(t.full, deps);
  failed.push(...repoKinds(facts, t.full, TRIAL_DESCRIPTION));
  if (failed.length > 0 || typeof facts === 'string') return { ok: false, failed };
  return { ok: true, repo: t.full, folder: t.folder, id: facts.id };
}

/**
 * /guild-trial-renew after its step 4-1 (before renaming and moving): the repository now has
 * `<新> の会社` as its description, under the old name or already renamed to `<owner>/<新>`; the
 * folder is still `~/guild-trial/<旧>` and the settings still point at it. Whichever name it is
 * found under, it must be the repository `renew` checked (its node id), not another one that
 * happens to have that name and description. Prints where the repository is now.
 */
async function checkRenewing(
  t: Target,
  newName: string,
  id: string,
  deps: CheckDeps,
): Promise<CheckResult> {
  const settings = pointsAt('guild.settings.local.json', t, deps);
  const folder = await folderFacts(t, deps);
  const failed = placeKinds(t, settings, folder, deps.entry(t.base));
  const renamed = `${t.owner}/${newName}`;
  if (folder.entry === 'dir' && ![t.full, renamed].some((r) => pointsToRepo(folder.origin, r))) {
    failed.push('origin');
  }
  let full = renamed;
  let facts = await viewRepo(renamed, deps);
  if (facts === 'missing') {
    full = t.full;
    facts = await viewRepo(t.full, deps);
  }
  failed.push(...repoKinds(facts, full, renewedDescription(newName), id));
  return failed.length === 0 ? { ok: true, repo: full, folder: t.folder } : { ok: false, failed };
}

const validNewName = (name: string): boolean =>
  NEW_NAME.test(name) &&
  name.length <= NEW_NAME_MAX &&
  !name.startsWith('guild-trial') &&
  !isTrialName(name);

async function check(args: readonly string[], deps: CheckDeps): Promise<CheckResult> {
  const [mode, repoArg = '', newName = '', id = ''] = args;
  const wrong = targetKinds(repoArg);
  if (wrong.length > 0) return { ok: false, failed: wrong };
  const target = toTarget(repoArg, deps.home);
  if (mode === 'cleanup') return checkCleanup(target, deps);
  if (mode === 'renew') return checkRenew(target, deps);
  const wrongRenewing = [
    ...(validNewName(newName) ? [] : ['new-name']),
    ...(NODE_ID.test(id) ? [] : ['id']),
  ];
  if (wrongRenewing.length > 0) return { ok: false, failed: wrongRenewing };
  return checkRenewing(target, newName, id, deps);
}

const isUsage = (args: readonly string[]): boolean => {
  const [mode] = args;
  if (mode === 'cleanup' || mode === 'renew') return args.length !== 2;
  return mode !== 'renewing' || args.length !== 4;
};

/** Runs the command; resolves with the exit code (0 checked, 1 not a trial or unknown, 2 usage). */
export async function runTrialCheck(
  args: readonly string[],
  deps: CheckDeps,
  out: (text: string) => void,
  err: (text: string) => void,
): Promise<number> {
  if (isUsage(args)) {
    err(CHECK_USAGE);
    return 2;
  }
  let result: CheckResult;
  try {
    result = await check(args, deps);
  } catch {
    result = { ok: false, failed: ['unreadable'] };
  }
  out(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}
