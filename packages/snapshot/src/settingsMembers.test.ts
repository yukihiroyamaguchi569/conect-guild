import { describe, expect, it } from 'vitest';
import { makeSettings } from './settings.fixtures.test-util.ts';
import {
  activeMemberIds,
  guildSettingsSchema,
  levelMemberIds,
  SUPPORTED_DEPARTMENT_COUNTS,
  type GuildSettings,
  type MemberId,
} from './settingsSchema.ts';

/** The schema's messages for `settings`, each with its path. */
function problems(settings: unknown): string[] {
  const result = guildSettingsSchema.safeParse(settings);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

function without(settings: GuildSettings, id: MemberId): GuildSettings {
  const members = Object.fromEntries(
    Object.entries(settings.members).filter(([key]) => key !== id),
  );
  return { ...settings, members };
}

describe('guildSettingsSchema members (Issue #18)', () => {
  it.each(['kaname', 'yukihiro', 'minori', 'sasae'] as const)('requires %s', (id) => {
    expect(problems(without(makeSettings(4), id))).toEqual([`members.${id}: missing`]);
  });

  it('accepts the members on stage only', () => {
    expect(problems(makeSettings(4))).toEqual([]);
  });

  it('still rejects an unknown member id', () => {
    const settings = makeSettings(4);
    const extra = { ...settings, members: { ...settings.members, neko: settings.members.kaname } };
    expect(problems(extra)).not.toEqual([]);
  });
});

describe('guildSettingsSchema department counts (Issue #18)', () => {
  it('supports four departments for now', () => {
    expect(SUPPORTED_DEPARTMENT_COUNTS).toEqual([4]);
  });

  it.each([1, 2, 3])('rejects %i departments, naming the supported counts and #18', (count) => {
    expect(problems(makeSettings(count))).toEqual(['departments: 4 departments (#18)']);
  });

  it('rejects no department', () => {
    expect(problems({ ...makeSettings(4), departments: [], branchPrefixes: [] })).toEqual([
      'departments: 4 departments (#18)',
    ]);
  });
});

describe('activeMemberIds and levelMemberIds', () => {
  it('put かなめ first, the departments in their order, and the king last (active only)', () => {
    const settings = makeSettings(4);
    expect(activeMemberIds(settings)).toEqual([
      'kaname',
      'minori',
      'hibiki',
      'hirame',
      'sasae',
      'yukihiro',
    ]);
    expect(levelMemberIds(settings)).toEqual(['kaname', 'minori', 'hibiki', 'hirame', 'sasae']);
  });

  it('follow the departments, not the id order', () => {
    const settings = makeSettings(2);
    const [a, b] = settings.departments;
    if (a === undefined || b === undefined) throw new Error('two departments expected');
    const swapped = { ...settings, departments: [b, a] };
    expect(activeMemberIds(swapped)).toEqual(['kaname', 'hibiki', 'minori', 'yukihiro']);
    expect(levelMemberIds(swapped)).toEqual(['kaname', 'hibiki', 'minori']);
  });
});
