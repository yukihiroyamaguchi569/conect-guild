import type { DEPARTMENT_MEMBER_IDS, GuildSettings } from './settingsSchema.ts';

/**
 * Test-only settings that do not depend on the repository's guild.settings.json: a fictional
 * company with a chosen number of departments. Imports only the schema's types, so the real
 * settings are never read. Labels, folders and the repository are made up.
 */

type DepartmentMemberId = (typeof DEPARTMENT_MEMBER_IDS)[number];

/** Fictional departments, in the order the builder hands them out. */
const FICTIONAL_DEPARTMENTS = [
  { member: 'minori', label: '錬金', dir: 'alchemy' },
  { member: 'hibiki', label: '鍛冶', dir: 'smithy' },
  { member: 'hirame', label: '占術', dir: 'oracle' },
  { member: 'sasae', label: '交易', dir: 'trade' },
] as const satisfies readonly {
  readonly member: DepartmentMemberId;
  readonly label: string;
  readonly dir: string;
}[];

export const FICTIONAL_REPO = 'example-owner/example-guild';
const FICTIONAL_ROOT = '~/example-guild';

/**
 * Settings with the first `departmentCount` fictional departments, two branch prefixes each, and
 * the given fields replaced. Not parsed here: the schema still requires exactly four departments
 * until Issue #18, and tests for other counts check the schema themselves.
 */
export function makeSettings(
  departmentCount: number,
  overrides: Partial<GuildSettings> = {},
): GuildSettings {
  const max = FICTIONAL_DEPARTMENTS.length;
  if (!Number.isInteger(departmentCount) || departmentCount < 1 || departmentCount > max) {
    throw new RangeError(`departmentCount must be 1..${String(max)}`);
  }
  const chosen = FICTIONAL_DEPARTMENTS.slice(0, departmentCount);
  return {
    repo: FICTIONAL_REPO,
    members: {
      kaname: { name: 'テスト司令', role: '司令塔', color: '#aa8800' },
      minori: { name: 'テスト一', role: '錬金', color: '#118811' },
      hibiki: { name: 'テスト二', role: '鍛冶', color: '#881111' },
      hirame: { name: 'テスト三', role: '占術', color: '#111188' },
      sasae: { name: 'テスト四', role: '交易', color: '#886611' },
      yukihiro: { name: 'テスト王', role: '社長', color: '#661188' },
    },
    commanderSessionDir: FICTIONAL_ROOT,
    departments: chosen.map(({ member, label, dir }) => ({
      label,
      member,
      sessionDir: `${FICTIONAL_ROOT}/${dir}`,
    })),
    branchPrefixes: chosen.flatMap(({ label, dir }) => [
      { prefix: `${dir}/`, department: label },
      { prefix: `docs/${dir}-`, department: label },
    ]),
    ruleChangePaths: [
      { match: 'exact', path: 'CLAUDE.md' },
      { match: 'suffix', path: '/CLAUDE.md' },
    ],
    ...overrides,
  };
}
