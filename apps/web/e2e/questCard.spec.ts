// The quest card (Issue #267): pressing a board row opens its card over the screen.
import { expect, test } from './fixtures.ts';
import { NOW, sampleSnapshot } from './sampleSnapshot.ts';

/** Issue #101's title with a deadline three days after NOW (10/12 in Tokyo). */
const DUE_TITLE = '〆10/15 架空商事への請求書を作る';

test.beforeEach(async ({ snapshotServer }) => {
  const sample = await sampleSnapshot(NOW);
  snapshotServer.serve({
    ...sample,
    issues: sample.issues.map((issue) =>
      issue.number === 101 ? { ...issue, title: DUE_TITLE } : issue,
    ),
  });
});

test('a department row opens its card: number, cost, owner and PR; Esc closes it', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  const row = board.getByRole('button', { name: /#101/ });
  await row.click();

  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(DUE_TITLE);
  await expect(card.locator('.card__cost')).toHaveText('3');
  await expect(card).toContainText('〆10/15 あと 3 日');
  await expect(card).toContainText('みのり（経理）');
  await expect(card).toContainText('ノーマル');
  await expect(card).toContainText('#110・1 ファイル・かなめ待ち');
  await expect(card.getByRole('button', { name: 'とじる' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(row).toBeFocused();
});

test('the reception row gives かなめ the card; a click outside closes it', async ({ page }) => {
  await page.goto('/');
  const row = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#104/ });
  await row.click();
  const card = page.getByRole('dialog', { name: 'クエスト #104 のカード' });
  await expect(card).toContainText('かなめ（受付）');
  await expect(card.locator('.card__cost')).toHaveText('―');
  await expect(card).toContainText('PR なし');

  await page.mouse.click(5, 5);
  await expect(card).toBeHidden();
  await expect(row).toBeFocused();
});

test('a PR that changes rules waits for the president; とじる closes the card', async ({
  page,
}) => {
  await page.goto('/');
  const row = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#103/ });
  await row.click();
  const card = page.getByRole('dialog', { name: 'クエスト #103 のカード' });
  // Labelled 企画 and 広報: the first in the settings' order is in charge, as on the board.
  await expect(card).toContainText('ひびき（広報）');
  await expect(card).toContainText('#111・1 ファイル・社長待ち');

  await card.getByRole('button', { name: 'とじる' }).click();
  await expect(card).toBeHidden();
  await expect(row).toBeFocused();
});

test('the show mode masks the card’s title, not its number or owner', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '見せる' }).click();
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ })
    .click();
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toContainText('＊＊＊＊');
  await expect(card).not.toContainText('架空商事');
  await expect(card).toContainText('みのり（経理）');
});

test('the card closes when its Issue is closed', async ({ page, snapshotServer }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#104/ })
    .click();
  const card = page.getByRole('dialog', { name: 'クエスト #104 のカード' });
  await expect(card).toBeVisible();
  const later = NOW + 60_000;
  const sample = await sampleSnapshot(later);
  const at = new Date(later).toISOString();
  snapshotServer.serve({
    ...sample,
    issues: sample.issues.map((issue) =>
      issue.number === 104 ? { ...issue, state: 'closed', closedAt: at, updatedAt: at } : issue,
    ),
  });
  await expect(card).toBeHidden({ timeout: 15_000 });
});

test('the card shows on a narrow screen too, inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/');
  // By the keyboard: on this width the message window's ▼ lies over the board's first rows.
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ })
    .press('Enter');
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeInViewport({ ratio: 1 });
});
