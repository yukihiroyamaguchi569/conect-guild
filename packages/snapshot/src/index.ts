import { z } from 'zod';
import { DEPARTMENT_LABELS, departmentLabelSchema } from './settings.ts';

/** Bump when the snapshot shape changes; the web app refuses other versions. */
export const SNAPSHOT_SCHEMA_VERSION = 3;

const isoDateTime = z.iso.datetime({ offset: true });

export const snapshotIssueSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  labels: z.array(z.string()),
  state: z.enum(['open', 'closed']),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  closedAt: isoDateTime.nullable(),
});

export const snapshotPrSchema = z.strictObject({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  mergedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  headRef: z.string(),
  linkedIssues: z.array(z.number().int().positive()),
  // Paths only, and only for open PRs; closed PRs carry [].
  changedFiles: z.array(z.string()),
});

/**
 * Departments that have a session of their own (guild.settings.json). かなめ (the 司令塔) is `null`.
 */
export const SESSION_DEPARTMENTS = DEPARTMENT_LABELS;

/**
 * What a company session is doing right now, read from MulmoTerminal (docs/DESIGN.md 4.7):
 * awaiting-permission (asks to use a tool), working (in a turn), resting (finished a turn),
 * idle (nothing recorded).
 */
export const sessionStateSchema = z.enum(['awaiting-permission', 'working', 'resting', 'idle']);

export const snapshotSessionSchema = z.strictObject({
  department: z.enum(SESSION_DEPARTMENTS).nullable(),
  state: sessionStateSchema,
});

/**
 * The company sessions. Only the department and the state: no MulmoTerminal ids, no paths.
 * `checkedAt` is when the collector read them; it moves every few seconds, unlike `fetchedAt`.
 */
export const snapshotSessionsSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ok'),
    checkedAt: isoDateTime,
    // Exactly one entry for かなめ and each department: the collector always writes all of them.
    members: z
      .array(snapshotSessionSchema)
      .length(SESSION_DEPARTMENTS.length + 1)
      .refine(
        (members) => new Set(members.map((m) => m.department)).size === members.length,
        'one entry per department',
      ),
  }),
  z.strictObject({ status: z.literal('unavailable'), checkedAt: isoDateTime }),
]);

const issueNumber = z.number().int().positive();

function hasUniqueNumbers(items: readonly { readonly number: number }[]): boolean {
  return new Set(items.map((item) => item.number)).size === items.length;
}

/** True when `labels` are distinct and in the fixed order of DEPARTMENT_LABELS. */
function inFixedOrder(labels: readonly string[]): boolean {
  const positions = labels.map((label) => DEPARTMENT_LABELS.findIndex((d) => d === label));
  return positions.every((position, i) => i === 0 || position > (positions[i - 1] ?? -1));
}

/** An Issue closed as completed. Only its department labels, distinct and in the fixed order. */
export const historyIssueSchema = z.strictObject({
  number: issueNumber,
  departments: z.array(departmentLabelSchema).refine(inFixedOrder, 'distinct, in the fixed order'),
});

/**
 * A merged PR. `branchDepartment` is the department the collector read from the branch name
 * prefix; the branch name itself is not kept.
 */
export const historyPrSchema = z.strictObject({
  number: issueNumber,
  linkedIssues: z.array(issueNumber),
  branchDepartment: departmentLabelSchema.nullable(),
});

/**
 * The whole history of the repository, for the cumulative experience and levels
 * (docs/DESIGN.md 4.6). Numbers and departments only: no titles, no other labels, no branch
 * names, no times. Counted afresh from GitHub on every fetch.
 */
export const snapshotHistorySchema = z
  .strictObject({
    /** Every Issue ever opened (open and closed, whatever the reason): かなめ's scrolls. */
    openedIssueCount: z.number().int().nonnegative(),
    /** Issues closed as completed (not as not planned or duplicate). */
    completedIssues: z.array(historyIssueSchema).refine(hasUniqueNumbers, 'unique numbers'),
    mergedPrs: z.array(historyPrSchema).refine(hasUniqueNumbers, 'unique numbers'),
  })
  .refine(
    (history) => history.completedIssues.length <= history.openedIssueCount,
    'more completed Issues than opened ones',
  );

