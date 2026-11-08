// The quest card (Issue #267): pressing a board row opens its card over the screen.
import { midiToFrequency, SCORES } from '../src/audio/scores.ts';
import { installFakeAudio } from './fakeAudio.ts';
import type { Page } from '@playwright/test';
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
  // Closed by the mouse, the row still shows it has the focus.
  await expect(row).toHaveCSS('outline-style', 'solid');
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

test('focus goes back to the pressed row even when the click did not focus it (Safari)', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  const filter = board.getByRole('button', { name: 'ちかいもの' });
  await filter.focus();
  const row = board.getByRole('button', { name: /#101/ });
  // A click event without moving the focus, as Safari does for buttons.
  await row.dispatchEvent('click');
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(row).toBeFocused();
});

test('Tab never reaches the screen behind the card', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ })
    .click();
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    // In the card, or out of the page to the browser's own controls (body): never the screen behind.
    const inside = await card.evaluate((element) => {
      const active = document.activeElement;
      return active === null || active === document.body || element.contains(active);
    });
    expect(inside).toBe(true);
  }
});

test('focus goes to the board when the card’s row went away', async ({ page, snapshotServer }) => {
  await page.goto('/');
  const board = page.getByRole('region', { name: 'クエスト掲示板' });
  // By the mouse: the focus put back must show all the same.
  await board.getByRole('button', { name: /#104/ }).click();
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
  await expect(board).toBeFocused();
  await expect(board).toHaveCSS('outline-style', 'solid');
});

test('the focus put back shows even where focus() ignores focusVisible', async ({ page }) => {
  // A browser without the option: focus() is called as if it had none.
  await page.addInitScript(() => {
    const focus: unknown = Reflect.get(HTMLElement.prototype, 'focus');
    if (typeof focus !== 'function') return;
    HTMLElement.prototype.focus = function focusWithoutOptions(this: HTMLElement) {
      Reflect.apply(focus, this, []);
    };
  });
  await page.goto('/');
  const row = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#103/ });
  await row.click();
  const card = page.getByRole('dialog', { name: 'クエスト #103 のカード' });
  await card.getByRole('button', { name: 'とじる' }).click();
  await expect(row).toBeFocused();
  await expect(row).toHaveCSS('outline-style', 'solid');
});

/** The frequencies (Hz, rounded) the card's flip plays, as the fake audio records them. */
const CARD_TONES = SCORES.card.notes.flatMap((note) =>
  note.midi === null ? [] : [Math.round(midiToFrequency(note.midi))],
);

test('opening a card plays its flip once, with the sound on (Issue #268)', async ({ page }) => {
  await page.addInitScript(installFakeAudio);
  await page.goto('/');
  await page.getByRole('button', { name: '♪ 音を出す' }).click();
  // The blip of the button, then nothing until the card opens.
  await expect.poll(() => page.evaluate(() => window.e2eStartedTones)).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.e2eToneFrequencies = [];
  });
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'クエスト #101 のカード' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.e2eToneFrequencies)).toEqual(CARD_TONES);
});

test('opening a card plays nothing while the sound is off (Issue #268)', async ({ page }) => {
  await page.addInitScript(installFakeAudio);
  await page.goto('/');
  await page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ })
    .click();
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  // Turning the sound on now blips; the card's flip was never played (nor is it played late).
  await page.getByRole('button', { name: '♪ 音を出す' }).click();
  await expect.poll(() => page.evaluate(() => window.e2eStartedTones)).toBeGreaterThan(0);
  const heard = await page.evaluate(() => window.e2eToneFrequencies ?? []);
  expect(heard.filter((hz) => CARD_TONES.includes(hz))).toEqual([]);
});

/** The card's flip in the page now: its progress (ms), or null when there is none. */
function flipAt(page: Page): Promise<number | null> {
  return page.locator('.card-scene').evaluate((element) => {
    const [flip] = element.getAnimations();
    return flip === undefined || flip.playState === 'finished' ? null : Number(flip.currentTime);
  });
}

/**
 * Holds the card's flip at `ms` and returns its transform there. `matrix3d(-1, …)` is the card
 * turned half round: its back towards the viewer.
 */
function holdFlip(page: Page, ms: number): Promise<string> {
  return page.locator('.card-scene').evaluate((element, at) => {
    const [flip] = element.getAnimations();
    if (flip === undefined) throw new Error('no flip');
    flip.pause();
    flip.currentTime = at;
    return getComputedStyle(element).transform;
  }, ms);
}

const BACK_FACING = /^matrix3d\(-1, /;

/** Whether a computed transform is no turn at all, however the browser writes it (2D or 3D). */
function isFaceUp(page: Page, transform: string): Promise<boolean> {
  return page.evaluate((value) => new DOMMatrix(value).isIdentity, transform);
}

test('the card turns over from its back, and is face up from the start without motion (Issue #268)', async ({
  page,
}) => {
  await page.goto('/');
  const row = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ });
  await row.click();
  expect(await holdFlip(page, 0)).toMatch(BACK_FACING);
  // At the end it is face up.
  expect(await isFaceUp(page, await holdFlip(page, 500))).toBe(true);
  expect(await isFaceUp(page, await holdFlip(page, 0))).toBe(false);
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await row.click();
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeVisible();
  expect(await flipAt(page)).toBeNull();
  await expect(page.locator('.card-scene')).toHaveCSS('transform', 'none');
});

test('closing a card while it turns over leaves nothing behind (Issue #268)', async ({ page }) => {
  await page.goto('/');
  const row = page
    .getByRole('region', { name: 'クエスト掲示板' })
    .getByRole('button', { name: /#101/ });
  await row.click();
  // Held in the middle of the flip, still turned away, then closed.
  expect(await holdFlip(page, 100)).toMatch(/^matrix3d\(/);
  await page.keyboard.press('Escape');
  const card = page.getByRole('dialog', { name: 'クエスト #101 のカード' });
  await expect(card).toBeHidden();
  await expect(row).toBeFocused();
  // Opened again, it starts from its back once more.
  await row.click();
  await expect(card).toBeVisible();
  expect(await holdFlip(page, 0)).toMatch(BACK_FACING);
  await expect(card.getByRole('button', { name: 'とじる' })).toBeFocused();
});
