import { describe, expect, it } from 'vitest';
import { FICTIONAL_REPO, makeSettings } from './settings.fixtures.test-util.ts';
import { guildSettingsSchema } from './settingsSchema.ts';

describe('makeSettings', () => {
  it('builds four departments that pass the schema', () => {
    const settings = makeSettings(4);
    expect(guildSettingsSchema.safeParse(settings).success).toBe(true);
    expect(settings.departments).toHaveLength(4);
  });

  it('keeps departments, branch prefixes and members consistent', () => {
    const settings = makeSettings(4);
    const labels = settings.departments.map((d) => d.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(settings.departments.map((d) => d.member)).size).toBe(labels.length);
    for (const d of settings.departments) {
      expect(Object.keys(settings.members)).toContain(d.member);
      expect(settings.members[d.member].role).toBe(d.label);
    }
    expect(settings.branchPrefixes).toHaveLength(labels.length * 2);
    for (const rule of settings.branchPrefixes) expect(labels).toContain(rule.department);
  });

  it('uses no real values', () => {
    expect(makeSettings(4).repo).toBe(FICTIONAL_REPO);
    expect(JSON.stringify(makeSettings(4))).not.toMatch(/conect|経理|広報|企画|総務/);
  });

  it('builds the requested count of departments', () => {
    for (const count of [1, 2, 3]) {
      const settings = makeSettings(count);
      expect(settings.departments).toHaveLength(count);
      expect(settings.branchPrefixes).toHaveLength(count * 2);
    }
  });

  it('rejects counts it cannot build', () => {
    for (const count of [0, -1, 5, 2.5, Number.NaN]) {
      expect(() => makeSettings(count)).toThrow(RangeError);
    }
  });

  it('applies overrides', () => {
    expect(makeSettings(4, { repo: 'someone/else' }).repo).toBe('someone/else');
  });
});
