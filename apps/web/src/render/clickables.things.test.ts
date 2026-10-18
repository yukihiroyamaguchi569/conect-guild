import { describe, expect, it } from 'vitest';
import {
  CLICKABLES,
  clickableAt,
  clickablesWith,
  pressedAt,
  pressStyle,
  rovingIndex,
} from './clickables';
import { thingsIn } from './examine';
import { SELECTED_LAYOUT } from './layouts';
import { PET_RECT } from './petting';

/** The room's things on the canvas (Issue #190). */

const middle = (rect: { left: number; top: number; right: number; bottom: number }) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

describe('the things of the selected layout', () => {
  const things = CLICKABLES.filter((item) => item.id === 'thing');

  it('come after the king and the pet, one per thing of the layout', () => {
    expect(CLICKABLES.slice(0, 2).map((item) => item.id)).toEqual(['king', 'dog']);
    expect(things.map((item) => item.rect)).toEqual(thingsIn(SELECTED_LAYOUT).map((t) => t.rect));
    expect(CLICKABLES).toHaveLength(2 + things.length);
  });

  it('are pressed where they are drawn, naming their kind', () => {
    for (const item of things) {
      const pressed = pressedAt(middle(item.rect));
      expect(pressed).toBe(item);
      expect(clickableAt(middle(item.rect))).toBe('thing');
    }
  });

  it('have a button named after the thing', () => {
    const labels = things.map((item) => item.label);
    expect(labels).toContain('たるを しらべる');
    expect(labels).toContain('つぼを しらべる');
    for (const label of labels) expect(label).toMatch(/^[\u3040-\u30ff]+を しらべる$/u);
  });

  it('leave the king and the pet to be pressed', () => {
    for (const front of CLICKABLES.slice(0, 2)) expect(pressedAt(middle(front.rect))).toBe(front);
  });
});

describe('clickablesWith', () => {
  it('puts the things behind the king and the pet (front first)', () => {
    const [thing] = thingsIn(SELECTED_LAYOUT);
    if (thing === undefined || PET_RECT === null) throw new Error('no thing or no pet');
    const [king] = clickablesWith(null);
    if (king === undefined) throw new Error('no king');
    const under = { kind: thing.kind, rect: king.rect };
    expect(pressedAt(middle(king.rect), clickablesWith(PET_RECT, [under]))?.id).toBe('king');
    expect(pressedAt(middle(king.rect), clickablesWith(null, [under]))?.id).toBe('king');
    expect(clickablesWith(null, [thing]).map((item) => item.id)).toEqual(['king', 'thing']);
  });

  it('has only the king and the pet without things', () => {
    expect(clickablesWith(PET_RECT).map((item) => item.id)).toEqual(['king', 'dog']);
  });
});

describe('pressedAt', () => {
  it('finds nothing for no point or off everything', () => {
    expect(pressedAt(null)).toBeNull();
    expect(pressedAt({ x: -1, y: -1 })).toBeNull();
  });
});

describe('rovingIndex', () => {
  it('moves along the row with the arrows, round the ends', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(rovingIndex(1, 'ArrowDown', 3)).toBe(2);
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(rovingIndex(2, 'ArrowUp', 3)).toBe(1);
  });

  it('goes to the ends on Home and End', () => {
    expect(rovingIndex(1, 'Home', 3)).toBe(0);
    expect(rovingIndex(1, 'End', 3)).toBe(2);
  });

  it('stays on one button', () => {
    expect(rovingIndex(0, 'ArrowRight', 1)).toBe(0);
    expect(rovingIndex(0, 'ArrowLeft', 1)).toBe(0);
  });

  it('leaves other keys (Tab, Enter, Space) and an empty row alone', () => {
    for (const key of ['Tab', 'Enter', ' ', 'a']) expect(rovingIndex(1, key, 3)).toBeNull();
    expect(rovingIndex(0, 'ArrowRight', 0)).toBeNull();
  });
});

describe('pressStyle', () => {
  it('places the button in % of the canvas', () => {
    expect(pressStyle({ left: 0, top: 0, right: 512, bottom: 288 })).toEqual({
      left: '0%',
      top: '0%',
      width: '50%',
      height: '50%',
    });
  });
});
