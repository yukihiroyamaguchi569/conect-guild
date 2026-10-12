import { describe, expect, it } from 'vitest';
import { CollectorError } from './errors.ts';
import type { GhRunner } from './gh.ts';
import {
  checkLabels,
  isLabelCheckDue,
  labelReport,
  missingAfter,
  missingLabelPositions,
  type LabelCheck,
} from './labels.ts';

const DEPARTMENTS = [{ label: '経理' }, { label: '広報' }, { label: '企画' }, { label: '総務' }];
const SECRET_LABEL = 'Secret client Ltd';

function ghAnswering(stdout: string | Error): GhRunner {
  return () => (stdout instanceof Error ? Promise.reject(stdout) : Promise.resolve(stdout));
}

function lines(names: readonly string[]): string {
  return names.map((name) => `${JSON.stringify(name)}\n`).join('');
}

describe('missingLabelPositions', () => {
  it('finds nothing missing when every label is there, among others', () => {
    expect(missingLabelPositions(DEPARTMENTS, ['bug', '総務', '企画', '広報', '経理'])).toEqual([]);
  });

  it('gives the positions of the missing labels, in the order of the settings', () => {
    expect(missingLabelPositions(DEPARTMENTS, ['広報', '総務'])).toEqual([0, 2]);
  });

  it('finds every label missing in a repository with no labels', () => {
    expect(missingLabelPositions(DEPARTMENTS, [])).toEqual([0, 1, 2, 3]);
  });

  it('finds nothing missing with no departments', () => {
    expect(missingLabelPositions([], ['経理'])).toEqual([]);
  });

  // The same comparison as build.ts uses to tie an Issue to a department: the exact string.
  it.each([
    ['a different case', [{ label: 'Accounting' }], ['accounting']],
    ['a trailing space', [{ label: '経理' }], ['経理 ']],
    ['a leading space', [{ label: '経理' }], [' 経理']],
    ['full-width against half-width', [{ label: 'PR' }], ['ＰＲ']],
    ['a longer name', [{ label: '経理' }], ['経理部']],
    ['a shorter name', [{ label: '経理部' }], ['経理']],
    // NFC and NFD of the same text are different strings, as for the Issue labels.
    ['another Unicode normalisation', [{ label: 'が' }], ['が']],
  ])('counts %s as missing', (_label, departments, repoLabels) => {
    expect(missingLabelPositions(departments, repoLabels)).toEqual([0]);
  });
});

describe('checkLabels', () => {
  it('reads the names and gives the missing positions with the total', async () => {
    await expect(
      checkLabels(ghAnswering(lines(['経理', '企画'])), 'o/r', DEPARTMENTS),
    ).resolves.toEqual({ ok: true, missing: [1, 3], total: 4 });
  });

  it('treats a failed gh as not known, never as missing', async () => {
    await expect(
      checkLabels(ghAnswering(new CollectorError('gh-failed')), 'o/r', DEPARTMENTS),
    ).resolves.toEqual({ ok: false, kind: 'gh-failed' });
  });

  it('treats output that does not validate as not known', async () => {
    await expect(checkLabels(ghAnswering('{"name":1}\n'), 'o/r', DEPARTMENTS)).resolves.toEqual({
      ok: false,
      kind: 'validation-failed',
    });
  });

  it('turns any other error into unexpected without its message', async () => {
    const check = await checkLabels(ghAnswering(new Error(SECRET_LABEL)), 'o/r', DEPARTMENTS);
    expect(check).toEqual({ ok: false, kind: 'unexpected' });
  });
});

describe('isLabelCheckDue', () => {
  it('is due before the first check', () => {
    expect(isLabelCheckDue(null, 0, 600_000)).toBe(true);
  });

  it('is due once the interval has passed, not before', () => {
    expect(isLabelCheckDue(0, 599_999, 600_000)).toBe(false);
    expect(isLabelCheckDue(0, 600_000, 600_000)).toBe(true);
  });
});

describe('missingAfter', () => {
  const ok = (missing: number[]): LabelCheck => ({ ok: true, missing, total: 4 });
  const failed: LabelCheck = { ok: false, kind: 'gh-failed' };

  it('takes what a good check found', () => {
    expect(missingAfter(null, ok([1]))).toEqual([1]);
    expect(missingAfter([1], ok([]))).toEqual([]);
  });

  it('keeps the last finding through a failure, and nothing known stays unknown', () => {
    expect(missingAfter([2], failed)).toEqual([2]);
    expect(missingAfter([], failed)).toEqual([]);
    expect(missingAfter(null, failed)).toBeNull();
  });
});

describe('labelReport', () => {
  it('logs the count when every label is there', () => {
    expect(labelReport({ ok: true, missing: [], total: 4 })).toEqual({
      level: 'log',
      lines: ['labels ok: 4/4'],
    });
  });

  it('gives the positions and the count of the missing ones, and what to do', () => {
    const report = labelReport({ ok: true, missing: [0, 2], total: 4 });
    expect(report.level).toBe('error');
    expect(report.lines[0]).toBe(
      'labels missing 2/4: departments[0], departments[2] のラベルがリポジトリに無い',
    );
    expect(report.lines[1]).toContain('次にやること:');
    expect(report.lines[1]).toContain('departments[n].label');
    // No label name of the settings reaches the log.
    for (const { label } of DEPARTMENTS) expect(report.lines.join('\n')).not.toContain(label);
  });

  it('gives the kind of a failed check only', () => {
    expect(labelReport({ ok: false, kind: 'gh-failed' })).toEqual({
      level: 'error',
      lines: ['labels unknown: gh-failed'],
    });
  });
});
