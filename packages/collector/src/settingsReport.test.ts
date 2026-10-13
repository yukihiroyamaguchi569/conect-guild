import { describe, expect, it } from 'vitest';
import { renderText, type DepartmentRow, type WriteReport } from './settingsReport.ts';

function report(departments: readonly DepartmentRow[]): WriteReport {
  return {
    mode: 'dry-run',
    ok: true,
    written: false,
    base: 'guild.settings.json',
    overwrite: false,
    repo: 'me/company',
    commanderSessionDir: '~/company',
    departments,
    keptBranchPrefixes: 0,
    warnings: [],
    errors: [],
  };
}

const ROWS: readonly DepartmentRow[] = [
  { label: '経理', prefix: 'accounting/', sessionDir: '~/company/accounting', claudeMd: 'found' },
  { label: '広報', prefix: 'pr/', sessionDir: '~/company/pr', claudeMd: 'not-found' },
  { label: 'a\nb', prefix: 'x\u001b/', sessionDir: '~/company/x', claudeMd: 'no-file' },
];

function departmentRows(text: string): string[] {
  const lines = text.split('\n');
  const head = lines.findIndex((line) => line.startsWith('部門（'));
  return lines.slice(head + 1, head + 1 + ROWS.length);
}

describe('renderText: the department table', () => {
  const text = renderText(report(ROWS));
  const rows = departmentRows(text);

  it('names the columns in the order they are shown', () => {
    expect(text).toContain('部門（ラベル / 接頭辞 / フォルダの CLAUDE.md にラベル / フォルダ）:');
  });

  it('puts the label first, its index right after it, and the folder last', () => {
    expect(rows[0]).toMatch(
      /^ {2}"経理"（departments\[0\]） +"accounting\/" +見つかった +"~\/company\/accounting"$/,
    );
    expect(rows[1]).toMatch(
      /^ {2}"広報"（departments\[1\]） +"pr\/" +見つからない +"~\/company\/pr"$/,
    );
  });

  it('starts the prefix, CLAUDE.md and folder columns at the same place on every line', () => {
    const cells = [
      ['"accounting/"', '"pr/"', '"x\\u001b/"'],
      [' 見つかった', ' 見つからない', ' 読めない'],
      ['"~/company/accounting"', '"~/company/pr"', '"~/company/x"'],
    ];
    for (const column of cells) {
      const starts = rows.map((row, i) => row.indexOf(column[i] ?? ''));
      expect(starts.every((at) => at > 0)).toBe(true);
      expect(new Set(starts).size).toBe(1);
    }
  });

  it('keeps a string from outside escaped on one line', () => {
    expect(rows[2]).toMatch(
      /^ {2}"a\\nb"（departments\[2\]） +"x\\u001b\/" +読めない +"~\/company\/x"$/,
    );
    expect(text).not.toContain('\u001b');
  });
});
