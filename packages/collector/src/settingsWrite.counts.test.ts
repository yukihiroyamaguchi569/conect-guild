import { describe, expect, it } from 'vitest';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import { join } from 'node:path';
import {
  claudeMd,
  fake,
  HOME,
  input,
  LABELS,
  LOCAL,
  type Fake,
} from './settingsWrite.fixtures.test-util.ts';

function written(f: Fake) {
  const text = f.files.get(LOCAL);
  if (text === undefined) throw new Error('not written');
  return checkGuildSettings(JSON.parse(text));
}

describe('runSettingsWrite with fewer departments (Issue #18)', () => {
  it.each([2, 3])(
    'writes %i departments, keeping the members at their positions',
    async (count) => {
      const data = input();
      data.departments = data.departments.slice(0, count);
      const f = fake({ stdin: JSON.stringify(data) });
      expect(await runSettingsWrite(['--write'], f.deps)).toBe(0);
      const settings = written(f);
      expect(settings.departments.map((d) => d.label)).toEqual(LABELS.slice(0, count));
      expect(settings.departments.map((d) => d.member)).toEqual(
        ['minori', 'hibiki', 'hirame'].slice(0, count),
      );
      const labels: readonly string[] = LABELS.slice(0, count);
      expect(settings.branchPrefixes.every((row) => labels.includes(row.department))).toBe(true);
    },
  );

  it('stops on seven departments, before asking gh and without writing', async () => {
    const data = input();
    const spare = (i: number) => ({
      label: `予備${String(i)}`,
      sessionDir: `~/s${String(i)}`,
      prefix: `s${String(i)}/`,
    });
    data.departments = [...data.departments, spare(1), spare(2), spare(3)];
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.ghCalls).toEqual([]);
    expect(f.output()).toContain('入力の形が違います');
    expect(f.output()).toContain('2 or 3 or 4 or 5 or 6 departments (#18)');
  });
});

describe('runSettingsWrite with more departments (Issue #18)', () => {
  it.each([5, 6])(
    'writes %i departments, adding たくみ and むすび with the new labels as their roles',
    async (count) => {
      const data = input();
      const extra = [
        { label: '開発', sessionDir: '~/company/dev', prefix: 'dev/' },
        { label: '営業', sessionDir: '~/company/sales', prefix: 'sales/' },
      ];
      data.departments = [...data.departments, ...extra.slice(0, count - 4)];
      const f = fake({
        stdin: JSON.stringify(data),
        repoLabels: [...LABELS, '開発', '営業'],
      });
      for (const [folder, label] of [
        ['dev', '開発'],
        ['sales', '営業'],
      ] as const) {
        f.dirs.add(join(HOME, 'company', folder));
        f.files.set(join(HOME, 'company', folder, 'CLAUDE.md'), claudeMd(label));
      }
      expect(await runSettingsWrite(['--write'], f.deps), f.output()).toBe(0);
      const settings = written(f);
      expect(settings.departments.map((d) => d.member)).toEqual(
        ['minori', 'hibiki', 'hirame', 'sasae', 'takumi', 'musubi'].slice(0, count),
      );
      expect(settings.members.takumi).toEqual({ name: 'たくみ', role: '開発', color: '#00897b' });
      expect(settings.members.musubi).toEqual(
        count === 6 ? { name: 'むすび', role: '営業', color: '#ff7043' } : undefined,
      );
      // The four members of guild.settings.json are kept as they were.
      expect(settings.members.minori?.name).toBe('みのり');
    },
  );
});
