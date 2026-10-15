// The show mode (Issue #144): one button on the fetch tab masks every title on the screen.
import { expect, test, waitForBaseline } from './fixtures.ts';
import { NOW, sampleSnapshot, withClosedIssues } from './sampleSnapshot.ts';

const MASK_KEY = 'conect-guild:mask';
/** The collector's next write, a minute after the first (newer than the baseline). */
const LATER = NOW + 60_000;
/** One refresh (5 s) plus room for a scene that holds the next message. */
const EVENT_TIMEOUT = 20_000;
const TITLE = '架空商事への請求書を作る';

test('見せる masks the titles on the board and in the message window, もどす shows them', async ({
  page,
  snapshotServer,
}) => {
  await page.goto('/');
  await waitForBaseline(page);
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  const message = page.getByRole('region', { name: 'メッセージ' });
  const fetch = page.getByRole('region', { name: '取得のようす' });

  // A line already in the window before the press is masked too.
  snapshotServer.serve(withClosedIssues(await sampleSnapshot(LATER), [101], LATER));
  await expect(message).toContainText(`みのりは クエスト#101「${TITLE}」を クリアした！`, {
    timeout: EVENT_TIMEOUT,
  });

  const show = page.getByRole('button', { name: '見せる' });
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await expect(fetch).not.toContainText('伏せ中');
  await show.click();

  await expect(message).toContainText('みのりは クエスト#101「＊＊＊＊＊＊＊＊」を クリアした！');
  await expect(message).not.toContainText(TITLE);
  await expect(board).not.toContainText('秋のお知らせ記事を書く');
  await expect(board).toContainText('#102');
  await expect(board).toContainText('＊＊＊＊');
  await expect(fetch).toContainText('伏せ中');
  const back = page.getByRole('button', { name: 'もどす' });
  await expect(back).toHaveAttribute('aria-pressed', 'true');

  await back.click();
  await expect(message).toContainText(`みのりは クエスト#101「${TITLE}」を クリアした！`);
  await expect(board).toContainText('秋のお知らせ記事を書く');
  await expect(board).not.toContainText('＊');
  await expect(fetch).not.toContainText('伏せ中');
});

test('the show mode is kept on this device across a reload, as a boolean only', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  await expect(board).toContainText('秋のお知らせ記事を書く');
  await page.getByRole('button', { name: '見せる' }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), MASK_KEY))
    .toBe('{"on":true}');

  await page.reload();
  await expect(board).toContainText('#102');
  await expect(board).not.toContainText('秋のお知らせ記事を書く');
  await expect(page.getByRole('button', { name: 'もどす' })).toBeVisible();
});

test('a broken stored value does not mask', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{"on":"yes"}');
  }, MASK_KEY);
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'クエスト掲示板' })).toContainText(
    '秋のお知らせ記事を書く',
  );
  await expect(page.getByRole('button', { name: '見せる' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
