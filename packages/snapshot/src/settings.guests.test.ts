import { describe, expect, it } from 'vitest';
import { FICTIONAL_GUESTS, FICTIONAL_REPO, makeSettings } from './settings.fixtures.test-util.ts';
import { describeIssues, guildSettingsSchema } from './settingsSchema.ts';

/** Issue #108: the guests of the settings. */

/** Not typed as settings, so a test can hand the schema any guest. */
function withGuests(guests: readonly unknown[]): unknown {
  return { ...makeSettings(4), guests };
}

function issuesOf(input: unknown): string {
  const result = guildSettingsSchema.safeParse(input);
  return result.success ? '' : describeIssues(result.error);
}

const VISITOR = FICTIONAL_GUESTS[0];
const WANDERER = FICTIONAL_GUESTS[1];

describe('guildSettingsSchema guests', () => {
  it('keeps settings without guests valid', () => {
    const settings = makeSettings(4);
    expect('guests' in settings).toBe(false);
    expect(guildSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it('accepts none, one or two guests, with or without a repo', () => {
    for (const guests of [[], [VISITOR], [WANDERER], [VISITOR, WANDERER]]) {
      expect(issuesOf(withGuests(guests))).toBe('');
    }
    const parsed = guildSettingsSchema.parse(withGuests([VISITOR, WANDERER]));
    expect(parsed.guests).toEqual([VISITOR, WANDERER]);
  });

  it('rejects a third guest', () => {
    const third = { name: 'みっつめ', sessionDir: '~/example-third' };
    expect(issuesOf(withGuests([VISITOR, WANDERER, third]))).toMatch(/at guests/);
  });

  it('rejects an empty name, a name past 12 characters and unknown keys', () => {
    expect(issuesOf(withGuests([{ ...WANDERER, name: '' }]))).toMatch(/guests\[0\]\.name/);
    expect(issuesOf(withGuests([{ ...WANDERER, name: 'あ'.repeat(12) }]))).toBe('');
    expect(issuesOf(withGuests([{ ...WANDERER, name: 'あ'.repeat(13) }]))).toMatch(
      /guests\[0\]\.name/,
    );
    expect(issuesOf(withGuests([{ ...WANDERER, extra: 1 }]))).toMatch(/extra/);
  });

  it('rejects a session dir or repo the collector could not use', () => {
    expect(issuesOf(withGuests([{ ...WANDERER, sessionDir: '~/a/' }]))).toMatch(
      /guests\[0\]\.sessionDir/,
    );
    expect(issuesOf(withGuests([{ ...WANDERER, sessionDir: 'relative' }]))).toMatch(
      /guests\[0\]\.sessionDir/,
    );
    expect(issuesOf(withGuests([{ ...VISITOR, repo: 'no-slash' }]))).toMatch(/guests\[0\]\.repo/);
  });
});

describe('guildSettingsSchema guests against each other and the company', () => {
  it('rejects two guests with the same name or folder', () => {
    const sameName = { ...WANDERER, name: VISITOR.name };
    expect(issuesOf(withGuests([VISITOR, sameName]))).toMatch(
      /name used by another guest\n {2}→ at guests\[1\]\.name/,
    );
    const sameDir = { ...WANDERER, sessionDir: VISITOR.sessionDir };
    expect(issuesOf(withGuests([VISITOR, sameDir]))).toMatch(
      /session dir used by another guest\n {2}→ at guests\[1\]\.sessionDir/,
    );
  });

  it("rejects a guest in a company folder (かなめ's or a department's)", () => {
    const settings = makeSettings(4);
    for (const dir of [settings.commanderSessionDir, settings.departments[2]?.sessionDir ?? '']) {
      expect(issuesOf(withGuests([{ ...WANDERER, sessionDir: dir }]))).toMatch(
        /a company session dir\n {2}→ at guests\[0\]\.sessionDir/,
      );
    }
  });

  it('accepts a guest folder under a company folder (exact match only)', () => {
    const settings = makeSettings(4);
    const below = `${settings.commanderSessionDir}/elsewhere`;
    expect(issuesOf(withGuests([{ ...WANDERER, sessionDir: below }]))).toBe('');
  });

  it('rejects the company repo as a guest repo, whatever the case', () => {
    for (const repo of [FICTIONAL_REPO, FICTIONAL_REPO.toUpperCase()]) {
      expect(issuesOf(withGuests([{ ...VISITOR, repo }]))).toMatch(
        /the company repo\n {2}→ at guests\[0\]\.repo/,
      );
    }
  });

  it('accepts two guests on the same repo of their own', () => {
    const second = { ...WANDERER, repo: VISITOR.repo };
    expect(issuesOf(withGuests([VISITOR, second]))).toBe('');
  });
});
