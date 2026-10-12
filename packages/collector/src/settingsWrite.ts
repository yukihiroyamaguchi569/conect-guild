import { join } from 'node:path';
import { z } from 'zod';
import {
  LOCAL_SETTINGS_FILE,
  loadSettingsFile,
  whereUnreadable,
  type LoadedSettings,
} from '@conect-guild/snapshot/settingsFile';
import { guildSettingsSchema, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import type { GhRunner } from './gh.ts';
import { checkFolders, checkRepoLabels, type Findings } from './settingsChecks.ts';
import {
  mergeSettings,
  settingsInputSchema,
  type MergedSettings,
  type SettingsInput,
} from './settingsInput.ts';
import { renderJson, renderText, type WriteReport } from './settingsReport.ts';

/**
 * Issue #79: `npm run settings:write -- --dry-run | --write [--overwrite] [--json]`. Reads the
 * values from stdin as JSON, lays them over the current settings, checks them and, with --write,
 * writes guild.settings.local.json at the repository root. The file it writes is fixed: no
 * argument or environment variable points it anywhere else (docs/DESIGN.md 4.1).
 */

export const BACKUP_FILE = `${LOCAL_SETTINGS_FILE}.bak`;

export const USAGE =
  '使い方: npm run settings:write -- --dry-run [--json] < 入力.json\n' +
  '        npm run settings:write -- --write [--overwrite] [--json] < 入力.json\n';

export interface WriteOptions {
  readonly mode: 'dry-run' | 'write';
  readonly overwrite: boolean;
  readonly json: boolean;
}

const KNOWN_ARGS = new Set(['--dry-run', '--write', '--overwrite', '--json']);

/** Exactly one of --dry-run and --write; null for anything else. */
export function parseWriteArgs(args: readonly string[]): WriteOptions | null {
  if (args.some((arg) => !KNOWN_ARGS.has(arg)) || new Set(args).size !== args.length) return null;
  const dryRun = args.includes('--dry-run');
  if (dryRun === args.includes('--write')) return null;
  return {
    mode: dryRun ? 'dry-run' : 'write',
    overwrite: args.includes('--overwrite'),
    json: args.includes('--json'),
  };
}

/** Everything outside: files, gh, stdin and output. Tests pass fakes. */
export interface SettingsWriteDeps {
  /** The repository root, where the settings files sit. */
  readonly root: string;
  readonly home: string;
  readonly readStdin: () => Promise<string>;
  readonly exists: (path: string) => boolean;
  readonly isDirectory: (path: string) => boolean;
  readonly readText: (path: string) => string;
  readonly gh: GhRunner;
  /** Replaces the file atomically (temp file, then rename), 0600. */
  readonly writeFile: (path: string, content: string) => Promise<void>;
  /** Creates the file whole, 0600, failing when it already exists (never replaces one). */
  readonly createFile: (path: string, content: string) => Promise<void>;
  readonly out: (text: string) => void;
}

type Step<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function loadBase(deps: SettingsWriteDeps): Step<LoadedSettings> {
  try {
    return { ok: true, value: loadSettingsFile(deps.root, deps) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '設定を読めません' };
  }
}

async function readInput(deps: SettingsWriteDeps): Promise<Step<SettingsInput>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await deps.readStdin());
  } catch (error) {
    return { ok: false, error: `標準入力を JSON として読めません（${whereUnreadable(error)}）` };
  }
  const result = settingsInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: `入力の形が違います:\n${z.prettifyError(result.error)}` };
}

function emptyReport(options: WriteOptions, base: string | null, error: string): WriteReport {
  return {
    mode: options.mode,
    ok: false,
    written: false,
    base,
    overwrite: false,
    repo: null,
    commanderSessionDir: null,
    departments: [],
    keptBranchPrefixes: 0,
    warnings: [],
    errors: [error],
  };
}

interface Plan {
  readonly report: WriteReport;
  /** The settings to write when the report has no errors. */
  readonly settings: GuildSettings | null;
}

function refusal(options: WriteOptions, overwrite: boolean): string[] {
  if (options.mode !== 'write' || !overwrite || options.overwrite) return [];
  return [`${LOCAL_SETTINGS_FILE} が既にあります。上書きするなら --overwrite を付けてください`];
}