/** The GitHub part, written at most once a minute. `fetchedAt` is the time of that fetch. */
export const githubPartSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  fetchedAt: isoDateTime,
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  issues: z.array(snapshotIssueSchema),
  prs: z.array(snapshotPrSchema),
  history: snapshotHistorySchema,
});

export const snapshotSchema = z.strictObject({
  ...githubPartSchema.shape,
  sessions: snapshotSessionsSchema,
});

/**
 * Why the collector's last try failed (packages/collector/src/errors.ts): `gh` failed (not logged
 * in, no access, network), what it read did not validate, the file could not be written, or
 * something unexpected. The kind only: never a message, a title or a path.
 */
export const collectorFailureKindSchema = z.enum([
  'gh-failed',
  'validation-failed',
  'write-failed',
  'unexpected',
]);

/**
 * apps/web/.data/collector-status.json (Issue #74): how the collector's last try at GitHub went,
 * so the page can tell "never collected" from "the collector fails". `attemptedAt` is when it
 * tried. No repository name, title, body or path.
 */
/** True when the numbers are in ascending order with no repeats. */
function strictlyAscending(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value > (values[i - 1] ?? value));
}

/**
 * Issue #85: the positions in `departments` of the settings whose label the repository does not
 * have (the last check that got the labels). Positions only, never the label names. Left out when
 * every label is there or nothing is known yet (the check has not got the labels).
 */
export const missingLabelsSchema = z
  .array(
    z
      .number()
      .int()
      .nonnegative()
      .max(DEPARTMENT_LABELS.length - 1),
  )
  .min(1)
  .refine(strictlyAscending, 'ascending, no repeats');

const departmentPositionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(DEPARTMENT_LABELS.length - 1);

/**
 * Issue #94: the departments whose prefix's merged PRs keep tying to another department's Issues
 * (packages/snapshot/src/mixup.ts), from the last good fetch. Positions only, no label names or
 * counts. One `to` per `from`, in ascending `from`. Left out when there is none.
 */
export const suspectedMixupsSchema = z
  .array(
    z
      .strictObject({ from: departmentPositionSchema, to: departmentPositionSchema })
      .refine((m) => m.from !== m.to, 'from and to differ'),
  )
  .min(1)
  .refine((mixups) => strictlyAscending(mixups.map((m) => m.from)), 'ascending from, no repeats');

export const collectorStatusSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    attemptedAt: isoDateTime,
    missingLabels: missingLabelsSchema.optional(),
    suspectedMixups: suspectedMixupsSchema.optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    attemptedAt: isoDateTime,
    kind: collectorFailureKindSchema,
    missingLabels: missingLabelsSchema.optional(),
    suspectedMixups: suspectedMixupsSchema.optional(),
  }),
]);

export type SnapshotIssue = z.infer<typeof snapshotIssueSchema>;
export type SnapshotPr = z.infer<typeof snapshotPrSchema>;
export type SessionDepartment = (typeof SESSION_DEPARTMENTS)[number];
export type SessionState = z.infer<typeof sessionStateSchema>;
export type SnapshotSession = z.infer<typeof snapshotSessionSchema>;
export type SnapshotSessions = z.infer<typeof snapshotSessionsSchema>;
export type HistoryIssue = z.infer<typeof historyIssueSchema>;
export type HistoryPr = z.infer<typeof historyPrSchema>;
export type SnapshotHistory = z.infer<typeof snapshotHistorySchema>;
export type GithubPart = z.infer<typeof githubPartSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type CollectorFailureKind = z.infer<typeof collectorFailureKindSchema>;
export type CollectorStatus = z.infer<typeof collectorStatusSchema>;
