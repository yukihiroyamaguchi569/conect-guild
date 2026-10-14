import { z } from 'zod';
import { DEPARTMENT_MEMBER_IDS, type GuildSettings } from '@conect-guild/snapshot/settingsSchema';

/**
 * Issue #79: the values `npm run settings:write` reads from stdin. Only the values a team has to
 * choose; the rest (members, ruleChangePaths, extra branch prefixes) is kept from the settings it
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
  /** All four together, in the fixed order: they replace the departments as a whole. */
  departments: z.array(inputDepartmentSchema).length(DEPARTMENT_MEMBER_IDS.length),
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
  };
  /** How many rows of `branchPrefixes` were kept from the starting settings. */
  readonly keptBranchPrefixes: number;
}

/**
 * The members with each department member's role following its new label, but only where the
 * role was the old label (as in guild.settings.json). A role written by hand is kept.
 */
function membersFollowingLabels(
  base: GuildSettings,
  departments: readonly { label: string; member: string }[],
): GuildSettings['members'] {
  const members = { ...base.members };
  base.departments.forEach((before, i) => {
    const label = departments[i]?.label;
    const member = members[before.member];
    if (label !== undefined && member?.role === before.label) {
      members[before.member] = { ...member, role: label };
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
 * sat there (the seats are fixed by member id); everything not in the input stays as it was.
 */
export function mergeSettings(base: GuildSettings, input: SettingsInput): MergedSettings {
  const departments = input.departments.map((d, i) => ({
    label: d.label,
    member: base.departments[i]?.member ?? '',
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
    },
    keptBranchPrefixes: prefixes.kept,
  };
}
