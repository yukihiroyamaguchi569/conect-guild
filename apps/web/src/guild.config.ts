/**
 * Guild settings for the web app: the team's values come from the repository root's
 * guild.settings.json (validated when it is imported); the seats and the time windows the domain
 * uses stay here.
 */
import { z } from 'zod';
import {
  byMember,
  DEPARTMENT_LABELS,
  GUILD_SETTINGS,
  departmentLabelSchema,
  memberIdSchema,
  type BranchPrefixRule,
  type DepartmentLabel,
  type GuildSettings,
  type MemberId,
  type RuleChangePath,
} from '@conect-guild/snapshot/settings';
import { layoutFor } from './render/layouts';
import { seatsFor } from './render/layouts/seats';
import type { GuildLayout, TilePos } from './render/layouts/types';

export {
  DEPARTMENT_LABELS,
  departmentLabelSchema,
  type DepartmentLabel,
  type MemberId,
  type RuleChangePath,
};

/** A cell on the office tile map (32 px tiles, 32 x 18; src/render/map.ts). */
export type { TilePos };

export interface MemberConfig {
  readonly id: MemberId;
  /** Display name. */
  readonly name: string;
  /** Role shown next to the name. */
  readonly role: string;
  /** Accent colour for the name plate and speech bubble. */
  readonly color: string;
  /**
   * Where the member is when at home: the tile under their feet (src/render/map.ts). Department
   * members sit on the chair right behind their desk; render/seating.ts sinks them into it.
   */
  readonly seat: TilePos;
}

/**
 * Shown for a member no department names: never on screen (only the active members are drawn), it
 * keeps MEMBERS a record of every id.
 */
const OFFSTAGE_MEMBER = { name: '-', role: '-', color: '#808080' } as const;

/** What the web app derives from the settings and the office layout (the windows stay constants). */
export interface Guild {
  readonly members: Readonly<Record<MemberId, MemberConfig>>;
  /** Department label → the member who works it. */
  readonly departmentMember: Readonly<Record<DepartmentLabel, MemberId>>;
  readonly branchPrefixRules: readonly BranchPrefixRule[];
  readonly ruleChangePaths: readonly RuleChangePath[];
}

/**
 * The team from the given settings, without reading the module-level GUILD_SETTINGS, so tests can
 * pass made-up settings. The seats come from `layout` (by default the one for the settings' number
 * of departments). The department record is checked against the settings' own labels: a label the
 * settings do not map fails here instead of yielding undefined later.
 */
export function guildFromSettings(
  settings: GuildSettings,
  layout: GuildLayout = layoutFor(settings.departments.length),
): Guild {
  const seats = seatsFor(
    layout,
    settings.departments.map((d) => d.member),
  );
  const labels = settings.departments.map((d) => d.label);
  return {
    members: byMember((id): MemberConfig => {
      const { name, role, color } = settings.members[id] ?? OFFSTAGE_MEMBER;
      return { id, name, role, color, seat: seats[id] };
    }),
    departmentMember: z
      .record(z.enum(labels), memberIdSchema)
      .parse(Object.fromEntries(settings.departments.map((d) => [d.label, d.member]))),
    branchPrefixRules: settings.branchPrefixes,
    ruleChangePaths: settings.ruleChangePaths,
  };
}

const GUILD = guildFromSettings(GUILD_SETTINGS);

export const MEMBERS: Readonly<Record<MemberId, MemberConfig>> = GUILD.members;

/** Department label → the member who works it (see guildFromSettings). */
export const DEPARTMENT_MEMBER: Readonly<Record<DepartmentLabel, MemberId>> =
  GUILD.departmentMember;

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