interface Checked {
  readonly settings: GuildSettings | null;
  readonly findings: Findings;
  readonly labelWarnings: readonly string[];
}

const NO_FINDINGS: Findings = { claudeMd: [], warnings: [], errors: [] };

/** The schema, then (once the values fit it) the folders and the labels. */
async function checkMerged(
  merged: MergedSettings,
  input: SettingsInput,
  deps: SettingsWriteDeps,
): Promise<Checked> {
  const checked = guildSettingsSchema.safeParse(merged.raw);
  if (!checked.success) {
    const error = `設定の検証で止まりました:\n${z.prettifyError(checked.error)}`;
    return { settings: null, findings: { ...NO_FINDINGS, errors: [error] }, labelWarnings: [] };
  }
  const prefixes = input.departments.map((d) => d.prefix);
  return {
    settings: checked.data,
    findings: checkFolders(checked.data, prefixes, deps),
    labelWarnings: await checkRepoLabels(deps.gh, checked.data),
  };
}

/** Reads, merges and checks; writes nothing. */
async function plan(options: WriteOptions, deps: SettingsWriteDeps): Promise<Plan> {
  const base = loadBase(deps);
  if (!base.ok) return { report: emptyReport(options, null, base.error), settings: null };
  const input = await readInput(deps);
  if (!input.ok) {
    return { report: emptyReport(options, base.value.file.name, input.error), settings: null };
  }
  const merged = mergeSettings(base.value.settings, input.value);
  const { settings, findings, labelWarnings } = await checkMerged(merged, input.value, deps);
  const overwrite = deps.exists(join(deps.root, LOCAL_SETTINGS_FILE));
  const errors = [...findings.errors, ...refusal(options, overwrite)];
  const report: WriteReport = {
    mode: options.mode,
    ok: errors.length === 0,
    written: false,
    base: base.value.file.name,
    overwrite,
    repo: input.value.repo,
    commanderSessionDir: input.value.commanderSessionDir,
    departments: input.value.departments.map((d, i) => ({
      label: d.label,
      sessionDir: d.sessionDir,
      prefix: d.prefix,
      claudeMd: findings.claudeMd[i] ?? 'no-file',
    })),
    keptBranchPrefixes: merged.keptBranchPrefixes,
    warnings: [...labelWarnings, ...findings.warnings],
    errors,
  };
  return { report, settings: errors.length === 0 ? settings : null };
}

/** Only JSON.stringify's output is written: nothing in it is ever run. */
export function settingsJson(settings: GuildSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** Keeps the old local settings as .bak, then replaces them. Throws when a file cannot be written. */
async function writeSettings(
  settings: GuildSettings,
  overwrite: boolean,
  deps: SettingsWriteDeps,
): Promise<void> {
  const target = join(deps.root, LOCAL_SETTINGS_FILE);
  if (!overwrite) {
    // A file that appeared after the check is not replaced without --overwrite.
    await deps.createFile(target, settingsJson(settings));
    return;
  }
  await deps.writeFile(join(deps.root, BACKUP_FILE), deps.readText(target));
  await deps.writeFile(target, settingsJson(settings));
}

async function carryOut(options: WriteOptions, deps: SettingsWriteDeps): Promise<WriteReport> {
  const { report, settings } = await plan(options, deps);
  if (options.mode !== 'write' || settings === null) return report;
  try {
    await writeSettings(settings, report.overwrite, deps);
  } catch {
    return { ...report, ok: false, errors: [`${LOCAL_SETTINGS_FILE} を書けませんでした`] };
  }
  return { ...report, written: true };
}

/** Runs the command; resolves with the exit code (0 ok, 1 errors, 2 usage). */
export async function runSettingsWrite(
  args: readonly string[],
  deps: SettingsWriteDeps,
): Promise<number> {
  const options = parseWriteArgs(args);
  if (options === null) {
    deps.out(USAGE);
    return 2;
  }
  const report = await carryOut(options, deps);
  deps.out(options.json ? renderJson(report) : renderText(report));
  return report.ok ? 0 : 1;
}
