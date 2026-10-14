import { join } from 'node:path';
import {
  LOCAL_SETTINGS_FILE,
  loadSettingsFile,
  whereUnreadable,
  type LoadedSettings,
} from '@conect-guild/snapshot/settingsFile';
import {
  describeIssues,
  guildSettingsSchema,
  maxGuestsFor,
  type GuildSettings,
} from '@conect-guild/snapshot/settingsSchema';
import type { GhRunner } from './gh.ts';
import {
  checkFolders,
  checkRepoLabels,
  guestFolderErrors,
  type Findings,
} from './settingsChecks.ts';
import { resolveGuestRepos, type GitRunner, type ResolvedGuest } from './settingsGuests.ts';
import {
  companyOf,
  mergeSettings,
  settingsInputSchema,
  type CompanyInput,
  type MergedSettings,
  type SettingsInput,
} from './settingsInput.ts';
import { renderJson, renderText, type GuestRow, type WriteReport } from './settingsReport.ts';

/**
 * Issue #79: `npm run settings:write -- --dry-run | --write [--overwrite] [--json]`. Reads the
 * values from stdin as JSON (the company's, the guests' (Issue #118) or both), lays them over the
 * current settings, checks them and, with --write,
 * writes guild.settings.local.json at the repository root. The file it writes is fixed: no
 * argument or environment variable points it anywhere else (docs/DESIGN.md 4.1).
 */

const BACKUP_FILE = `${LOCAL_SETTINGS_FILE}.bak`;

const USAGE =
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
  /** For a guest's repo suggestion: `git -C <folder> remote get-url origin` (Issue #118). */
  readonly git: GitRunner;
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
  return { ok: false, error: `入力の形が違います:\n${describeIssues(result.error)}` };
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
    companyKept: false,
    guests: [],
    guestsFrom: 'kept',
    maxGuests: null,
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

/**
 * The schema, then (once the values fit it) the folders and the labels. Without company values in
 * the input (Issue #118) the company's folders and labels are not checked again: they are kept as
 * they were. The guests' folders are checked either way.
 */
async function checkMerged(
  merged: MergedSettings,
  company: CompanyInput | null,
  guestsFromInput: boolean,
  deps: SettingsWriteDeps,
): Promise<Checked> {
  const checked = guildSettingsSchema.safeParse(merged.raw);
  if (!checked.success) {
    const error = `設定の検証で止まりました:\n${describeIssues(checked.error)}`;
    return { settings: null, findings: { ...NO_FINDINGS, errors: [error] }, labelWarnings: [] };
  }
  const guestErrors = guestFolderErrors(checked.data, guestsFromInput, deps);
  if (company === null) {
    return {
      settings: checked.data,
      findings: { ...NO_FINDINGS, errors: guestErrors },
      labelWarnings: [],
    };
  }
  const findings = checkFolders(
    checked.data,
    company.departments.map((d) => d.prefix),
    deps,
  );
  return {
    settings: checked.data,
    findings: { ...findings, errors: [...findings.errors, ...guestErrors] },
    labelWarnings: await checkRepoLabels(deps.gh, checked.data),
  };
}

/** The guests as they will be written: the input's with where each repo came from, or the kept. */
function guestRows(
  merged: MergedSettings,
  resolved: readonly ResolvedGuest[] | undefined,
): GuestRow[] {
  if (resolved !== undefined) {
    return resolved.map(({ guest, repoFrom }) => ({
      name: guest.name,
      sessionDir: guest.sessionDir,
      repo: guest.repo ?? null,
      repoFrom,
    }));
  }
  return (merged.raw.guests ?? []).map((guest) => ({
    name: guest.name,
    sessionDir: guest.sessionDir,
    repo: guest.repo ?? null,
    repoFrom: 'kept',
  }));
}

function companyRows(company: CompanyInput | null, claudeMd: Findings['claudeMd']) {
  return {
    repo: company?.repo ?? null,
    commanderSessionDir: company?.commanderSessionDir ?? null,
    departments: (company?.departments ?? []).map((d, i) => ({
      label: d.label,
      sessionDir: d.sessionDir,
      prefix: d.prefix,
      claudeMd: claudeMd[i] ?? 'no-file',
    })),
    companyKept: company === null,
  };
}

async function resolveInputGuests(
  input: SettingsInput,
  deps: SettingsWriteDeps,
): Promise<ResolvedGuest[] | undefined> {
  return input.guests === undefined ? undefined : resolveGuestRepos(input.guests, deps);
}

/** Reads, merges and checks; writes nothing. */
async function plan(options: WriteOptions, deps: SettingsWriteDeps): Promise<Plan> {
  const base = loadBase(deps);
  if (!base.ok) return { report: emptyReport(options, null, base.error), settings: null };
  const input = await readInput(deps);
  if (!input.ok) {
    return { report: emptyReport(options, base.value.file.name, input.error), settings: null };
  }
  const company = companyOf(input.value);
  const resolved = await resolveInputGuests(input.value, deps);
  const merged = mergeSettings(
    base.value.settings,
    company,
    resolved?.map((r) => r.guest),
  );
  const { settings, findings, labelWarnings } = await checkMerged(
    merged,
    company,
    resolved !== undefined,
    deps,
  );
  const overwrite = deps.exists(join(deps.root, LOCAL_SETTINGS_FILE));
  const errors = [...findings.errors, ...refusal(options, overwrite)];
  const report: WriteReport = {
    mode: options.mode,
    ok: errors.length === 0,
    written: false,
    base: base.value.file.name,
    overwrite,
    ...companyRows(company, findings.claudeMd),
    keptBranchPrefixes: merged.keptBranchPrefixes,
    guests: guestRows(merged, resolved),
    guestsFrom: resolved === undefined ? 'kept' : 'input',
    maxGuests: maxGuestsFor(merged.raw.departments.length),
    warnings: [...labelWarnings, ...findings.warnings],
    errors,
  };
  return { report, settings: errors.length === 0 ? settings : null };
}

/** Only JSON.stringify's output is written: nothing in it is ever run. */
function settingsJson(settings: GuildSettings): string {
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
