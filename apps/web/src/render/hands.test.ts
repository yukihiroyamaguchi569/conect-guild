import { describe, expect, it } from 'vitest';
import { memberIdSchema } from '@conect-guild/snapshot/settings';
import { HANDS, hasHoldFrames, heldLook, holdFrameOf } from './hands';
import { HOLD, OVERHEAD_OFFSET, SPRITE_SIZE } from './metrics';
import { carry, heldItemPoint, raise, type MoveFrame, type Pose } from './motion';

const pose = (frame: MoveFrame, flip = false): Pose => ({
  point: { x: 300, y: 200 },
  frame,
  flip,
  held: null,
});

describe('hasHoldFrames', () => {
  it('needs all 7 frames (560 px); the 4-frame sheets (320 px) have none', () => {
    expect(hasHoldFrames(7 * SPRITE_SIZE)).toBe(true);
    expect(hasHoldFrames(4 * SPRITE_SIZE)).toBe(false);
    expect(hasHoldFrames(7 * SPRITE_SIZE - 1)).toBe(false);
    expect(hasHoldFrames(0)).toBe(false);
  });
});

describe('holdFrameOf', () => {
  it('raises with both hands up, whichever way the member faced', () => {
    for (const frame of [0, 1, 2, 3] as const) expect(holdFrameOf(frame, 'raise')).toBe(4);
  });

  it('carries facing front when standing front, sideways otherwise', () => {
    expect(holdFrameOf(0, 'carry')).toBe(5);
    for (const frame of [1, 2, 3] as const) expect(holdFrameOf(frame, 'carry')).toBe(6);
  });
});

describe('heldLook with the holding frames', () => {
  it('raises the item over the head in frame 4, never mirrored', () => {
    const look = heldLook('kaname', pose(0, true), raise('chest'), true);
    expect(look).toEqual({
      frame: 4,
      flip: false,
      feet: { x: 300, y: 200 },
      item: { x: 300 + HANDS.kaname[4].forward, y: 200 - HANDS.kaname[4].up },
    });
  });

  it('carries it in the middle in frame 5 when standing front', () => {
    const look = heldLook('minori', pose(0), carry('chest'), true);
    expect([look.frame, look.flip]).toEqual([5, false]);
    expect(look.item).toEqual({ x: 300 + HANDS.minori[5].forward, y: 200 - HANDS.minori[5].up });
  });

  it('carries it forward in frame 6 when walking, mirrored to face left', () => {
    const right = heldLook('hirame', pose(2), carry('scroll'), true);
    expect([right.frame, right.flip, right.item.x]).toEqual([
      6,
      false,
      300 + HANDS.hirame[6].forward,
    ]);
    const left = heldLook('hirame', pose(2, true), carry('scroll'), true);
    expect([left.frame, left.flip, left.item.x]).toEqual([6, true, 300 - HANDS.hirame[6].forward]);
  });

  it('bobs on every other walking step, the item with the body', () => {
    const down = heldLook('sasae', pose(2), carry('chest'), true);
    const up = heldLook('sasae', pose(3), carry('chest'), true);
    expect(down.feet.y - up.feet.y).toBe(HOLD.walkBobPx);
    expect(down.item.y - up.item.y).toBe(HOLD.walkBobPx);
    expect(heldLook('sasae', pose(1), carry('chest'), true).feet.y).toBe(200);
  });

  it('uses the hands measured on each member’s frames', () => {
    // Raised: the item's bottom on the top of the hands (ひらめ's reach the top of the frame).
    expect(HANDS.hirame[4].up - HOLD.raisedItemHalfPx).toBe(74);
    expect(HANDS.kaname[4].up - HOLD.raisedItemHalfPx).toBe(69);
    expect(HANDS.hibiki[5]).toEqual({ up: 34, forward: 1 });
    expect(HANDS.minori[5]).toEqual({ up: 31, forward: -1 });
    expect(HANDS.hibiki[6]).toEqual({ up: 35, forward: 21 });
    expect(HANDS.yukihiro[6]).toEqual({ up: 32, forward: 15 });
    // たくみ and むすび: assets/sprites/hands-new4.json (2026-10-14).
    expect(HANDS.takumi[4].up - HOLD.raisedItemHalfPx).toBe(67);
    expect(HANDS.musubi[5]).toEqual({ up: 34, forward: 2 });
    expect(HANDS.takumi[6]).toEqual({ up: 32, forward: 12 });
  });

  it('reads each member’s own hand table', () => {
    for (const id of memberIdSchema.options) {
      for (const frame of [4, 5, 6] as const) {
        expect(HANDS[id][frame].up).toBeGreaterThan(0);
        expect(HANDS[id][frame].up).toBeLessThanOrEqual(OVERHEAD_OFFSET + HOLD.raisedItemHalfPx);
      }
      // Raised over the head, carried far below it.
      expect(HANDS[id][4].up).toBeGreaterThan(2 * HANDS[id][5].up);
      // The front frames hold the item about the middle; frame 6 well forward.
      expect(HANDS[id][4].forward).toBe(0);
      // (むすび's arms hold it 2 px right of the middle.)
      expect(Math.abs(HANDS[id][5].forward)).toBeLessThanOrEqual(2);
      expect(HANDS[id][6].forward).toBeGreaterThan(10);
    }
  });
});

describe('heldLook without the holding frames (4-frame sheets)', () => {
  it.each([0, 1, 2, 3] as const)('keeps frame %i and places the item as before', (frame) => {
    for (const flip of [false, true]) {
      for (const held of [carry('chest'), raise('scroll')]) {
        const p = pose(frame, flip);
        expect(heldLook('kaname', p, held, false)).toEqual({
          frame,
          flip,
          feet: p.point,
          item: heldItemPoint(p, held.hold),
        });
      }
    }
  });

  it('still carries sideways at the hands, in front of the facing side', () => {
    const look = heldLook('kaname', pose(2, true), carry('chest'), false);
    expect(look.item).toEqual({ x: 300 - HOLD.carryForwardPx, y: 200 - HOLD.carryHeightPx });
  });
});
