import { z } from 'zod';
import type { Snapshot } from '@conect-guild/snapshot';
import { memberLevels, memberLevelsSchema } from './levelUp';

/** Bump when the stored shape changes; a stored baseline with another version counts as absent. */
export const BASELINE_SCHEMA_VERSION = 3;

const isoDateTime = z.iso.datetime({ offset: true });
const stateSchema = z.enum(['open', 'closed']);
const issueNumber = z.number().int().positive();

/**
 * FNV-1a (32 bit) of the repository name as 8 hex digits. The baseline keeps this instead of the
 * name, so it can tell repositories apart (after guild.settings.json points elsewhere) without
 * storing the name. Pure.
 */
export function repoFingerprint(repo: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(repo)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The diff baseline kept in localStorage. Numbers, states and times only: no titles, labels or
 * branch names, because Issue titles can carry client names. The repository is kept as its
 * fingerprint only. `levels` is each member's level (Issue #19; the version went 2 → 3 with it).
 */
const baselineSchema = z.strictObject({
  schemaVersion: z.literal(BASELINE_SCHEMA_VERSION),
  fetchedAt: isoDateTime,
  repo: z.string().regex(/^[0-9a-f]{8}$/),
  issues: z.array(
    z.strictObject({ number: issueNumber, state: stateSchema, closedAt: isoDateTime.nullable() }),
  ),
  prs: z.array(
    z.strictObject({ number: issueNumber, state: stateSchema, mergedAt: isoDateTime.nullable() }),
  ),
  levels: memberLevelsSchema,
});

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
  };
}
