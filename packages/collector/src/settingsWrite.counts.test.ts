import { describe, expect, it } from 'vitest';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';
import { runSettingsWrite } from './settingsWrite.ts';
import { fake, input, LABELS, LOCAL, type Fake } from './settingsWrite.fixtures.test-util.ts';

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

  it('stops on five departments, before asking gh and without writing', async () => {
    const data = input();
    data.departments = [...data.departments, ...data.departments.slice(0, 1)];
    const f = fake({ stdin: JSON.stringify(data) });
    expect(await runSettingsWrite(['--write'], f.deps)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.ghCalls).toEqual([]);
    expect(f.output()).toContain('入力の形が違います');
    expect(f.output()).toContain('2 or 3 or 4 departments (#18)');
  });
});
