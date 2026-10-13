import { statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { GuildSettings } from '@conect-guild/snapshot/settingsSchema';
import type { GhRunner } from './gh.ts';
import { expandHome } from './home.ts';
import { checkLabels, type LabelCheck } from './labels.ts';
import { quote } from './settingsText.ts';

/**
 * Issue #79: what `npm run settings:write` checks on the hand's side before writing, beyond the
 * schema. A folder that is not there stops it; a sign that two departments were mixed up only
 * warns, since a company need not follow the templates of docs/orchestration.md.
 */

/** How to look at the folders; tests pass a fake. */
export interface FolderReader {
  readonly home: string;
  readonly isDirectory: (path: string) => boolean;
  /** The file's text; throws when it cannot be read. */
  readonly readText: (path: string) => string;
}

/**
 * True when `path` is a directory. Any failure (missing, not allowed, a file on the way) is false:
 * the folder is reported as missing, and no error with the path escapes to the terminal.
 */
export function isDirectoryOnDisk(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Whether the department folder's CLAUDE.md mentions the department label. */
export type ClaudeMdFinding = 'found' | 'not-found' | 'no-file';

export interface Findings {
  readonly claudeMd: readonly ClaudeMdFinding[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Looks for `label` in `<dir>/CLAUDE.md`. Only whether it is there leaves this function: the
 * text is never kept, shown or logged (the president's decision on #79).
 */
export function claudeMdMentions(
  dir: string,
  label: string,
  reader: FolderReader,
): ClaudeMdFinding {
  let found: boolean;
  try {
    found = reader.readText(join(dir, 'CLAUDE.md')).includes(label);
  } catch {
    return 'no-file';
  }
  return found ? 'found' : 'not-found';
}

/** `accounting/` → `accounting`: the folder name a prefix of the templates is made from. */
export function prefixMatchesFolder(prefix: string, dir: string): boolean {
  return (prefix.endsWith('/') ? prefix.slice(0, -1) : prefix) === basename(dir);
}

interface Seat {
  readonly name: string;
  readonly dir: string;
}

function seatsOf(settings: GuildSettings): Seat[] {
  return [
    { name: 'commanderSessionDir', dir: settings.commanderSessionDir },
    ...settings.departments.map((d, i) => ({
      name: `departments[${String(i)}].sessionDir`,
      dir: d.sessionDir,
    })),
  ];
}

/** The five folders must be there, and differ once `~` is expanded (the collector stops on that). */
function folderErrors(settings: GuildSettings, reader: FolderReader): string[] {
  const seats = seatsOf(settings);
  const expanded = seats.map((seat) => expandHome(seat.dir, reader.home));
  const missing = seats.flatMap((seat, i) =>
    reader.isDirectory(expanded[i] ?? '')
      ? []
      : [`${seat.name} のフォルダがありません: ${quote(seat.dir)}`],
  );
  const repeated = seats.flatMap((seat, i) =>
    expanded.indexOf(expanded[i] ?? '') === i
      ? []
      : [`${seat.name} は別の項目と同じフォルダを指しています: ${quote(seat.dir)}`],
  );
  return [...missing, ...repeated];
}

function claudeMdWarning(i: number, settings: GuildSettings, finding: ClaudeMdFinding): string[] {
  const d = settings.departments[i];
  if (d === undefined || finding === 'found') return [];
  const where = `departments[${String(i)}]: ${quote(d.sessionDir)} の CLAUDE.md`;
  if (finding === 'no-file') return [`${where} を読めません（ラベルを突き合わせられません）`];
  return [
    `${where} にラベル ${quote(d.label)} が見つかりません。ほかの部門とフォルダが入れ替わっていませんか？`,
  ];
}

function prefixWarnings(settings: GuildSettings, prefixes: readonly string[]): string[] {
  return settings.departments.flatMap((d, i) => {
    const prefix = prefixes[i] ?? '';
    if (prefixMatchesFolder(prefix, d.sessionDir)) return [];
    return [
      `departments[${String(i)}]: 接頭辞 ${quote(prefix)} とフォルダ名 ${quote(basename(d.sessionDir))} が違います。入れ替わっていませんか？`,
    ];
  });
}

/**
 * The folder checks and the warnings that two departments may have been mixed up. `prefixes` are
 * the departments' branch prefixes from the input, in the order of `departments`.
 */
export function checkFolders(
  settings: GuildSettings,
  prefixes: readonly string[],
  reader: FolderReader,
): Findings {
  const errors = folderErrors(settings, reader);
  const claudeMd = settings.departments.map((d) => {
    const dir = expandHome(d.sessionDir, reader.home);
    return reader.isDirectory(dir) ? claudeMdMentions(dir, d.label, reader) : 'no-file';
  });
  const warnings = [
    ...claudeMd.flatMap((finding, i) => claudeMdWarning(i, settings, finding)),
    ...prefixWarnings(settings, prefixes),
  ];
  return { claudeMd, warnings, errors };
}

/** Warnings from the label check (Issue #85). A failed check warns and lets it write. */
export function labelWarnings(check: LabelCheck, settings: GuildSettings): string[] {
  if (!check.ok) {
    return [
      `ラベルを GitHub に問い合わせられませんでした（${check.kind}）。書くことはできます。collector が起動したときと 10 分ごとに照合し直します`,
    ];
  }
  return check.missing.map((i) => {
    const label = settings.departments[i]?.label ?? '';
    return `departments[${String(i)}]: ラベル ${quote(label)} がリポジトリにありません（gh label create で作るか、名前をそろえてください）`;
  });
}

/** The department labels of `settings` against the repository's, through gh. Never throws. */
export async function checkRepoLabels(gh: GhRunner, settings: GuildSettings): Promise<string[]> {
  return labelWarnings(await checkLabels(gh, settings.repo, settings.departments), settings);
}
