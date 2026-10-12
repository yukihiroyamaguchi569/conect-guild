import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotSchema, type Snapshot, type SnapshotIssue } from '@conect-guild/snapshot';
import { GUILD_SETTINGS } from '@conect-guild/snapshot/settings';

/**
 * The only data the E2E tests show: the dummy sample (public/snapshot.sample.json, made-up
 * titles). It reaches the page through Playwright's route (fixtures.ts), never through a file:
 * the tests do not touch apps/web/.data, where the collector keeps the real data (docs/DESIGN.md 9).
 */
const SAMPLE_FILE = path.resolve(import.meta.dirname, '..', 'public', 'snapshot.sample.json');

/** The fixed "now" of every test (12:00 in Tokyo). */
export const NOW = Date.parse('2026-10-12T03:00:00.000Z');

/** The sample, pointed at guild.settings.json's repo and fetched at `at`. */
export async function sampleSnapshot(at: number = NOW): Promise<Snapshot> {
  const sample = snapshotSchema.parse(JSON.parse(await readFile(SAMPLE_FILE, 'utf8')));
  const iso = new Date(at).toISOString();
  return {
    ...sample,
    repo: GUILD_SETTINGS.repo,
    fetchedAt: iso,
    sessions:
      sample.sessions.status === 'ok' ? { ...sample.sessions, checkedAt: iso } : sample.sessions,
  };
}

/** Closes the given Issues at `at` (what the collector would see after they were closed). */
export function withClosedIssues(
  snapshot: Snapshot,
  numbers: readonly number[],
  at: number,
): Snapshot {
  const iso = new Date(at).toISOString();
  const close = (issue: SnapshotIssue): SnapshotIssue =>
    numbers.includes(issue.number)
      ? { ...issue, state: 'closed', updatedAt: iso, closedAt: iso }
      : issue;
  return { ...snapshot, issues: snapshot.issues.map(close) };
}
