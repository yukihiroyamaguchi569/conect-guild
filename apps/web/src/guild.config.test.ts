import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BRANCH_PREFIX_RULES,
  DEPARTMENT_LABELS,
  DEPARTMENT_MEMBER,
  departmentMember,
  DONE_WINDOW_MS,
  EVENT_GAP_LIMIT_MS,
  MEMBERS,
  RECENT_REWARD_WINDOW_MS,
  RULE_CHANGE_PATHS,
  STALE_AFTER_MS,
  type DepartmentLabel,
  type MemberId,
} from './guild.config';

describe('guild.config', () => {
  it('keeps the department labels in the fixed order', () => {
    expect(DEPARTMENT_LABELS).toEqual(['経理', '広報', '企画', '総務']);
  });

  it('uses the names the president fixed on 2026-10-12', () => {
    const names = Object.values(MEMBERS).map((m) => [m.role, m.name]);
    expect(Object.fromEntries(names)).toEqual({
      司令塔: 'かなめ',
      経理: 'みのり',
      広報: 'ひびき',
      企画: 'ひらめ',
      総務: 'ささえ',
      社長: 'ゆきひろ',
    });
  });

  it('maps each department label to the member whose role it is', () => {
    for (const label of DEPARTMENT_LABELS) {
      expect(MEMBERS[departmentMember(label)].role).toBe(label);
    }
  });

  it('keys every member by its own id', () => {
    for (const [key, member] of Object.entries(MEMBERS)) expect(member.id).toBe(key);
  });

  it('only routes branch prefixes to known departments', () => {
    for (const rule of BRANCH_PREFIX_RULES) {
      expect(DEPARTMENT_LABELS).toContain(rule.department);
      expect(rule.prefix.length).toBeGreaterThan(0);
    }
  });

  it('sets the time windows from the design', () => {
    expect(DONE_WINDOW_MS).toBe(30 * 60_000);
    expect(RECENT_REWARD_WINDOW_MS).toBe(7 * 24 * 3_600_000);
    expect(STALE_AFTER_MS).toBe(5 * 60_000);
    expect(EVENT_GAP_LIMIT_MS).toBe(7 * 24 * 3_600_000);
  });
});

describe('guild.config from guild.settings.json', () => {
  it('keeps the literal types of the ids; the labels are strings checked when read', () => {
    expectTypeOf<DepartmentLabel>().toEqualTypeOf<string>();
    expectTypeOf<MemberId>().toEqualTypeOf<
      'kaname' | 'minori' | 'hibiki' | 'hirame' | 'sasae' | 'yukihiro'
    >();
  });

  it('keeps the colours and seats of the members', () => {
    expect(
      Object.fromEntries(Object.values(MEMBERS).map((m) => [m.id, [m.color, m.seat]])),
    ).toEqual({
      kaname: ['#e0b040', { col: 16, row: 7 }],
      minori: ['#4caf50', { col: 12, row: 4 }],
      hibiki: ['#e91e63', { col: 20, row: 4 }],
      hirame: ['#2196f3', { col: 11, row: 10 }],
      sasae: ['#9c6b3f', { col: 21, row: 10 }],
      yukihiro: ['#8e44ad', { col: 16, row: 3 }],
    });
  });

  it('stops at a label the settings do not have', () => {
    expect(() => departmentMember('営業')).toThrow(/no member for department/);
  });

  it('maps the departments to the same members as before', () => {
    expect(DEPARTMENT_MEMBER).toEqual({
      経理: 'minori',
      広報: 'hibiki',
      企画: 'hirame',
      総務: 'sasae',
    });
  });

  it('keeps the branch prefix rules in their order', () => {
    expect(BRANCH_PREFIX_RULES.map((r) => `${r.prefix}→${r.department}`)).toEqual([
      'accounting/→経理',
      'docs/accounting-→経理',
      'pr/→広報',
      'docs/pr-→広報',
      'planning/→企画',
      'docs/planning-→企画',
      'general-affairs/→総務',
      'docs/general-affairs-→総務',
    ]);
  });

  it('reads the rule change paths from the settings', () => {
    expect(RULE_CHANGE_PATHS.map((r) => r.match)).toEqual(['exact', 'suffix', 'prefix']);
  });
});
