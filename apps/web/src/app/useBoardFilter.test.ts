import { describe, expect, it } from 'vitest';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import type { BoardGroup } from './guildView';
import {
  BOARD_FILTER_STORAGE_KEY,
  filterBoard,
  loadBoardFilter,
  saveBoardFilter,
  useBoardFilter,
} from './useBoardFilter';

function memory(initial?: string) {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set(BOARD_FILTER_STORAGE_KEY, initial);
  const storage: StorageLike = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  return { items, store: createKeyValueStore(() => storage) };
}

const throwing = createKeyValueStore(() => {
  throw new Error('blocked');
});

const OCT_17 = new Date(2026, 9, 17, 12).getTime();

function group(key: BoardGroup['key'], titles: readonly string[]): BoardGroup {
  return {
    key,
    label: key,
    color: '#ffffff',
    quests: titles.map((title, i) => ({ number: i + 1, title })),
  };
}

describe('filterBoard (Issue #174)', () => {
  const king = group('king', ['〆12/24 年末の挨拶', '方針を決める']);
  const accounting = group('department:経理', [
    '〆10/24 請求書',
    '〆10/25 見積もり',
    '〆9/30 領収書',
  ]);
  const planning = group('department:企画', ['〆3/31 市場調査']);

  it('keeps near, past due and undated quests, in order, the king’s too', () => {
    const { groups, hidden } = filterBoard([king, accounting, planning], 'near', OCT_17);
    expect(groups.map((g) => [g.key, g.quests.map((q) => q.title)])).toEqual([
      ['king', ['方針を決める']],
      ['department:経理', ['〆10/24 請求書', '〆9/30 領収書']],
    ]);
    expect(hidden).toBe(3);
  });

  it('hides a quest until its day to do it (Issue #176)', () => {
    const reception = group('reception', ['@10/20 下見', '@10/1 片付け', '@10/20 〆10/22 発送']);
    const { groups, hidden } = filterBoard([reception], 'near', OCT_17);
    expect(groups[0]?.quests.map((q) => q.title)).toEqual(['@10/1 片付け', '@10/20 〆10/22 発送']);
    expect(hidden).toBe(1);
  });

  it('drops a group left empty and keeps its label, colour and the quests’ other fields', () => {
    const { groups } = filterBoard([accounting], 'near', OCT_17);
    expect(groups[0]).toMatchObject({ key: 'department:経理', label: 'department:経理' });
    expect(groups[0]?.quests[0]).toEqual({ number: 1, title: '〆10/24 請求書' });
    expect(filterBoard([planning], 'near', OCT_17)).toEqual({ groups: [], hidden: 1 });
  });

  it('shows everything as it is with all', () => {
    const all = [king, accounting, planning];
    expect(filterBoard(all, 'all', OCT_17)).toEqual({ groups: all, hidden: 0 });
  });

  it('hides nothing when no title has a far deadline', () => {
    expect(filterBoard([], 'near', OCT_17)).toEqual({ groups: [], hidden: 0 });
    const plain = group('reception', ['受付']);
    expect(filterBoard([plain], 'near', OCT_17)).toEqual({ groups: [plain], hidden: 0 });
  });
});

describe('filterBoard with today (Issue #178)', () => {
  it('keeps quests due or to do today or past, the king’s too, and counts the rest', () => {
    const king = group('king', ['〆10/17 勅命', '方針を決める', '〆10/20 挨拶']);
    const accounting = group('department:経理', ['@10/16 請求書', '@10/18 見積もり']);
    const planning = group('department:企画', ['市場調査', '〆10/24 企画書']);
    const { groups, hidden } = filterBoard([king, accounting, planning], 'today', OCT_17);
    expect(groups.map((g) => [g.key, g.quests.map((q) => q.title)])).toEqual([
      ['king', ['〆10/17 勅命']],
      ['department:経理', ['@10/16 請求書']],
    ]);
    expect(hidden).toBe(5);
  });

  it('keeps a group’s label, colour and the quests’ other fields', () => {
    const reception = group('reception', ['受付', '@10/1 片付け']);
    const { groups } = filterBoard([reception], 'today', OCT_17);
    expect(groups).toEqual([
      {
        key: 'reception',
        label: 'reception',
        color: '#ffffff',
        quests: [{ number: 2, title: '@10/1 片付け' }],
      },
    ]);
  });

  it('shows nothing and hides every quest when none is today’s', () => {
    const plain = group('reception', ['受付', '〆10/18 発送']);
    expect(filterBoard([plain], 'today', OCT_17)).toEqual({ groups: [], hidden: 2 });
    expect(filterBoard([], 'today', OCT_17)).toEqual({ groups: [], hidden: 0 });
  });
});

describe('the board filter setting', () => {
  it('starts near when nothing is stored', () => {
    expect(loadBoardFilter(memory().store)).toBe('near');
  });

  it('round-trips the setting, storing the filter only', () => {
    const { items, store } = memory();
    expect(saveBoardFilter(store, 'all')).toBe(true);
    expect(items.get(BOARD_FILTER_STORAGE_KEY)).toBe('{"show":"all"}');
    expect(loadBoardFilter(store)).toBe('all');
    saveBoardFilter(store, 'near');
    expect(loadBoardFilter(store)).toBe('near');
    expect(saveBoardFilter(store, 'today')).toBe(true);
    expect(items.get(BOARD_FILTER_STORAGE_KEY)).toBe('{"show":"today"}');
    expect(loadBoardFilter(store)).toBe('today');
  });

  it('reads the values stored before today was added (Issue #178)', () => {
    expect(loadBoardFilter(memory('{"show":"near"}').store)).toBe('near');
    expect(loadBoardFilter(memory('{"show":"all"}').store)).toBe('all');
  });

  it.each([
    '{"show":"some"}',
    '{"show":"Today"}',
    '{"show":"today","title":"x"}',
    '{"show":"all","title":"x"}',
    '"all"',
    'not json',
    '{}',
  ])('starts near for a broken value %s', (raw) => {
    expect(loadBoardFilter(memory(raw).store)).toBe('near');
  });

  it('starts near and still toggles when the storage cannot be used', () => {
    expect(loadBoardFilter(throwing)).toBe('near');
    expect(saveBoardFilter(throwing, 'all')).toBe(false);
    const { show, toggleShow } = useBoardFilter(throwing);
    toggleShow();
    expect(show.value).toBe('all');
  });
});

describe('useBoardFilter', () => {
  it('turns today → near → all → today and keeps each choice (Issue #178)', () => {
    const { items, store } = memory();
    const { show, toggleShow } = useBoardFilter(store);
    expect(show.value).toBe('near');
    toggleShow();
    expect(show.value).toBe('all');
    expect(items.get(BOARD_FILTER_STORAGE_KEY)).toBe('{"show":"all"}');
    toggleShow();
    expect(show.value).toBe('today');
    expect(items.get(BOARD_FILTER_STORAGE_KEY)).toBe('{"show":"today"}');
    toggleShow();
    expect(show.value).toBe('near');
    expect(items.get(BOARD_FILTER_STORAGE_KEY)).toBe('{"show":"near"}');
  });

  it('starts from the stored choice', () => {
    expect(useBoardFilter(memory('{"show":"all"}').store).show.value).toBe('all');
    const today = useBoardFilter(memory('{"show":"today"}').store);
    expect(today.show.value).toBe('today');
    today.toggleShow();
    expect(today.show.value).toBe('near');
  });
});
