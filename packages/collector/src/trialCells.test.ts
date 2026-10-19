import { describe, expect, it } from 'vitest';
import { CLAUDE_MD, HOME, trialSettings } from './trialCells.fixtures.test-util.ts';
import { forgetTargets, pathTail, projectId, trialCells, trialCompanyOf } from './trialCells.ts';

describe('trialCells', () => {
  it('opens the 司令塔 first, then each department, with ~ expanded', () => {
    const result = trialCells(trialSettings(2), HOME, CLAUDE_MD);
    expect(result).toEqual({
      ok: true,
      cells: [
        {
          path: '/home/tester/guild-trial/guild-trial',
          label: 'テスト司令（司令塔）',
          message: 'あなたはお試し商会の司令塔です。CLAUDE.md を読み、社長の依頼を待ってください。',
        },
        {
          path: '/home/tester/guild-trial/guild-trial/accounting',
          label: 'テスト一（経理）',
          message: 'あなたはお試し商会の経理部門です。CLAUDE.md を読み、Issue を待ってください。',
        },
        {
          path: '/home/tester/guild-trial/guild-trial/pr',
          label: 'テスト二（広報）',
          message: 'あなたはお試し商会の広報部門です。CLAUDE.md を読み、Issue を待ってください。',
        },
      ],
    });
  });

  it.each([2, 3, 4, 5, 6])('opens %i departments and the 司令塔', (count) => {
    const result = trialCells(trialSettings(count), HOME, CLAUDE_MD);
    expect(result.ok && result.cells.length).toBe(count + 1);
  });

  it('accepts the absolute form and the numbered and dated names', () => {
    for (const root of [`${HOME}/guild-trial/guild-trial-2`, '~/guild-trial/20261015-a3f9']) {
      expect(trialCells(trialSettings(4, root), HOME, CLAUDE_MD).ok).toBe(true);
    }
  });
});

describe('trialCells: refusals', () => {
  it('refuses a company outside ~/guild-trial/<trial name>', () => {
    for (const root of [
      '~/conect-management',
      '~/guild-trial',
      '~/guild-trial/my-company',
      '~/guild-trial/guild-trial/accounting',
      '/srv/guild-trial/guild-trial',
    ]) {
      expect(trialCells(trialSettings(4, root), HOME, CLAUDE_MD)).toEqual({
        ok: false,
        reason: 'お試しの会社の設定ではないので、まとめて開きません',
      });
    }
  });

  it('refuses when the 司令塔 CLAUDE.md lacks the trial mark or cannot be read', () => {
    expect(trialCells(trialSettings(4), HOME, '# 司令塔\n').ok).toBe(false);
    expect(trialCells(trialSettings(4), HOME, null).ok).toBe(false);
  });

  it('refuses a department outside the company or with a label not in the trial table', () => {
    const settings = trialSettings(2);
    const [first, second] = settings.departments;
    if (first === undefined || second === undefined) throw new Error('two departments');
    const outside = { ...settings, departments: [first, { ...second, sessionDir: '~/elsewhere' }] };
    const label = { ...settings, departments: [first, { ...second, label: '何でも屋' }] };
    expect(trialCells(outside, HOME, CLAUDE_MD).ok).toBe(false);
    expect(trialCells(label, HOME, CLAUDE_MD).ok).toBe(false);
  });

  it('refuses a department count outside 2..6', () => {
    expect(trialCells(trialSettings(1), HOME, CLAUDE_MD).ok).toBe(false);
  });
});

describe('trialCompanyOf', () => {
  it('finds the trial company folder a path is or is under', () => {
    const company = '/home/tester/guild-trial/guild-trial-3';
    expect(trialCompanyOf(company, HOME)).toBe(company);
    expect(trialCompanyOf(`${company}/pr`, HOME)).toBe(company);
    expect(trialCompanyOf('/home/tester/guild-trial', HOME)).toBeNull();
    expect(trialCompanyOf('/home/tester/guild-trial/notes', HOME)).toBeNull();
    expect(trialCompanyOf('/home/tester/guild-trial-2', HOME)).toBeNull();
  });
});

describe('forgetTargets', () => {
  it('takes only trial folders that no longer exist, as MulmoTerminal holds them', () => {
    const gone = new Set([
      '/home/tester/guild-trial/guild-trial',
      '/home/tester/guild-trial/guild-trial/pr',
    ]);
    const presets = [
      '/home/tester/guild-trial/guild-trial',
      '~/guild-trial/guild-trial/pr',
      '/home/tester/guild-trial/guild-trial-2',
      '/home/tester/conect-management',
      '/home/tester/guild-trial/notes',
    ];
    const exists = (path: string): boolean => !gone.has(path) && !path.endsWith('notes');
    expect(forgetTargets(presets, HOME, exists)).toEqual([
      '/home/tester/guild-trial/guild-trial',
      '~/guild-trial/guild-trial/pr',
    ]);
  });
});

describe('projectId and pathTail', () => {
  it('hashes the path like MulmoTerminal (sha256, first 16 hex)', () => {
    expect(projectId('/a')).toMatch(/^[0-9a-f]{16}$/);
    // sha256("abc") starts with ba7816bf8f01cfea.
    expect(projectId('abc')).toBe('ba7816bf8f01cfea');
  });

  it('keeps only the last segment', () => {
    expect(pathTail('/home/tester/guild-trial/guild-trial/pr')).toBe('pr');
  });
});
