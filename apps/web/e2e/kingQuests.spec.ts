// The king's quests (Issue #141). Runs only in the president project of playwright.config.ts,
// whose dev server reads the fictional settings e2e/settings/president.json (four departments and
// the president's label). /snapshot.json is the fictional guestsSnapshot with the king's Issues,
// served by the route of fixtures.ts.
import { expect, test } from './fixtures.ts';
import { fictionalSettings, guestsSnapshot } from './guestsSnapshot.ts';
import { NOW } from './sampleSnapshot.ts';

/** The king's open Issues, made up; the collector writes them the most recently updated first. */
const KING_QUESTS = [
  { number: 31, title: '架空の勅命: 城の門を塗り直す' },
  { number: 30, title: '架空の勅命: 祭りの日取りを決める' },
] as const;

test.beforeEach(({ snapshotServer }) => {
  const settings = fictionalSettings('president');
  snapshotServer.serve({
    ...guestsSnapshot({ now: NOW, states: ['idle', 'idle'], settings }),
    president: {
      issues: KING_QUESTS.map((quest, i) => ({
        ...quest,
        updatedAt: new Date(NOW - (i + 1) * 60_000).toISOString(),
      })),
    },
  });
});

test('the board lists おうさまの クエスト first, and the king’s row counts them', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board.getByRole('heading', { level: 3 }).first()).toHaveText('おうさまの クエスト');
  for (const quest of KING_QUESTS) {
    await expect(board).toContainText(`#${String(quest.number)}`);
    await expect(board).toContainText(quest.title);
  }
  // The departments' quests stay under it.
  await expect(board).toContainText('架空のクエスト 1');

  const party = page.getByRole('region', { name: 'パーティのようす' });
  const king = party.getByRole('listitem').filter({ hasText: 'ゆきひろ' });
  await expect(king).toContainText('やること 2 件');
});
