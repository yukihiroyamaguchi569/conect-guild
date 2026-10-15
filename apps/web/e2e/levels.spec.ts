import { drawnLevels, installCanvasTextRecorder } from './canvasText.ts';
import { expect, test, waitForRoom } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';

/** The sample's levels as the canvas writes them (かなめ 4, the four departments 3, 2, 2, 3). */
const SAMPLE_TAGS = ['Lv 2', 'Lv 2', 'Lv 3', 'Lv 3', 'Lv 4'];

/**
 * Cumulative levels (Issue #19) from the sample's history: 経理 45, 広報 25, 企画 25, 総務 35 and
 * かなめ 24 scrolls × 3 + 2 clears with no department × 10 = 92 experience.
 */
test('the party window shows each level with its gauge, and おうさま for the king', async ({
  page,
}) => {
  await page.goto('/');
  const party = page.getByRole('region', { name: 'パーティのようす' });
  const rows = party.getByRole('listitem');
  await expect(rows).toHaveCount(6);
  const expected = ['Lv 4', 'Lv 3', 'Lv 2', 'Lv 2', 'Lv 3', 'おうさま'];
  for (const [i, label] of expected.entries()) await expect(rows.nth(i)).toContainText(label);
  // 成果 stays beside the level.
  await expect(rows.nth(1)).toContainText('成果 0');

  // A gauge for everyone but the king: 経理 is halfway from Lv 3 (30) to Lv 4 (60).
  const gauges = party.getByRole('meter', { name: 'つぎのレベルまで' });
  await expect(gauges).toHaveCount(5);
  await expect(gauges.nth(1)).toHaveAttribute('aria-valuenow', '50');
  await expect(rows.nth(5).getByRole('meter')).toHaveCount(0);

  // The breakdown is in the tooltip: counts only.
  await expect(rows.nth(1).getByText('Lv 3')).toHaveAttribute(
    'title',
    'けいけんち 45・つぎのレベルまで 15（クリア 3 件・マージ 3 件）',
  );
  await expect(rows.nth(0).getByText('Lv 4')).toHaveAttribute(
    'title',
    'けいけんち 92・つぎのレベルまで 8（受付の巻物 24 件・担当なしのクリア 2 件）',
  );
});

test('the levels do not make the party column taller than the room keeps free', async ({
  page,
}) => {
  // At 1024 px wide the stage is the canvas's logical size (render/map.ts WINDOW_EXTENTS: 278).
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/');
  await waitForRoom(page);
  // Measure once all six rows (with their levels) are in.
  await expect(
    page.getByRole('region', { name: 'パーティのようす' }).getByRole('listitem'),
  ).toHaveCount(6);
  // The fetch status is the tab on the message window (Issue #132): the party window is the column.
  const side = await page.getByRole('region', { name: 'パーティのようす' }).boundingBox();
  if (side === null) throw new Error('the party window has no box');
  expect(side.y + side.height).toBeLessThanOrEqual(278);
});

for (const hour of ['12', '21.5']) {
  test(`the canvas writes 「Lv N」 under the five seats (?hour=${hour})`, async ({ page }) => {
    await page.addInitScript(installCanvasTextRecorder);
    await page.goto(`/?hour=${hour}`);
    await waitForRoom(page);
    await expect.poll(() => drawnLevels(page)).toEqual(SAMPLE_TAGS);
  });
}

test('a halted screen writes no 「Lv N」 on the canvas', async ({ page, snapshotServer }) => {
  await page.addInitScript(installCanvasTextRecorder);
  snapshotServer.serve({ ...(await sampleSnapshot()), repo: 'someone/else' });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('収集の対象と設定が違います');
  await waitForRoom(page);
  expect(await drawnLevels(page)).toEqual([]);
});
