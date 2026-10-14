import { describe, expect, it } from 'vitest';
import { makeSettings } from '@conect-guild/snapshot/settings.fixtures';
import { guildFromSettings } from './guild.config';

describe('guildFromSettings (made-up settings, not guild.settings.json)', () => {
  const settings = makeSettings(4);
  const guild = guildFromSettings(settings);

  it('maps each department label to its member', () => {
    expect(guild.departmentMember).toEqual(
      Object.fromEntries(settings.departments.map((d) => [d.label, d.member])),
    );
  });

  it('takes names, roles and colours from the settings and keys members by id', () => {
    for (const [id, member] of Object.entries(guild.members)) {
      expect(member.id).toBe(id);
    }
    expect(guild.members.minori).toMatchObject(settings.members.minori);
    expect(guild.members.yukihiro).toMatchObject(settings.members.yukihiro);
  });

  it('keeps the seats, which do not come from the settings', () => {
    expect(guild.members.kaname.seat).toEqual({ col: 16, row: 7 });
    expect(guild.members.yukihiro.seat).toEqual({ col: 16, row: 3 });
  });

  it('passes the branch prefix rules and rule change paths through in order', () => {
    expect(guild.branchPrefixRules).toEqual(settings.branchPrefixes);
    expect(guild.ruleChangePaths).toEqual(settings.ruleChangePaths);
  });

  it('gives a member for each department label of the settings, none for others', () => {
    for (const d of settings.departments) {
      expect(guild.members[guild.departmentMember[d.label] ?? 'kaname'].role).toBe(d.label);
    }
    expect(guild.departmentMember['経理']).toBeUndefined();
  });
});
