import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Issue #276: a page of another port of this machine cannot read the dev server's answers (the
 * real snapshot, the modules with the settings). The E2E servers use the same vite.config.ts as
 * `npm run dev`; the guests' server (another port) stands for that other page's origin.
 *
 * Plain Playwright, not ./fixtures: those answer the data routes themselves and fail a test on
 * any console error, while a fetch the browser blocks logs one. Only Vite's own answers are read
 * here: the client and guild.settings.json as a module (what settings.ts imports). The page of
 * each origin is the client script shown as text, not the app: the app would fetch the snapshot,
 * which holds real data on a machine that has collected some.
 */
const PLAIN_PAGE = '/@vite/client';
const OTHER_ORIGIN_PORT = 5206;
const SETTINGS_MODULE = `/@fs${resolve(import.meta.dirname, '../../../guild.settings.json')}?import`;

/** Whether a fetch from the page can read `url` (false when the browser blocks it). */
async function canRead(page: Page, url: string): Promise<boolean> {
  return page.evaluate(async (target) => {
    try {
      const response = await fetch(target);
      return response.ok;
    } catch {
      return false;
    }
  }, url);
}

test('the dev server answers its own page, not a page of another port (Issue #276)', async ({
  page,
  baseURL,
}) => {
  const own = String(baseURL);
  await page.goto(`${own}${PLAIN_PAGE}`);
  expect(await canRead(page, '/@vite/client')).toBe(true);
  expect(await canRead(page, SETTINGS_MODULE)).toBe(true);

  // The same server, asked from a page of another port: no CORS header, so the page cannot read it.
  await page.goto(`http://127.0.0.1:${String(OTHER_ORIGIN_PORT)}${PLAIN_PAGE}`);
  expect(await canRead(page, `${own}/@vite/client`)).toBe(false);
  expect(await canRead(page, `${own}${SETTINGS_MODULE}`)).toBe(false);
});
