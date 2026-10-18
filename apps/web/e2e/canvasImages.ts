import type { Page } from '@playwright/test';

/** A picture drawn on a 2D canvas: the file name of its image and where it landed (logical px). */
export interface DrawnImage {
  readonly file: string;
  /** Where in the image the picture was cut from (the first drawing at this place). */
  readonly sx: number;
  readonly sy: number;
  readonly dx: number;
  readonly dy: number;
}

declare global {
  interface Window {
    /** The sprite pictures drawn, once per file and place (installCanvasImageRecorder). */
    e2eCanvasImages?: DrawnImage[];
  }
}

/**
 * Runs in the page before the app (page.addInitScript): wraps drawImage of the 2D context so the
 * tests can see which sprite sheet was drawn where (the 9-argument form the sprites use). The
 * drawing itself is unchanged.
 */
export function installCanvasImageRecorder(): void {
  const seen = new Set<string>();
  window.e2eCanvasImages = [];
  const proto = CanvasRenderingContext2D.prototype;
  const original: unknown = Object.getOwnPropertyDescriptor(proto, 'drawImage')?.value;
  if (typeof original !== 'function') return;
  proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    const [image, sx, sy, , , dx, dy] = args;
    if (
      image instanceof HTMLImageElement &&
      typeof sx === 'number' &&
      typeof sy === 'number' &&
      typeof dx === 'number' &&
      typeof dy === 'number'
    ) {
      const file = new URL(image.src).pathname.split('/').pop() ?? '';
      const key = `${file}@${String(dx)},${String(dy)}`;
      if (!seen.has(key)) {
        seen.add(key);
        window.e2eCanvasImages?.push({ file, sx, sy, dx, dy });
      }
    }
    Reflect.apply(original, this, args);
  };
}

/** The pictures drawn so far whose file name starts with `prefix`. */
export async function drawnImages(page: Page, prefix: string): Promise<DrawnImage[]> {
  const images = await page.evaluate(() => window.e2eCanvasImages ?? []);
  return images.filter((image) => image.file.startsWith(prefix));
}
