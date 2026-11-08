// The quests' own pictures (Issue #271): a card shows its quest's picture when one was drawn, the
// member's otherwise. The pictures are fictional and served by the cardServer fixture.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function openCard(page: Page, number: number) {
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: new RegExp(`#${String(number)}`) })
    .click();
  const card = page.getByRole('dialog', { name: `クエスト #${String(number)} のカード` });
  await expect(card).toBeVisible();
  return card.locator('img.card__picture');
}

/** True once the picture has loaded (a broken one has no natural width). */
function loaded(picture: ReturnType<Page['locator']>): Promise<boolean> {
  return picture.evaluate(
    (element) =>
      element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
  );
}

test('a quest with a picture shows it, with its time, in the card’s window', async ({
  page,
  cardServer,
}) => {
  cardServer.draw(101, 1_760_000_000_123);
  await page.goto('/');
  const picture = await openCard(page, 101);
  await expect(picture).toHaveAttribute('src', '/cards/101.png?v=1760000000123');
  await expect.poll(() => loaded(picture)).toBe(true);
  expect(cardServer.requests).toContain('/cards/index.json');
});

test('a quest without one shows the member’s picture, never asking for its file', async ({
  page,
  cardServer,
}) => {
  cardServer.draw(101);
  await page.goto('/');
  const picture = await openCard(page, 102);
  await expect.poll(() => cardServer.requests).toContain('/cards/index.json');
  await expect(picture).toHaveAttribute('src', /ill-hibiki/);
  await expect.poll(() => loaded(picture)).toBe(true);
  expect(cardServer.requests).not.toContain('/cards/102.png');
});

/** Chrome's own line for any response of 400 or more; the page cannot keep it off the console. */
const HTTP_500_LINE =
  'console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)';

test('a failed list leaves the member’s picture, with no error of the page', async ({
  page,
  cardServer,
  pageErrors,
}) => {
  cardServer.draw(101);
  cardServer.failIndexWith(500);
  await page.goto('/');
  const picture = await openCard(page, 101);
  await expect.poll(() => cardServer.requests).toContain('/cards/index.json');
  await expect(picture).toHaveAttribute('src', /ill-minori/);
  await expect.poll(() => loaded(picture)).toBe(true);
  // Only the browser's line for the 500 itself (the one 500 of this test); the pageErrors fixture
  // then checks nothing else reached the console.
  expect(pageErrors).toEqual([HTTP_500_LINE]);
  pageErrors.splice(0);
});

test('a picture listed but gone falls back to the member’s', async ({ page, cardServer }) => {
  cardServer.draw(101);
  await page.goto('/');
  await page.route('**/cards/101.png*', (route) =>
    route.fulfill({
      status: 200,
      body: 'not a png',
      headers: { 'Cache-Control': 'no-store', 'x-e2e-snapshot': '1' },
    }),
  );
  const picture = await openCard(page, 101);
  await expect(picture).toHaveAttribute('src', /ill-minori/);
  await expect.poll(() => loaded(picture)).toBe(true);
});

test('the show mode shows the picture as it is', async ({ page, cardServer }) => {
  cardServer.draw(101);
  await page.goto('/');
  await page.getByRole('button', { name: '見せる' }).click();
  const picture = await openCard(page, 101);
  await expect(picture).toHaveAttribute('src', /^\/cards\/101\.png\?v=/);
});
