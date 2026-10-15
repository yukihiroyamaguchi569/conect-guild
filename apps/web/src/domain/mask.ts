/** The show mode (Issue #144): titles become a row of these, so nothing of them is left on screen. */
export const MASK_CHAR = '＊';

/** The row's length is the title's, kept within these bounds so it tells little of the title. */
export const MASK_MIN_LENGTH = 4;
export const MASK_MAX_LENGTH = 8;

const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/** `＊` as many times as the title's length (in characters), rounded into 4 to 8. */
export function maskTitle(title: string): string {
  const length = Array.from(graphemes.segment(title)).length;
  return MASK_CHAR.repeat(Math.min(Math.max(length, MASK_MIN_LENGTH), MASK_MAX_LENGTH));
}
