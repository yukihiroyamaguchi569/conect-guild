// Issue #67: before the collector's first write the dev server answers /snapshot.json with 404.
import { expect, test } from './fixtures.ts';
import { sampleSnapshot } from './sampleSnapshot.ts';

/** Longer than one refresh (5 s), for waits on the next fetch. */
const REFRESH_TIMEOUT = 15_000;

/** Chrome logs every 404 fetch as a console error; only those are expected here. */
const NOT_FOUND_LOG = /^console: Failed to load resource: .*404/;

test('a 404 shows the guide to collect or to the demo, then the screen once collected', async ({
  page,
  pageErrors,
  snapshotServer,
}) => {
  snapshotServer.failWith(404);
  await page.goto('/');

  const guide = page.getByRole('status', { name: 'データのじゅんび' });
  await expect(guide).toContainText('まだ データを あつめていません');
  await expect(guide).toContainText('npm run collect');
  const demoLink = guide.getByRole('link', { name: 'デモを ひらく（?demo=1）' });
  await expect(demoLink).toHaveAttribute('href', '?demo=1');
  // A link of the same origin, to the same page with ?demo=1.
  const target = new URL((await demoLink.getAttribute('href')) ?? '', page.url());
  expect(target.origin).toBe(new URL(page.url()).origin);
  expect(target.search).toBe('?demo=1');

  // No error, no stale mark, no halt while waiting for the collector.
  const fetch = page.getByRole('region', { name: '取得のようす' });
  await expect(fetch).toContainText('最終取得 --:--');
  await expect(fetch).not.toContainText('取得失敗');
  await expect(fetch).not.toContainText('情報が古い');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // The collector writes the file: the next fetch shows the guild without reloading.
  snapshotServer.serve(await sampleSnapshot());
  await expect(page.getByText('#101')).toBeVisible({ timeout: REFRESH_TIMEOUT });
  await expect(guide).toHaveCount(0);
  await expect(fetch).toContainText('最終取得 12:00');
  await expect(fetch).not.toContainText('取得失敗');

  const unexpected = pageErrors.filter((error) => !NOT_FOUND_LOG.test(error));
  expect(unexpected).toEqual([]);
  // The fixture checks the rest is empty; the expected 404 logs are dropped from it.
  pageErrors.length = 0;
});
