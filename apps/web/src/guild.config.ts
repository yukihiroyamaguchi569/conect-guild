/**
 * Guild settings for the web app: the team's values come from the repository root's
 * guild.settings.json (validated when it is imported), derived by guildFromSettings.ts with the
 * office layout for its number of departments (render/layouts, which gives the seats); the time
 * windows the domain uses stay here.
 */
import {
  ACTIVE_MEMBER_IDS,
  DEPARTMENT_LABELS,
  LEVEL_MEMBER_IDS,
  GUILD_SETTINGS,
  departmentLabelSchema,
  type BranchPrefixRule,
  type DepartmentLabel,
  type MemberId,
  type RuleChangePath,
} from '@conect-guild/snapshot/settings';
import { guildFromSettings, type MemberConfig } from './guildFromSettings';
import { SELECTED_LAYOUT } from './render/layouts';

export {
  ACTIVE_MEMBER_IDS,
  DEPARTMENT_LABELS,
  LEVEL_MEMBER_IDS,
  departmentLabelSchema,
  type DepartmentLabel,
  type MemberId,
  type RuleChangePath,
};
export { type Guild, type MemberConfig, type TilePos } from './guildFromSettings';

const GUILD = guildFromSettings(GUILD_SETTINGS, SELECTED_LAYOUT);

export const MEMBERS: Readonly<Record<MemberId, MemberConfig>> = GUILD.members;

/** Department label → the member who works it (see guildFromSettings). */
export const DEPARTMENT_MEMBER: Readonly<Record<DepartmentLabel, MemberId>> =
  GUILD.departmentMember;

/** The departments' members in the settings' order: `departments[i]` sits at desk i. */
export const DEPARTMENT_MEMBERS: readonly MemberId[] = GUILD_SETTINGS.departments.map(
  (d) => d.member,
);

/**
 * The member who works a department. Labels come from the settings, so they are plain strings to
 * the type checker; every label has a member (checked above), and any other text is a bug.
 */
export function departmentMember(label: DepartmentLabel): MemberId {
  const member = DEPARTMENT_MEMBER[label];
  if (member === undefined) throw new Error(`no member for department ${label}`);
  return member;
}

/**
 * Branch name prefix → department, used only when a PR links no labelled Issue.
 * Checked top to bottom; the first rule whose prefix the branch starts with wins.
 */
export const BRANCH_PREFIX_RULES: readonly BranchPrefixRule[] = GUILD.branchPrefixRules;

/** Paths whose change needs the president's merge (see domain/party.ts isRuleChangePath). */
export const RULE_CHANGE_PATHS: readonly RuleChangePath[] = GUILD.ruleChangePaths;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** A member counts as done when one of their Issues closed within this window. */
export const DONE_WINDOW_MS = 30 * MINUTE_MS;
/** "Recent rewards" counts PRs merged within this window (matches the collector's range). */
export const RECENT_REWARD_WINDOW_MS = 7 * DAY_MS;
/** A snapshot older than this gets the "information is old" mark. */
export const STALE_AFTER_MS = 5 * MINUTE_MS;
/**
 * Session states older than this are ignored (the collector reads them every 5 seconds), so a
 * stopped collector does not leave 許可待ち or いま作業中 on screen.
 */
export const SESSION_STALE_AFTER_MS = 30_000;
/** A gap between baselines longer than this may have lost events (the collector keeps 7 days). */
export const EVENT_GAP_LIMIT_MS = 7 * DAY_MS;
