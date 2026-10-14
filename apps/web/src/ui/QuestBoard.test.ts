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
