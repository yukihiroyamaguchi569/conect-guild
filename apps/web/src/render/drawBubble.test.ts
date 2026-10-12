import { describe, expect, it } from 'vitest';
import { bubbleShape, type Spot, type Voice } from './bubbleShape';
import { BUBBLE_COLORS, drawBubble, type BubbleContext } from './drawBubble';
import { BUBBLE, DETAIL_SCALE, OVERHEAD_OFFSET } from './metrics';

interface Recorded {
  /** The colour of each fill(), in order: one per path. */
  readonly fills: string[];
  /** How many rectangles each fill() painted. */
  readonly rects: number[];
  readonly texts: { text: string; x: number; y: number; color: string; font: string }[];
  readonly moves: string[];
}

/** drawBubble sets only colour strings, never a gradient or a pattern. */
function colorOf(style: unknown): string {
  return typeof style === 'string' ? style : 'not a colour';
}

function recordingContext(): { ctx: BubbleContext; seen: Recorded } {
  const seen: Recorded = { fills: [], rects: [], texts: [], moves: [] };
  let pending = 0;
  const ctx: BubbleContext = {
    fillStyle: '#000000',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: () => undefined,
    restore: () => undefined,
    translate: (x: number, y: number) => {
      seen.moves.push(`translate ${String(x)} ${String(y)}`);
    },
    scale: (x: number, y: number) => {
      seen.moves.push(`scale ${String(x)} ${String(y)}`);
    },
    beginPath: () => {
      pending = 0;
    },
    rect: () => {
      pending += 1;
    },
    fill: () => {
      seen.fills.push(colorOf(ctx.fillStyle));
      seen.rects.push(pending);
    },
    fillText: (text: string, x: number, y: number) => {
      seen.texts.push({ text, x, y, color: colorOf(ctx.fillStyle), font: ctx.font });
    },
  };
  return { ctx, seen };
}

const FEET = { x: 300, y: 400 };
const { ink, paper, shadow, shoutPaper, whisperInk } = BUBBLE_COLORS;

function draw(voice: Voice, text: string, spot: Spot = 'right') {
  const { ctx, seen } = recordingContext();
  const chars = voice === 'glyph' ? 1 : Array.from(text).length;
  drawBubble(ctx, { text, color: '#b0103a', voice, chars }, FEET, spot);
  return seen;
}

describe('drawBubble', () => {
  it('draws in detail px from the point over the head', () => {
    expect(draw('say', 'はい').moves).toEqual([
      `translate ${String(FEET.x)} ${String(FEET.y - OVERHEAD_OFFSET)}`,
      `scale ${String(DETAIL_SCALE)} ${String(DETAIL_SCALE)}`,
    ]);
  });

  it('fills each colour once, as one path: the shadow, the border, then the paper', () => {
    const seen = draw('say', 'はい');
    expect(seen.fills).toEqual([shadow, ink, paper]);
    // The stepped box (3 rectangles) and the tail's rows, in each path.
    for (const count of seen.rects) expect(count).toBeGreaterThan(3);
  });

  it('writes the words once, in their ink, in the middle of the box', () => {
    const shape = bubbleShape('say', 2, 'left');
    const [text] = draw('say', 'はい', 'left').texts;
    expect(text).toEqual({
      text: 'はい',
      x: shape.x + shape.w / 2,
      y: shape.y + shape.h / 2 + 0.5,
      color: '#b0103a',
      font: `bold ${String(BUBBLE.textPx)}px sans-serif`,
    });
  });

  it('shouts: spikes outlined in ink, a 2 px border and the pale yellow paper', () => {
    const seen = draw('shout', '！');
    expect(seen.fills).toEqual([ink, shoutPaper, shadow, ink, ink, shoutPaper]);
    expect(seen.texts[0]?.color).toBe('#b0103a');
  });

  it('whispers: the border let through every other pixel, the words in grey', () => {
    const seen = draw('whisper', 'ゴニョゴニョ');
    expect(seen.fills).toEqual([shadow, ink, paper, paper]);
    expect(seen.rects.at(-1)).toBeGreaterThan(10);
    expect(seen.texts[0]?.color).toBe(whisperInk);
  });

  it('draws a waiting sign in the larger glyph font', () => {
    const seen = draw('glyph', '?');
    expect(seen.fills).toEqual([shadow, ink, paper]);
    expect(seen.texts[0]?.font).toBe(`bold ${String(BUBBLE.glyphPx)}px sans-serif`);
  });
});
