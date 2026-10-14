import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type GuestGithubPart,
  type GuestRecentItem,
  type SessionState,
  type Snapshot,
} from '@conect-guild/snapshot';
import { checkGuildSettings } from '@conect-guild/snapshot/settingsSchema';

/**
 * Issue #108: the fictional snapshot of the guests' E2E project (playwright.config.ts), whose dev
 * server reads e2e/settings/guests.json. Made-up titles only; served through Playwright's route,
 * never from apps/web/.data.
 */

export const GUESTS_SETTINGS = checkGuildSettings(
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'settings', 'guests.json'), 'utf8')),
);

const at = (ms: number): string => new Date(ms).toISOString();

/** The open items of the first guest: four, so the board lists three and 「ほか 1 件」. */
export const FIRST_GUEST_OPEN = [
  { number: 15, title: '店の看板を描き直す', isPr: true },
  { number: 14, title: '薬草の在庫表を作る', isPr: false },
  { number: 12, title: '回復薬の値札をそろえる', isPr: false },
  { number: 9, title: '常連さんの名簿を作る', isPr: false },
] as const;

export const SECOND_GUEST_OPEN = [
  { number: 3, title: '北の山道を地図に足す', isPr: true },
] as const;

function part(
  repo: string,
  open: readonly { number: number; title: string; isPr: boolean }[],
  recent: readonly GuestRecentItem[],
  now: number,
): GuestGithubPart {
  return {
    repo,
    fetchedAt: at(now),
    // Newest updated first, as the collector writes them.
    open: open.map((item, i) => ({
      ...item,
      createdAt: at(now - 86_400_000),
      updatedAt: at(now - (i + 1) * 60_000),
    })),
    recent: [...recent],
  };
}

export interface GuestsSnapshotOptions {
  readonly now: number;
  readonly states: readonly [SessionState, SessionState];
  /** Finished items of the first guest, newest first. */
  readonly recent?: readonly GuestRecentItem[];
}

/** Four fictional departments with an open quest each, and the two fictional guests. */
export function guestsSnapshot(options: GuestsSnapshotOptions): Snapshot {
  const { now, states } = options;
  const [first, second] = GUESTS_SETTINGS.guests ?? [];
  const labels = GUESTS_SETTINGS.departments.map((d) => d.label);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: at(now),
    repo: GUESTS_SETTINGS.repo,
    issues: labels.map((label, i) => ({
      number: 201 + i,
      title: `架空のクエスト ${String(i + 1)}`,
      labels: [label],
      state: 'open',
      createdAt: at(now - 3_600_000),
      updatedAt: at(now - 3_600_000),
      closedAt: null,
    })),
    prs: [],
    history: { openedIssueCount: labels.length, completedIssues: [], mergedPrs: [] },
    sessions: {
      status: 'ok',
      checkedAt: at(now),
      members: [null, ...labels].map((department) => ({ department, state: 'idle' })),
      guests: [...states],
    },
    guests: [
      part(first?.repo ?? '', FIRST_GUEST_OPEN, options.recent ?? [], now),
      part(second?.repo ?? '', SECOND_GUEST_OPEN, [], now),
    ],
  };
}
