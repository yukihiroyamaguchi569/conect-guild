import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_LABELS,
  GUILD_SETTINGS,
  checkGuildSettings,
  departmentFromBranch,
  guildSettingsSchema,
  isSessionDir,
  type GuildSettingsInput,
} from './settings.ts';

/** A mutable copy of the shipped settings to break one field at a time. */
function settings(): GuildSettingsInput {
  return structuredClone(GUILD_SETTINGS);
}

function departments(): { label: string; member: string; sessionDir: string }[] {
  return GUILD_SETTINGS.departments.map((d) => ({ ...d }));
}

function rejects(input: unknown): boolean {
  return !guildSettingsSchema.safeParse(input).success;
}

describe('guild.settings.ts', () => {
  it('passes the schema as shipped', () => {
    expect(guildSettingsSchema.safeParse(GUILD_SETTINGS).success).toBe(true);
  });

  it('keeps the conect.llc values', () => {
    expect(GUILD_SETTINGS.repo).toBe('yukihiroyamaguchi569/conect-management');
    expect(DEPARTMENT_LABELS).toEqual(['経理', '広報', '企画', '総務']);
    expect(GUILD_SETTINGS.commanderSessionDir).toBe('~/conect-management');
    expect(GUILD_SETTINGS.departments.map((d) => [d.member, d.sessionDir])).toEqual([
      ['minori', '~/conect-management/accounting'],
      ['hibiki', '~/conect-management/pr'],
      ['hirame', '~/conect-management/planning'],
      ['sasae', '~/conect-management/general-affairs'],
    ]);
    expect(GUILD_SETTINGS.ruleChangePaths).toEqual([
      { match: 'exact', path: 'CLAUDE.md' },
      { match: 'suffix', path: '/CLAUDE.md' },
      { match: 'prefix', path: '.claude/agents/' },
    ]);
  });
});

describe('checkGuildSettings', () => {
  it('returns the very same value when valid', () => {
    const input = settings();
    expect(checkGuildSettings(input)).toBe(input);
  });

  it('throws a message naming the file when invalid', () => {
    expect(() => checkGuildSettings({ ...settings(), repo: 'no-slash' })).toThrow(
      /guild\.settings\.local\.ts or guild\.settings\.ts \(whichever is used\) is invalid[\s\S]*repo/,
    );
  });
});

describe('guildSettingsSchema', () => {
  it.each([
    '',
    'owner',
    'owner/name/extra',
    'owner/na me',
    'https://github.com/o/r',
    '../x',
    'owner/..',
    'owner/.',
    '-owner/name',
    'own_er/name',
    'owner-/name',
    '-/name',
    'owner/name\n',
  ])('rejects repo %j', (repo) => {
    expect(rejects({ ...settings(), repo })).toBe(true);
  });

  it.each(['o/r', 'my-org/repo.name_2', 'Owner9/.github', 'a/..x', 'a-b-c/r', 'a--b/r'])(
    'accepts repo %j',
    (repo) => {
      expect(rejects({ ...settings(), repo })).toBe(false);
    },
  );
});

describe('guildSettingsSchema entries', () => {
  it('rejects unknown keys at the top and in entries', () => {
    expect(rejects({ ...settings(), extra: 1 })).toBe(true);
    const [first, ...rest] = departments();
    expect(rejects({ ...settings(), departments: [{ ...first, color: '#000000' }, ...rest] })).toBe(
      true,
    );
  });

  it('requires all six members and no others', () => {
    const five = Object.fromEntries(
      Object.entries(GUILD_SETTINGS.members).filter(([id]) => id !== 'sasae'),
    );
    expect(rejects({ ...settings(), members: five })).toBe(true);
    const extra = {
      ...GUILD_SETTINGS.members,
      neko: { name: 'ねこ', role: '猫', color: '#000000' },
    };
    expect(rejects({ ...settings(), members: extra })).toBe(true);
  });

  it.each([
    { name: '', role: '経理', color: '#4caf50' },
    { name: 'みのり', role: '', color: '#4caf50' },
    { name: 'みのり', role: '経理', color: 'green' },
    { name: 'みのり', role: '経理', color: '#4caf5' },
  ])('rejects member %j', (minori) => {
    expect(rejects({ ...settings(), members: { ...GUILD_SETTINGS.members, minori } })).toBe(true);
  });

  it('accepts other names, roles and colours', () => {
    const minori = { name: 'Alice', role: 'Sales', color: '#ABCDEF' };
    expect(rejects({ ...settings(), members: { ...GUILD_SETTINGS.members, minori } })).toBe(false);
  });

  it('accepts other labels when the branch prefixes follow them', () => {
    const renamed = departments().map((d, i) => ({ ...d, label: `team-${String(i)}` }));
    expect(
      rejects({
        ...settings(),
        departments: renamed,
        branchPrefixes: [{ prefix: 'a/', department: 'team-0' }],
      }),
    ).toBe(false);
  });
});

