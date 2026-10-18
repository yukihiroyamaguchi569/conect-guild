import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import type { GuestBoardGroup } from '../app/guildView';
import QuestBoard from './QuestBoard.vue';

const GUEST: GuestBoardGroup = {
  key: 'guest:0',
  name: 'たびびと',
  items: [{ number: 5, isPr: false, title: '架空の Issue' }],
  more: 0,
};

function render(guests: readonly GuestBoardGroup[]): Promise<string> {
  return renderToString(createSSRApp(QuestBoard, { groups: [], guests, loaded: true }));
}

describe('QuestBoard without company quests', () => {
  it('says there are no quests when nothing is listed', async () => {
    expect(await render([])).toContain('いまは クエストが ありません');
  });

  it('says only the company has none while the guests’ Issues and PRs are listed', async () => {
    const html = await render([GUEST]);
    expect(html).toContain('会社の クエストは いまは ありません');
    expect(html).not.toContain('いまは クエストが ありません');
    expect(html).toContain('架空の Issue');
  });
});

describe('QuestBoard: the お客さん section (Issue #121)', () => {
  it('sits under the scrolling quest list, not inside it', async () => {
    const html = await renderToString(
      createSSRApp(QuestBoard, {
        groups: [
          {
            key: 'department:錬金',
            label: 'みのり',
            color: '#4caf50',
            quests: [
              {
                number: 1,
                title: '架空のクエスト',
                state: 'open',
                closedAt: null,
                department: '錬金',
                multiDepartment: false,
              },
            ],
          },
        ],
        guests: [GUEST],
        loaded: true,
      }),
    );
    const list = html.indexOf('class="board__list"');
    const quest = html.indexOf('架空のクエスト');
    const guests = html.indexOf('class="board__guests"');
    expect(list).toBeGreaterThan(-1);
    expect(quest).toBeGreaterThan(list);
    expect(guests).toBeGreaterThan(quest);
    // Every <div> opened from the list on is closed before the section: it is the list's sibling.
    const between = html.slice(html.lastIndexOf('<div', list), guests);
    expect(between.split('<div')).toHaveLength(between.split('</div>').length);
  });
});

describe('QuestBoard: おうさまの クエスト (Issue #141)', () => {
  it('lists the king’s quests as a group like the departments’, with the title as text', async () => {
    const html = await renderToString(
      createSSRApp(QuestBoard, {
        groups: [
          {
            key: 'king',
            label: 'おうさまの クエスト',
            color: '#8e44ad',
            quests: [{ number: 7, title: '<b>架空の勅命</b>' }],
          },
        ],
        guests: [],
        loaded: true,
      }),
    );
    expect(html).toContain('background:#8e44ad');
    expect(html).toContain('おうさまの クエスト');
    expect(html).toContain('#7');
    expect(html).toContain('&lt;b&gt;架空の勅命&lt;/b&gt;');
    expect(html).not.toContain('複数部門');
    expect(html).not.toContain('いまは クエストが ありません');
  });
});

describe('QuestBoard: the show mode (Issue #144)', () => {
  const groups = [
    {
      key: 'department:錬金',
      label: 'みのり',
      color: '#4caf50',
      quests: [
        {
          number: 41,
          title: '取引先との契約',
          state: 'open',
          closedAt: null,
          department: '錬金',
          multiDepartment: false,
        },
      ],
    },
  ] as const;

  function renderBoard(masked: boolean): Promise<string> {
    return renderToString(
      createSSRApp(QuestBoard, { groups, guests: [GUEST], loaded: true, masked }),
    );
  }

  it('masks every title while keeping the numbers and the names', async () => {
    const html = await renderBoard(true);
    expect(html).not.toContain('取引先との契約');
    expect(html).not.toContain('架空の Issue');
    expect(html).toContain('#41');
    expect(html).toContain('#5');
    expect(html).toContain('みのり');
    expect(html).toContain('たびびと');
    expect(html).toContain('＊＊＊＊＊＊＊');
  });

  it('shows the titles when not masked', async () => {
    const html = await renderBoard(false);
    expect(html).toContain('取引先との契約');
    expect(html).toContain('架空の Issue');
    expect(html).not.toContain('＊');
  });
});

describe('QuestBoard: the near filter (Issue #174)', () => {
  const groups = [
    {
      key: 'king',
      label: 'おうさまの クエスト',
      color: '#8e44ad',
      quests: [{ number: 7, title: '〆10/20 架空の勅命' }],
    },
  ] as const;

  function renderBoard(props: Record<string, unknown>): Promise<string> {
    return renderToString(
      createSSRApp(QuestBoard, { groups: [], guests: [], loaded: true, ...props }),
    );
  }

  it('shows the switch as ちかいもの and how many quests it left out', async () => {
    const html = await renderBoard({ groups, show: 'near', hidden: 2 });
    expect(html).toMatch(/>ちかいもの<\/button>/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('ほか 2 件（日付が 先）');
    expect(html).toContain('〆10/20 架空の勅命');
  });

  it('starts as ちかいもの without the props and says nothing of hidden quests', async () => {
    const html = await renderBoard({ groups });
    expect(html).toMatch(/>ちかいもの<\/button>/);
    expect(html).not.toContain('ほか');
  });

  it('shows すべて when showing all', async () => {
    const html = await renderBoard({ groups, show: 'all' });
    expect(html).toMatch(/>すべて<\/button>/);
    expect(html).toContain('aria-pressed="true"');
  });

  it('shows きょう with its own words for hidden quests (Issue #178)', async () => {
    const html = await renderBoard({ groups, show: 'today', hidden: 3 });
    expect(html).toMatch(/>きょう<\/button>/);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('ほか 3 件（今日より 先・印なし）');
    expect(html).not.toContain('日付が 先');
  });

  it('says no quest for today when every quest was left out (Issue #178)', async () => {
    const html = await renderBoard({ show: 'today', hidden: 2 });
    expect(html).toContain('きょうの クエストは ありません');
    expect(html).not.toContain('ちかい クエストは ありません');
    expect(html).not.toContain('いまは クエストが ありません');
  });

  it('says no quest at all with today when nothing was left out', async () => {
    const html = await renderBoard({ show: 'today', hidden: 0 });
    expect(html).toContain('いまは クエストが ありません');
    expect(html).not.toContain('ほか');
  });

  it('says no near quest instead of none when every quest was left out', async () => {
    const html = await renderBoard({ show: 'near', hidden: 1 });
    expect(html).toContain('ちかい クエストは ありません');
    expect(html).toContain('ほか 1 件');
    expect(html).not.toContain('いまは クエストが ありません');
  });
});
