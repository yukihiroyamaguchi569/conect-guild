import { expect, type Locator } from '@playwright/test';
import type { Snapshot } from '@conect-guild/snapshot';

/**
 * Every note the fetch status can show at once (Issues #121, #132), for the tests that check the
 * tab stays on one line and the windows keep clear of the seats with all of them out.
 */

/** A day old (情報が古い), its sessions unreadable (セッションの状態を読めません). */
export function withOldUnreadableSessions(snapshot: Snapshot): Snapshot {
  const old = new Date(Date.parse(snapshot.fetchedAt) - 86_400_000).toISOString();
  return { ...snapshot, fetchedAt: old, sessions: { status: 'unavailable', checkedAt: old } };
}

/**
 * Init script: localStorage refuses every write (the effects note) and every removal (基準を消せ
 * ませんでした). Runs in the page, so it uses nothing from this module.
 */
export function refuseStorage(): void {
  const refuse = (): never => {
    throw new DOMException('blocked', 'QuotaExceededError');
  };
  Storage.prototype.setItem = refuse;
  Storage.prototype.removeItem = refuse;
}

/** Clicks 「基準を消す」, has the next fetch fail with `fail()`, and waits for every note. */
export async function showEveryNote(fetch: Locator, fail: () => void): Promise<void> {
  await expect(fetch).toContainText('localStorage が使えないため');
  await fetch.getByRole('button', { name: '基準を消す' }).click();
  fail();
  await expect(fetch.getByRole('status')).toContainText('取得失敗', { timeout: 15_000 });
  for (const note of ['情報が古い', 'セッションの状態を読めません', '基準を消せませんでした']) {
    await expect(fetch).toContainText(note);
  }
}
