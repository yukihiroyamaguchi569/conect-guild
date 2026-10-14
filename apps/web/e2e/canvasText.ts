import type { Page } from '@playwright/test';

declare global {
  interface Window {
    /** The texts drawn on a 2D canvas, once per text and place (installCanvasTextRecorder). */
    e2eCanvasTexts?: string[];
    /** The texts drawn with strokeText, once per text (installCanvasTextRecorder). */
    e2eCanvasStrokedTexts?: string[];
  }
}

/**
 * Runs in the page before the app (page.addInitScript): wraps fillText and strokeText of the 2D
 * context so the tests can read what was written on the canvas. The drawing itself is unchanged.
 */
export function installCanvasTextRecorder(): void {
  const seen = new Set<string>();
  window.e2eCanvasTexts = [];
  window.e2eCanvasStrokedTexts = [];
  const proto = CanvasRenderingContext2D.prototype;
  const names: readonly ('fillText' | 'strokeText')[] = ['fillText', 'strokeText'];
  for (const name of names) {
    const original: unknown = Object.getOwnPropertyDescriptor(proto, name)?.value;
    if (typeof original !== 'function') continue;
    proto[name] = function (
      this: CanvasRenderingContext2D,
      ...args: Parameters<CanvasRenderingContext2D['fillText']>
    ) {
      // Once per text and place: each frame redraws the same texts where they were.
      const [text, x, y] = args;
      const key = `${text}@${String(x)},${String(y)}`;
      if (!seen.has(key)) {
        seen.add(key);
        window.e2eCanvasTexts?.push(text);
      }
      if (name === 'strokeText' && !seen.has(`stroke:${text}`)) {
        seen.add(`stroke:${text}`);
        window.e2eCanvasStrokedTexts?.push(text);
      }
      Reflect.apply(original, this, args);
    };
  }
}

/** The texts drawn on the canvas so far, once per text and place. */
export function drawnTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => window.e2eCanvasTexts ?? []);
}

/** The texts drawn with strokeText so far, once per text. */
export function strokedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => window.e2eCanvasStrokedTexts ?? []);
}

/** The 「Lv N」 texts drawn so far (one per place), sorted. */
export async function drawnLevels(page: Page): Promise<string[]> {
  const texts = await drawnTexts(page);
  return texts.filter((text) => /^Lv \d+$/.test(text)).toSorted((a, b) => a.localeCompare(b));
}
