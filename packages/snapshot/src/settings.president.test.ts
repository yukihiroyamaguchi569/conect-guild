import { describe, expect, it } from 'vitest';
import { makeSettings } from './settings.fixtures.test-util.ts';
import { describeIssues, guildSettingsSchema } from './settingsSchema.ts';

/** Issue #141: the president's label of the settings. */

function issuesOf(input: unknown): string {
  const result = guildSettingsSchema.safeParse(input);
  return result.success ? '' : describeIssues(result.error);
}

describe('guildSettingsSchema president', () => {
  it('keeps settings without president valid', () => {
    const settings = makeSettings(4);
    expect('president' in settings).toBe(false);
    expect(issuesOf(settings)).toBe('');
  });

  it('accepts a label that no department uses', () => {
    const parsed = guildSettingsSchema.parse({ ...makeSettings(4), president: { label: '社長' } });
    expect(parsed.president).toEqual({ label: '社長' });
  });

  it('rejects a department label, an empty label and unknown keys', () => {
    const settings = makeSettings(4);
    const department = settings.departments[1]?.label ?? '';
    expect(issuesOf({ ...settings, president: { label: department } })).toMatch(
      /a department label\n {2}→ at president\.label/,
    );
    expect(issuesOf({ ...settings, president: { label: '' } })).toMatch(/at president\.label/);
    expect(issuesOf({ ...settings, president: { label: '社長', color: '#fff' } })).toMatch(
      /at president/,
    );
  });
});
