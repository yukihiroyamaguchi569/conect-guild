// The whole title on hover (Issue #261): the board row under the pointer unwraps its title in the page.
import { expect, test } from './fixtures.ts';

const TITLE = '秋のお知らせ記事を書く';

test('hovering a board row shows its whole title, and leaving folds it back', async ({ page }) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  const title = board.locator('.scroll__title', { hasText: TITLE });
  await expect(title).toHaveAttribute('title', TITLE);
  await expect(title).toHaveCSS('white-space', 'nowrap');

  await title.hover();
  await expect(title).toHaveCSS('white-space', 'normal');
  expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.mouse.move(0, 0);
  await expect(title).toHaveCSS('white-space', 'nowrap');
});
