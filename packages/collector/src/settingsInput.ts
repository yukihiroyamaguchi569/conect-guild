import { z } from 'zod';
import {
  DEPARTMENT_MEMBER_IDS,
  SUPPORTED_DEPARTMENT_COUNTS,
  type DepartmentMemberId,
  type GuildSettings,
} from '@conect-guild/snapshot/settingsSchema';

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

/**
 * Issue #118: a guest. `repo` left out: suggested from the folder's git origin; null: none.
 */
const inputGuestSchema = z.strictObject({
  name: z.string(),
  sessionDir: z.string(),
  repo: z.string().nullable().optional(),
});
export type InputGuest = z.infer<typeof inputGuestSchema>;

const COMPANY_KEYS = ['repo', 'commanderSessionDir', 'departments'] as const;

export const settingsInputSchema = z
  .strictObject({
    repo: z.string().optional(),
    commanderSessionDir: z.string().optional(),
    /**
     * All of them together, in the fixed order: they replace the departments as a whole. As many
     * as the office has a layout for (Issue #18).
     */
    departments: z
      .array(inputDepartmentSchema)
      .refine(
        (departments) => SUPPORTED_DEPARTMENT_COUNTS.includes(departments.length),
        `${SUPPORTED_DEPARTMENT_COUNTS.join(' or ')} departments (#18)`,
      )
      .optional(),
    /**
     * Issue #118: all of them together, replacing the guests as a whole (empty removes them). Left
     * out, the starting settings' guests are kept.
     */
    guests: z.array(inputGuestSchema).optional(),
  })
  .superRefine((input, ctx) => {
    // The company values come together or not at all (a guests-only input keeps them).
    const given = COMPANY_KEYS.filter((key) => input[key] !== undefined);
    if (given.length === 0 || given.length === COMPANY_KEYS.length) return;
    for (const key of COMPANY_KEYS.filter((k) => input[k] === undefined)) {
      ctx.addIssue({ code: 'custom', path: [key], message: `required with ${given.join(', ')}` });
    }
  });
export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** The company values of the input. */
export interface CompanyInput {
  readonly repo: string;
  readonly commanderSessionDir: string;
  readonly departments: readonly z.infer<typeof inputDepartmentSchema>[];
}

/** The input's company values, or null for an input without them (guests only, or nothing). */
export function companyOf(input: SettingsInput): CompanyInput | null {
  const { repo, commanderSessionDir, departments } = input;
  if (repo === undefined || commanderSessionDir === undefined || departments === undefined) {
    return null;
  }
  return { repo, commanderSessionDir, departments };
}

/** The settings to write, before they are checked against the schema. */
export interface MergedSettings {
  readonly raw: {
    readonly repo: string;
    readonly members: GuildSettings['members'];
    readonly commanderSessionDir: string;
    readonly departments: readonly { label: string; member: string; sessionDir: string }[];
    readonly branchPrefixes: readonly { prefix: string; department: string }[];
    readonly ruleChangePaths: GuildSettings['ruleChangePaths'];
    /**
     * Issue #108: kept as they were unless the input has guests (Issue #118); the schema checks
     * them against the company values.
     */
    readonly guests?: readonly { name: string; sessionDir: string; repo?: string }[];
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
 * The names and colours the president chose for the members of the fifth and sixth departments
 * (Issue #18, 2026-10-14). guild.settings.json has four departments and so neither of them: a
 * fifth or sixth department starting from it gets them, with its label as the role.
 */
const NEW_MEMBERS: Readonly<Partial<Record<DepartmentMemberId, { name: string; color: string }>>> =
  {
    takumi: { name: 'たくみ', color: '#00897b' },
    musubi: { name: 'むすび', color: '#ff7043' },
  };

/**
 * The members with each department member's role following its new label, but only where the
 * role was the old label (as in guild.settings.json). A role written by hand is kept. A member
 * that had no department in the starting settings takes its new label: its role named none of
 * them. A member the starting settings do not have is added from NEW_MEMBERS when it is there,
 * else stays missing (the schema then names it).
 */
function membersFollowingLabels(
  base: GuildSettings,
  departments: readonly { label: string; member: string }[],
): GuildSettings['members'] {
  const members = { ...base.members };
  departments.forEach(({ label, member: id }, i) => {
    const before = base.departments[i];
    const parsed = DEPARTMENT_MEMBER_IDS.find((known) => known === id);
    if (parsed === undefined) return;
    const member = members[parsed];
    if (member === undefined) {
      const added = NEW_MEMBERS[parsed];
      if (added !== undefined) members[parsed] = { ...added, role: label };
      return;
    }
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
  input: CompanyInput,
): { rows: { prefix: string; department: string }[]; kept: number } {
  const fromInput = input.departments.map((d) => ({ prefix: d.prefix, department: d.label }));
  const labels = new Set(input.departments.map((d) => d.label));
  const prefixes = new Set(fromInput.map((row) => row.prefix));
  const kept = base.branchPrefixes
    .filter((row) => labels.has(row.department) && !prefixes.has(row.prefix))
    .map((row) => ({ prefix: row.prefix, department: row.department }));
  return { rows: [...fromInput, ...kept], kept: kept.length };
}

function companyRaw(base: GuildSettings, input: CompanyInput) {
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
    },
    kept: prefixes.kept,
  };
}

/** The starting settings' company values as they are (an input without them, Issue #118). */
function keptCompanyRaw(base: GuildSettings) {
  return {
    raw: {
      repo: base.repo,
      members: base.members,
      commanderSessionDir: base.commanderSessionDir,
      departments: base.departments,
      branchPrefixes: base.branchPrefixes,
    },
    kept: base.branchPrefixes.length,
  };
}

type MergedGuests = MergedSettings['raw']['guests'];

/** The input's guests when given (none for an empty list), else the starting ones. */
function guestsToWrite(base: GuildSettings, guests: MergedGuests): MergedGuests {
  if (guests === undefined) return base.guests;
  return guests.length === 0 ? undefined : guests;
}

/**
 * The input laid over the starting settings. The department at position i keeps the member that
 * sat there (the seats are fixed by member id), a new position takes a member no department uses
 * (membersByPosition); everything not in the input stays as it was. `guests` (the input's, with
 * their repos resolved; Issue #118) replace the starting ones when given; an empty list removes
 * the key.
 */
export function mergeSettings(
  base: GuildSettings,
  input: CompanyInput | null,
  guests?: MergedGuests,
): MergedSettings {
  const company = input === null ? keptCompanyRaw(base) : companyRaw(base, input);
  const chosen = guestsToWrite(base, guests);
  return {
    raw: {
      ...company.raw,
      ruleChangePaths: base.ruleChangePaths,
      ...(chosen === undefined ? {} : { guests: chosen }),
    },
    keptBranchPrefixes: company.kept,
  };
}
