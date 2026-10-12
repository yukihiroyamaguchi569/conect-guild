import type { ClaudeMdFinding } from './settingsChecks.ts';
import { escapeControls, quote } from './settingsText.ts';

/** One department as it will be written. */
export interface DepartmentRow {
  readonly label: string;
  readonly sessionDir: string;
  readonly prefix: string;
  readonly claudeMd: ClaudeMdFinding;
}

/**
 * What `npm run settings:write` found and did. The same for the table a person reads and the
 * `--json` a skill reads. Never holds a department CLAUDE.md's text, only whether the label was
 * found in it.
 */
export interface WriteReport {
  readonly mode: 'dry-run' | 'write';
  /** No errors: --write writes (or wrote). */
  readonly ok: boolean;
  readonly written: boolean;
  /** The settings file the values not in the input are kept from; null when it could not be read. */
  readonly base: string | null;
  /** guild.settings.local.json is there, so writing replaces it (keeping a .bak). */
  readonly overwrite: boolean;
  readonly repo: string | null;
  readonly commanderSessionDir: string | null;
  readonly departments: readonly DepartmentRow[];
  readonly keptBranchPrefixes: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

const CLAUDE_MD_TEXT: Record<ClaudeMdFinding, string> = {
  found: '見つかった',
  'not-found': '見つからない',
  'no-file': '読めない',
};

export const NEXT_STEPS = [
  '次にやること: npm run dev:all を起動し、collector の settings: の行が guild.settings.local.json で、ok: の行が出ることを確かめてください',
  'sessions=5 ok は MulmoTerminal を使う人だけの確認です（使わないなら sessions unavailable と出てかまいません）',
];

function headLine(report: WriteReport): string {
  if (report.written) return '書きました: guild.settings.local.json';
  if (report.mode === 'write') return '書いていません（エラーがあります）';
  return report.ok ? '確認（まだ書いていません）' : '確認（エラーがあるので書けません）';
}

function overwriteLines(report: WriteReport): string[] {
  if (!report.overwrite) return [];
  if (report.written) return ['前の内容は guild.settings.local.json.bak に残しました'];
  return [
    '注意: guild.settings.local.json が既にあります。書くと上書きになります（--write --overwrite で書き、前の内容は guild.settings.local.json.bak に残します）',
  ];
}

function departmentLines(report: WriteReport): string[] {
  if (report.departments.length === 0) return [];
  return [
    '部門（ラベル / フォルダ / 接頭辞 / フォルダの CLAUDE.md にラベル）:',
    ...report.departments.map(
      (d, i) =>
        `  departments[${String(i)}]  ${quote(d.label)}  ${quote(d.sessionDir)}  ${quote(d.prefix)}  ${CLAUDE_MD_TEXT[d.claudeMd]}`,
    ),
    `branchPrefixes: 入力から ${String(report.departments.length)} 行、既存から ${String(report.keptBranchPrefixes)} 行を保つ`,
    'members（名前・色）と ruleChangePaths は出発点のまま（役が部門のラベルと同じだったメンバーは、新しいラベルに合わせる）',
  ];
}

function listLines(title: string, items: readonly string[]): string[] {
  return items.length === 0
    ? []
    : [`${title}:`, ...items.map((item) => `  - ${escapeControls(item)}`)];
}

/** The table and messages for a person, one string ending in a line break. */
export function renderText(report: WriteReport): string {
  const lines = [
    headLine(report),
    ...(report.base === null ? [] : [`出発点: ${report.base}`]),
    ...overwriteLines(report),
    ...(report.repo === null ? [] : [`repo: ${quote(report.repo)}`]),
    ...(report.commanderSessionDir === null
      ? []
      : [`司令塔のフォルダ: ${quote(report.commanderSessionDir)}`]),
    ...departmentLines(report),
    ...listLines('警告（止めません）', report.warnings),
    ...listLines('エラー（書けません）', report.errors),
    ...(report.written ? NEXT_STEPS : []),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * The same report as one JSON object, for the skill that runs this. JSON leaves the C1 controls
 * and bidi overrides as they are; they are escaped too (still valid JSON, the same strings).
 */
export function renderJson(report: WriteReport): string {
  return `${escapeControls(JSON.stringify(report, null, 2))}\n`;
}
