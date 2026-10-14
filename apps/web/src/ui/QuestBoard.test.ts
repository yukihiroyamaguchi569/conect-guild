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
