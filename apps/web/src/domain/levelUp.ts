import type { Snapshot } from '@conect-guild/snapshot';
import { COMMANDER_ID, memberIdSchema, PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import { z } from 'zod';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_MEMBER,
  LEVEL_MEMBER_IDS,
  type DepartmentLabel,
  type MemberId,
} from '../guild.config';
import { countXp, levelOf, MAX_LEVEL, NO_XP } from './xp';

/**
 * Level-ups (docs/DESIGN.md 4.4 and 4.6, Issue #19): the levels the diff baseline keeps, and who
 * went up since. Pure. The king has no level, so he is never in here.
 */

/** Members who may have a level: every id but the king's. */
const levelMemberSchema = memberIdSchema.exclude([PRESIDENT_ID]);
export type LevelMember = z.infer<typeof levelMemberSchema>;

const isLevelMember = (id: MemberId): id is LevelMember => id !== PRESIDENT_ID;

/** The members with a level now, かなめ first, then the departments' members in their order. */
export const LEVEL_MEMBERS: readonly LevelMember[] = LEVEL_MEMBER_IDS.filter(isLevelMember);

/**
 * Each member's level: numbers only, as the baseline keeps them. Only the members with a desk (and
 * かなめ) are in it, so it may lack one: a member added to the settings later has no level before.
 */
export const memberLevelsSchema = z.partialRecord(
  levelMemberSchema,
  z.number().int().min(1).max(MAX_LEVEL),
);
export type MemberLevels = z.infer<typeof memberLevelsSchema>;

/** The level of each member in LEVEL_MEMBERS from the snapshot's history (domain/xp.ts). */
export function memberLevels(snapshot: Pick<Snapshot, 'issues' | 'history'>): MemberLevels {
  const xp = countXp(snapshot);
  const levelOfMember = (member: LevelMember): number => {
    if (member === COMMANDER_ID) return levelOf(xp.kaname.xp).level;
    const department = departmentOf(member);
    const tally = department === null ? NO_XP : (xp.departments.get(department) ?? NO_XP);
    return levelOf(tally.xp).level;
  };
  const levels: MemberLevels = {};
  for (const member of LEVEL_MEMBERS) levels[member] = levelOfMember(member);
  return levels;
}

export interface LevelUp {
  /** Who acts: null is かなめ (as GuildEvent.department). */
  readonly department: DepartmentLabel | null;
  /** The level reached; two or more at once are told once, with the highest. */
  readonly level: number;
}

/** The department a member works; null for かなめ (or a member the settings give no desk). */
function departmentOf(member: LevelMember): DepartmentLabel | null {
  return DEPARTMENT_LABELS.find((label) => DEPARTMENT_MEMBER[label] === member) ?? null;
}

/**
 * Members whose level is higher than in `before`, in LEVEL_MEMBERS' order. A level that went down
 * (a label moved, an Issue reopened) tells nothing, and neither does a member `before` lacks (newly
 * added to the settings: no fanfare for the level they arrive with).
 */
export function levelUps(before: MemberLevels, after: MemberLevels): LevelUp[] {
  return LEVEL_MEMBERS.flatMap((member) => {
    const was = before[member];
    const level = after[member];
    if (was === undefined || level === undefined || level <= was) return [];
    return [{ department: departmentOf(member), level }];
  });
}
