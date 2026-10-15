import type { Snapshot } from '@conect-guild/snapshot';

/**
 * The king's quests (Issue #141): the open Issues with the president's label, which the collector
 * keeps apart from `issues` (snapshot `president`), so no department or reception gets them. Pure.
 */

export interface KingQuest {
  readonly number: number;
  readonly title: string;
}

/**
 * The king's quests, the most recently updated first. None when the settings have no `president`
 * (`enabled` false; a snapshot written before the label was taken out of them) or the snapshot
 * has none (an older collector).
 */
export function kingQuestsOf(president: Snapshot['president'], enabled: boolean): KingQuest[] {
  if (!enabled || president === undefined) return [];
  return president.issues
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(({ number, title }) => ({ number, title }));
}

/**
 * The numbers of the king's quests the diff baseline keeps (Issue #142); undefined when they are
 * not known (no `president` in the settings, or none in the snapshot), so nothing is told then.
 */
export function kingQuestNumbers(
  president: Snapshot['president'],
  enabled: boolean,
): number[] | undefined {
  if (!enabled || president === undefined) return undefined;
  return president.issues.map((issue) => issue.number).toSorted((a, b) => a - b);
}

export interface KingQuestChanges {
  /** Numbers in `after` but not in `before`, ascending. */
  readonly opened: readonly number[];
  /** Numbers in `before` but not in `after`, ascending. */
  readonly cleared: readonly number[];
}

/**
 * Which of the king's quests appeared and which went away between two baselines (Issue #142). The
 * snapshot keeps open ones only, so a quest that went away was closed (or lost the label: also told
 * as cleared). Nothing when either side is unknown (the first baseline with them, or none).
 */
export function kingQuestChanges(
  before: readonly number[] | undefined,
  after: readonly number[] | undefined,
): KingQuestChanges {
  if (before === undefined || after === undefined) return { opened: [], cleared: [] };
  const was = new Set(before);
  const now = new Set(after);
  const ascending = (a: number, b: number) => a - b;
  return {
    opened: after.filter((n) => !was.has(n)).toSorted(ascending),
    cleared: before.filter((n) => !now.has(n)).toSorted(ascending),
  };
}
