import { z } from 'zod';
import {
  DEPARTMENT_MEMBER_IDS,
  SUPPORTED_DEPARTMENT_COUNTS,
  type GuildSettings,
} from '@conect-guild/snapshot/settingsSchema';

/**
 * Issue #79: the values `npm run settings:write` reads from stdin. Only the values a team has to
 * choose; the rest (members, ruleChangePaths, extra branch prefixes, guests) is kept from the settings it
 * starts from. Each value is checked again with the settings schema once merged.
 */
const inputDepartmentSchema = z.strictObject({
  label: z.string(),
  sessionDir: z.string(),
  /** The branch name prefix of the department, e.g. `accounting/`. */
  prefix: z.string().min(1),
});

export const settingsInputSchema = z.strictObject({
  repo: z.string(),
  commanderSessionDir: z.string(),
  /**
   * All of them together, in the fixed order: they replace the departments as a whole. As many
   * as the office has a layout for (Issue #18).
   */
  departments: z
    .array(inputDepartmentSchema)
    .refine(
      (departments) => SUPPORTED_DEPARTMENT_COUNTS.includes(departments.length),
      `${SUPPORTED_DEPARTMENT_COUNTS.join(' or ')} departments (#18)`,
    ),
});
export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** The settings to write, before they are checked against the schema. */
export interface MergedSettings {
  readonly raw: {
    readonly repo: string;
    readonly members: GuildSettings['members'];
    readonly commanderSessionDir: string;
    readonly departments: readonly { label: string; member: string; sessionDir: string }[];
    readonly branchPrefixes: readonly { prefix: string; department: string }[];
    readonly ruleChangePaths: GuildSettings['ruleChangePaths'];
    /** Issue #108: kept as they were; the schema checks them against the new company values. */
    readonly guests?: GuildSettings['guests'];
  };
  /** How many rows of `branchPrefixes` were kept from the starting settings. */
  readonly keptBranchPrefixes: number;
}

/**
 * The member at each of `count` positions: the one the starting settings have there (the seats
 * are fixed by member id), and for a position they do not have, the next member of the pool
 * (DEPARTMENT_MEMBER_IDS) that no kept position uses.
 */
function membersByPosition(base: GuildSettings, count: number): string[] {
  const kept: string[] = base.departments.slice(0, count).map((d) => d.member);
  const free = DEPARTMENT_MEMBER_IDS.filter((id) => !kept.includes(id));
  return Array.from({ length: count }, (_, i) => kept[i] ?? free[i - kept.length] ?? '');
}

/**
 * The members with each department member's role following its new label, but only where the
 * role was the old label (as in guild.settings.json). A role written by hand is kept. A member
 * that had no department in the starting settings takes its new label: its role named none of
 * them. A member the starting settings do not have stays missing (the schema then names it).
 */
function membersFollowingLabels(
  base: GuildSettings,
  departments: readonly { label: string; member: string }[],
): GuildSettings['members'] {
  const members = { ...base.members };
  departments.forEach(({ label, member: id }, i) => {
    const before = base.departments[i];
    const parsed = DEPARTMENT_MEMBER_IDS.find((known) => known === id);
    const member = parsed === undefined ? undefined : members[parsed];
    if (parsed === undefined || member === undefined) return;
    if (before === undefined || member.role === before.label) {
      members[parsed] = { ...member, role: label };
    }
  });
  return members;
}

/**
 * The branch prefixes: one row per department from the input, then the starting rows that still
 * name a department and whose prefix is not one of the input's (say `docs/accounting-`).
 */
function branchPrefixesOf(
  base: GuildSettings,
  input: SettingsInput,
): { rows: { prefix: string; department: string }[]; kept: number } {
  const fromInput = input.departments.map((d) => ({ prefix: d.prefix, department: d.label }));
  const labels = new Set(input.departments.map((d) => d.label));
  const prefixes = new Set(fromInput.map((row) => row.prefix));
  const kept = base.branchPrefixes
    .filter((row) => labels.has(row.department) && !prefixes.has(row.prefix))
    .map((row) => ({ prefix: row.prefix, department: row.department }));
  return { rows: [...fromInput, ...kept], kept: kept.length };
}

/**
 * The input laid over the starting settings. The department at position i keeps the member that
 * sat there (the seats are fixed by member id), a new position takes a member no department uses
 * (membersByPosition); everything not in the input stays as it was.
 */
export function mergeSettings(base: GuildSettings, input: SettingsInput): MergedSettings {
  const members = membersByPosition(base, input.departments.length);
  const departments = input.departments.map((d, i) => ({
    label: d.label,
    member: members[i] ?? '',
    sessionDir: d.sessionDir,
  }));
  const prefixes = branchPrefixesOf(base, input);
  return {
    raw: {
      repo: input.repo,
      members: membersFollowingLabels(base, departments),
      commanderSessionDir: input.commanderSessionDir,
      departments,
      branchPrefixes: prefixes.rows,
      ruleChangePaths: base.ruleChangePaths,
      ...(base.guests === undefined ? {} : { guests: base.guests }),
    },
    keptBranchPrefixes: prefixes.kept,
  };
}
