import type { Page } from '@playwright/test';
import { expect, test, waitForRoom, type SnapshotServer } from './fixtures.ts';
import { sampleSnapshot, withClosedIssues } from './sampleSnapshot.ts';
import { rewardClickables } from '../src/render/clickables.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../src/render/map.ts';
import { rewardLinesOf } from '../src/render/rewardDesk.ts';

/**
 * A click on the reward of the day (Issue #213): みのり (経理) cleared the one quest of 2026-10-12
 * before 17:00 and got the medal (as in reward.spec.ts). The message window tells what she does
 * with it, and the row 「へやの こもの」 has its button while it is on the desk.
 */

const at = (time: string): number => Date.parse(`2026-10-12T${time}+09:00`);
const MEDAL = { member: 'minori', kind: 'medal', until: at('24:00:00') } as const;
const LINES: readonly string[] = rewardLinesOf(MEDAL).usual;
const [ITEM] = rewardClickables(MEDAL);
const LABEL = 'みのりの くんしょうを みる';

/** The sample at `time`, with #101 (経理) cleared at 10:00. */
async function snapshotAt(time: string) {
  return withClosedIssues(await sampleSnapshot(at(time)), [101], at('10:00:00'));
}

async function openAt(page: Page, server: SnapshotServer, time: string): Promise<void> {
  await page.clock.setFixedTime(at(time));
  server.serve(await snapshotAt(time));
  await page.goto('/');
  await waitForRoom(page);
}

const windowText = async (page: Page) =>
  (
    (await page.getByRole('region', { name: 'メッセージ' }).locator('p').textContent()) ?? ''
  ).trim();

test('a click on the reward tells what its member does with it', async ({
  page,
  snapshotServer,
}) => {
  if (ITEM === undefined) throw new Error('no desk for みのり');
  await openAt(page, snapshotServer, '18:00:00');
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('no canvas');
  const { rect } = ITEM;
  const x = box.x + (((rect.left + rect.right) / 2) * box.width) / LOGICAL_WIDTH;
  const y = box.y + (((rect.top + rect.bottom) / 2) * box.height) / LOGICAL_HEIGHT;
  await page.mouse.move(x, y);
  await expect(page.locator('canvas')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(x, y);
  await expect.poll(() => windowText(page)).toMatch(new RegExp(`^(${LINES.join('|')})$`, 'u'));
  // Never the same line twice in a row.
  const first = await windowText(page);
  await page.mouse.click(x, y);
  await expect.poll(() => windowText(page)).not.toBe(first);
  expect(LINES).toContain(await windowText(page));
});

test('the reward has a button among the room things only while it is on the desk', async ({
  page,
  snapshotServer,
}) => {
  await openAt(page, snapshotServer, '16:59:50');
  const group = page.getByRole('group', { name: 'へやの こもの' });
  await expect(group.getByRole('button', { name: LABEL })).toHaveCount(0);

  await page.clock.setFixedTime(at('17:00:10'));
  snapshotServer.serve(await snapshotAt('17:00:10'));
  const button = group.getByRole('button', { name: LABEL });
  await expect(button).toHaveCount(1, { timeout: 15_000 });
  // The reward's own message goes first; a press under it is dropped (as for the things).
  await expect(page.getByRole('region', { name: 'メッセージ' })).toContainText('ほうび');
  const next = page.getByRole('region', { name: 'メッセージ' }).getByRole('button');
  await expect(next).toHaveAccessibleName('とじる');
  await next.click();
  await expect(next).toHaveAccessibleName('つぎの ようす');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => windowText(page)).toMatch(new RegExp(`^(${LINES.join('|')})$`, 'u'));
});