describe('guildSettingsSchema departments', () => {
  it('requires exactly four departments for now (#18)', () => {
    expect(rejects({ ...settings(), departments: departments().slice(0, 3) })).toBe(true);
    expect(rejects({ ...settings(), departments: [] })).toBe(true);
  });

  it('rejects a department label, member or session dir used twice', () => {
    const twice = (patch: Record<string, string>) =>
      departments().map((d, i) => (i === 1 ? { ...d, ...patch } : d));
    expect(rejects({ ...settings(), departments: twice({ label: '経理' }) })).toBe(true);
    expect(rejects({ ...settings(), departments: twice({ member: 'minori' }) })).toBe(true);
    expect(
      rejects({
        ...settings(),
        departments: twice({ sessionDir: '~/conect-management/accounting' }),
      }),
    ).toBe(true);
    expect(
      rejects({
        ...settings(),
        departments: twice({ sessionDir: GUILD_SETTINGS.commanderSessionDir }),
      }),
    ).toBe(true);
  });

  it.each(['kaname', 'yukihiro', 'neko'])('rejects %s at a department desk', (member) => {
    const changed = departments().map((d, i) => (i === 0 ? { ...d, member } : d));
    expect(rejects({ ...settings(), departments: changed })).toBe(true);
  });

  it('rejects an empty department label', () => {
    const changed = departments().map((d, i) => (i === 0 ? { ...d, label: '' } : d));
    expect(rejects({ ...settings(), departments: changed })).toBe(true);
  });
});

describe('guildSettingsSchema rules and paths', () => {
  it('rejects a branch prefix that is empty or names no department', () => {
    const rule = (prefix: string, department: string) => ({
      ...settings(),
      branchPrefixes: [{ prefix, department }],
    });
    expect(rejects(rule('', '経理'))).toBe(true);
    expect(rejects(rule('sales/', '営業'))).toBe(true);
    expect(rejects(rule('sales/', '経理'))).toBe(false);
    expect(rejects({ ...settings(), branchPrefixes: [] })).toBe(false);
  });

  it('accepts only the three plain comparisons for rule change paths', () => {
    const paths = (ruleChangePaths: unknown) => ({ ...settings(), ruleChangePaths });
    expect(rejects(paths([{ match: 'glob', path: '**/CLAUDE.md' }]))).toBe(true);
    expect(rejects(paths([{ match: 'exact', path: '' }]))).toBe(true);
    expect(rejects(paths([{ match: 'prefix', path: 'rules/', extra: true }]))).toBe(true);
    expect(rejects(paths([]))).toBe(false);
    expect(rejects(paths([{ match: 'suffix', path: '/AGENTS.md' }]))).toBe(false);
  });

  it('rejects a commander session dir the collector could not compare', () => {
    expect(rejects({ ...settings(), commanderSessionDir: '~/conect-management/' })).toBe(true);
    expect(rejects({ ...settings(), commanderSessionDir: '~/conect-management ' })).toBe(true);
  });
});

describe('isSessionDir', () => {
  it.each(['~', '~/conect-management', '~/a/b c', '/Users/me/work', '/w'])('accepts %j', (dir) => {
    expect(isSessionDir(dir)).toBe(true);
  });

  it.each([
    '',
    '/',
    '~/',
    'conect-management',
    './x',
    '~x',
    '~/a/',
    '/a//b',
    '~/a/./b',
    '~/a/../b',
    '/..',
    '~/a ',
    ' ~/a',
    '/a\t',
    '~/a\n',
    '\u3000/a',
    '~/a\nb',
    '/a\rb',
    '~/a\u0000b',
    '/a\u001fb',
    '~/a\u007fb',
    '/a\tb',
  ])('rejects %j', (dir) => {
    expect(isSessionDir(dir)).toBe(false);
  });
});

describe('departmentFromBranch', () => {
  const rules = [
    { prefix: 'docs/pr-', department: '広報' },
    { prefix: 'docs/', department: '総務' },
    { prefix: 'accounting/', department: '経理' },
  ] as const;

  it.each([
    ['docs/pr-release', '広報'],
    ['docs/other', '総務'],
    ['accounting/x', '経理'],
  ] as const)('maps %s to %s with the first rule that matches', (ref, department) => {
    expect(departmentFromBranch(ref, rules)).toBe(department);
  });

  it.each(['main', 'accounting', 'xaccounting/foo', 'DOCS/a', ''])(
    'finds nothing for %j',
    (ref) => {
      expect(departmentFromBranch(ref, rules)).toBeNull();
    },
  );

  it('finds nothing without rules', () => {
    expect(departmentFromBranch('accounting/x', [])).toBeNull();
  });
});
