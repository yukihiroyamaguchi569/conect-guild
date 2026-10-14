import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS_FILE, SETTINGS_ROOT } from '@conect-guild/snapshot/settingsFile';
import type { GhRunner } from './gh.ts';
import type { GitRunner } from './settingsGuests.ts';
import type { SettingsWriteDeps } from './settingsWrite.ts';

/** Shared fakes for the settings writer tests: an in-memory repository root, home and gh. */

export const ROOT = '/repo';
export const HOME = '/home/me';
export const LOCAL = join(ROOT, 'guild.settings.local.json');
export const BACKUP = join(ROOT, 'guild.settings.local.json.bak');
/** What a department CLAUDE.md says besides its label; it must never leave the writer. */
export const SECRET_LINE = 'Secret client Ltd の見積もりの決まり';

/** The checked-in default settings, as the writer would start from them. */
export const DEFAULT_TEXT = readFileSync(join(SETTINGS_ROOT, DEFAULT_SETTINGS_FILE), 'utf8');

/** What another process wrote to the local settings between the check and the write. */
export const APPEARED = '{"made": "by someone else"}\n';

export const FOLDERS = ['accounting', 'pr', 'planning', 'general-affairs'] as const;
export const LABELS = ['経理', '広報', '企画', '総務'] as const;

export interface InputDepartment {
  label: string;
  sessionDir: string;
  prefix: string;
}

export interface Input {
  repo: string;
  commanderSessionDir: string;
  departments: InputDepartment[];
}

export function input(): Input {
  return {
    repo: 'me/company',
    commanderSessionDir: '~/company',
    departments: FOLDERS.map((folder, i) => ({
      label: LABELS[i] ?? '',
      sessionDir: `~/company/${folder}`,
      prefix: `${folder}/`,
    })),
  };
}

export function claudeMd(label: string): string {
  return `# ${label} AI\n\n${SECRET_LINE}\n- 自分で \`${label}\` ラベルを付けた Issue を立てる\n`;
}

export interface Fake {
  readonly deps: SettingsWriteDeps;
  readonly files: Map<string, string>;
  readonly dirs: Set<string>;
  readonly writes: { path: string; content: string }[];
  readonly ghCalls: (readonly string[])[];
  readonly gitCalls: (readonly string[])[];
  output: () => string;
  stdinReads: () => number;
}

export interface FakeOptions {
  readonly stdin?: string;
  readonly repoLabels?: readonly string[] | Error;
  readonly failWriteOf?: string;
  /** A file that appears at this path after the check, before the write (another process). */
  readonly appearsBeforeWrite?: string;
  /** The origin URL of each folder (expanded path) for the guests' repo suggestion; others fail. */
  readonly gitRemotes?: Readonly<Record<string, string>>;
}

/** The company folders under the fake home, each with a CLAUDE.md naming its own label. */
function companyFiles(files: Map<string, string>, dirs: Set<string>): void {
  dirs.add(join(HOME, 'company'));
  FOLDERS.forEach((folder, i) => {
    const dir = join(HOME, 'company', folder);
    dirs.add(dir);
    files.set(join(dir, 'CLAUDE.md'), claudeMd(LABELS[i] ?? ''));
  });
}

function fakeGh(repoLabels: readonly string[] | Error, calls: (readonly string[])[]): GhRunner {
  return (args) => {
    calls.push(args);
    if (repoLabels instanceof Error) return Promise.reject(repoLabels);
    return Promise.resolve(repoLabels.map((name) => `${JSON.stringify(name)}\n`).join(''));
  };
}

function fakeGit(
  remotes: Readonly<Record<string, string>>,
  calls: (readonly string[])[],
): GitRunner {
  return (args) => {
    calls.push(args);
    const url = args[0] === '-C' && args[1] !== undefined ? remotes[args[1]] : undefined;
    return url === undefined
      ? Promise.reject(new Error('git-failed'))
      : Promise.resolve(`${url}\n`);
  };
}

export function fake(options: FakeOptions = {}): Fake {
  const files = new Map<string, string>([[join(ROOT, DEFAULT_SETTINGS_FILE), DEFAULT_TEXT]]);
  const dirs = new Set<string>([ROOT]);
  companyFiles(files, dirs);
  const writes: { path: string; content: string }[] = [];
  const ghCalls: (readonly string[])[] = [];
  const gitCalls: (readonly string[])[] = [];
  let out = '';
  let reads = 0;
  const deps: SettingsWriteDeps = {
    root: ROOT,
    home: HOME,
    readStdin: () => {
      reads += 1;
      return Promise.resolve(options.stdin ?? JSON.stringify(input()));
    },
    exists: (path) => files.has(path) || dirs.has(path),
    isDirectory: (path) => dirs.has(path),
    readText: (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    gh: fakeGh(options.repoLabels ?? [...LABELS, 'bug'], ghCalls),
    git: fakeGit(options.gitRemotes ?? {}, gitCalls),
    writeFile: (path, content) => {
      if (path === options.failWriteOf) return Promise.reject(new Error('EACCES'));
      writes.push({ path, content });
      files.set(path, content);
      return Promise.resolve();
    },
    createFile: (path, content) => {
      if (path === options.appearsBeforeWrite) files.set(path, APPEARED);
      if (path === options.failWriteOf || files.has(path)) {
        return Promise.reject(new Error('EEXIST'));
      }
      writes.push({ path, content });
      files.set(path, content);
      return Promise.resolve();
    },
    out: (text) => {
      out += text;
    },
  };
  return {
    deps,
    files,
    dirs,
    writes,
    ghCalls,
    gitCalls,
    output: () => out,
    stdinReads: () => reads,
  };
}
