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
