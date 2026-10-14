import { z } from 'zod';
import type { Snapshot } from '@conect-guild/snapshot';
import { DEPARTMENT_LABELS, departmentMember } from '../guild.config';
import { LEVEL_MEMBERS, memberLevels, memberLevelsSchema } from './levelUp';

/** Bump when the stored shape changes; a stored baseline with another version counts as absent. */
export const BASELINE_SCHEMA_VERSION = 3;

const isoDateTime = z.iso.datetime({ offset: true });
const stateSchema = z.enum(['open', 'closed']);
const issueNumber = z.number().int().positive();

/** FNV-1a (32 bit) of the text as 8 hex digits. Pure. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * FNV-1a of the repository name. The baseline keeps this instead of the name, so it can tell
 * repositories apart (after guild.settings.json points elsewhere) without storing the name. Pure.
 */
export function repoFingerprint(repo: string): string {
  return fnv1a(repo);
}

/**
 * FNV-1a of which member works which department, in the settings' order (Issue #18). The baseline
 * keeps it so a changed mapping (a member moved to another desk, a department added) restarts the
 * levels instead of telling level-ups that nobody earned. No label is stored. Pure.
 */
export function crewFingerprint(
  departments: readonly { readonly label: string; readonly member: string }[],
): string {
  return fnv1a(JSON.stringify(departments.map((d) => [d.label, d.member])));
}

/** The mapping of the settings in use. */
export const CREW_FINGERPRINT = crewFingerprint(
  DEPARTMENT_LABELS.map((label) => ({ label, member: departmentMember(label) })),
);

const fingerprintSchema = z.string().regex(/^[0-9a-f]{8}$/);

/**
 * The diff baseline kept in localStorage. Numbers, states and times only: no titles, labels or
 * branch names, because Issue titles can carry client names. The repository is kept as its
 * fingerprint only. `levels` is each member's level (Issue #19; the version went 2 → 3 with it).
 * `crew` is the fingerprint of the department → member mapping the levels were counted with
 * (Issue #18). It is optional, so a baseline stored before it still parses (as an unknown mapping).
 * Counted with the mapping in use, `levels` must have every member with a level now: one lacking a
 * member is malformed and counts as absent, as before #18.
 */
const baselineSchema = z
  .strictObject({
    schemaVersion: z.literal(BASELINE_SCHEMA_VERSION),
    fetchedAt: isoDateTime,
    repo: fingerprintSchema,
    issues: z.array(
      z.strictObject({ number: issueNumber, state: stateSchema, closedAt: isoDateTime.nullable() }),
    ),
    prs: z.array(
      z.strictObject({ number: issueNumber, state: stateSchema, mergedAt: isoDateTime.nullable() }),
    ),
    levels: memberLevelsSchema,
    crew: fingerprintSchema.optional(),
  })
  .refine(
    ({ levels, crew }) =>
      crew !== CREW_FINGERPRINT || LEVEL_MEMBERS.every((member) => levels[member] !== undefined),
  );

export type Baseline = z.infer<typeof baselineSchema>;

/** Validates a value read from storage. Anything malformed or from another version → null. */
export function parseBaseline(value: unknown): Baseline | null {
  const result = baselineSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function toBaseline(snapshot: Snapshot): Baseline {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    fetchedAt: snapshot.fetchedAt,
    repo: repoFingerprint(snapshot.repo),
    issues: snapshot.issues.map(({ number, state, closedAt }) => ({ number, state, closedAt })),
    prs: snapshot.prs.map(({ number, state, mergedAt }) => ({ number, state, mergedAt })),
    levels: memberLevels(snapshot),
    crew: CREW_FINGERPRINT,
  };
}
