import { describe, expect, it } from 'vitest';
import { LAYOUTS } from './index';
import type { GuildLayout, TileRect } from './types';

/**
 * The offices of two, three, five and six departments as they were before Issue #123 built them
 * from the rules (layout4 has its own golden, layout4.golden.test.ts): what stands where, and
 * which of two things sharing a cell is drawn first. The order of things that share no cell does
 * not show, so it is not recorded.
 */

const sharesCell = (a: TileRect, b: TileRect): boolean =>
  a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

const byText = (a: string, b: string): number => a.localeCompare(b);

/** Each item on a line, sorted, then each pair sharing a cell in drawing order. */
function itemLines(kind: string, items: readonly TileRect[]): string[] {
  const text = items.map((item) => JSON.stringify(item));
  const over = items.flatMap((item, i) =>
    items
      .slice(i + 1)
      .filter((later) => sharesCell(item, later))
      .map((later) => `${kind} over ${JSON.stringify(item)} then ${JSON.stringify(later)}`),
  );
  return [...text.map((line) => `${kind} ${line}`).toSorted(byText), ...over.toSorted(byText)];
}

function lines(layout: GuildLayout): string[] {
  const { objects, decor, ...rest } = layout;
  return [
    ...Object.entries(rest)
      .map(([key, value]) => `${key} ${JSON.stringify(value)}`)
      .toSorted(byText),
    ...itemLines('object', objects),
    ...itemLines('decor', decor),
  ];
}

describe.each([2, 3, 5, 6])('layout of %d departments golden', (count) => {
  it('builds the same office as before the rules (Issue #123)', async () => {
    const layout = LAYOUTS[count];
    if (layout === undefined) throw new Error(`no layout for ${String(count)}`);
    await expect(`${lines(layout).join('\n')}\n`).toMatchFileSnapshot(
      `./__golden__/layout${String(count)}.txt`,
    );
  });
});
