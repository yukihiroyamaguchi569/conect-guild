import { shallowRef, type Ref } from 'vue';
import { z } from 'zod';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import { isNearQuest } from '../domain/deadline';
import type { BoardGroup } from './guildView';

/** localStorage key of the board's filter (Issue #174): near quests only or all, nothing else. */
export const BOARD_FILTER_STORAGE_KEY = 'conect-guild:board-filter';

const filterSchema = z.strictObject({ show: z.enum(['near', 'all']) });

export type BoardFilter = z.infer<typeof filterSchema>['show'];

/** The stored filter; near when it is missing, broken or unreadable. */
export function loadBoardFilter(storage: KeyValueStore): BoardFilter {
  const stored = storage.read(BOARD_FILTER_STORAGE_KEY, filterSchema);
  return stored.ok ? stored.value.show : 'near';
}

/** Saves the filter; a failure only means it is not kept for the next visit. */
export function saveBoardFilter(storage: KeyValueStore, show: BoardFilter): boolean {
  return storage.write(BOARD_FILTER_STORAGE_KEY, {
    show,
  } satisfies z.infer<typeof filterSchema>).ok;
}

export interface FilteredBoard {
  readonly groups: readonly BoardGroup[];
  /** Quests left out for a date ahead (deadline or day to do it; 「ほか N 件」); 0 when showing all. */
  readonly hidden: number;
}

/**
 * The board's groups as `show` lists them, judged at `nowMs` (the snapshot's fetch). Near: each
 * group (the king's too) keeps the quests domain/deadline.ts isNearQuest keeps (due within a week
 * or past due, their day to do it come, or no mark), and a group left empty goes. Pure.
 */
export function filterBoard(
  groups: readonly BoardGroup[],
  show: BoardFilter,
  nowMs: number,
): FilteredBoard {
  if (show === 'all') return { groups, hidden: 0 };
  let hidden = 0;
  const kept: BoardGroup[] = [];
  for (const group of groups) {
    const quests = group.quests.filter((quest) => isNearQuest(quest.title, nowMs));
    hidden += group.quests.length - quests.length;
    if (quests.length > 0) kept.push({ ...group, quests });
  }
  return { groups: kept, hidden };
}

export interface BoardFilterSwitch {
  readonly show: Readonly<Ref<BoardFilter>>;
  readonly toggleShow: () => void;
}

/** The board's switch, kept in `storage` (localStorage by default; the demo's is in memory). */
export function useBoardFilter(storage: KeyValueStore = createKeyValueStore()): BoardFilterSwitch {
  const show = shallowRef(loadBoardFilter(storage));
  return {
    show,
    toggleShow: () => {
      show.value = show.value === 'near' ? 'all' : 'near';
      saveBoardFilter(storage, show.value);
    },
  };
}
