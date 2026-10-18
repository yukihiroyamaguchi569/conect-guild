import { describe, expect, it } from 'vitest';
import { CLICKABLES, clickableAt, clickablesWith } from './clickables';
import { PET_DECOR } from './idleSpots';
import { LAYOUTS, SELECTED_LAYOUT } from './layouts';
import { BUBBLE, DETAIL_SCALE, OVERHEAD_OFFSET, TILE_SIZE, TRINKETS } from './metrics';
import {
  barkBox,
  barkClear,
  barkFeet,
  createPetting,
  isPetted,
  mayPet,
  PET_RECT,
  petRectIn,
  pettedAfterHalt,
  pettedUntil,
} from './petting';
import { bubbleBox } from './overhead';
import { PET_AWAKE_DECOR, PET_WAG_DECOR, petLookAt, petPoseAt, wagDecorAt } from './trinkets';

/** The pet clicked (Issue #186): where it is pressed, how long it is up, and what it shows. */

const LIVE = { halted: false, paused: false } as const;

function middle(rect: { left: number; top: number; right: number; bottom: number }) {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

describe('where the pet is pressed', () => {
  it('is the tile the pet is drawn on, in every layout', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const pet = layout.decor.find((item) => item.name === PET_DECOR);
      if (pet === undefined) throw new Error('a layout without its pet');
      expect(petRectIn(layout)).toEqual({
        left: pet.col * TILE_SIZE,
        top: pet.row * TILE_SIZE,
        right: (pet.col + 1) * TILE_SIZE,
        bottom: (pet.row + 1) * TILE_SIZE,
      });
    }
    expect(PET_RECT).toEqual(petRectIn(SELECTED_LAYOUT));
  });

  it('is nowhere in a layout without a pet, and only the king can be pressed then', () => {
    const noPet = {
      ...SELECTED_LAYOUT,
      decor: SELECTED_LAYOUT.decor.filter((item) => item.name !== PET_DECOR),
    };
    expect(petRectIn(noPet)).toBeNull();
    expect(clickablesWith(null).map((item) => item.id)).toEqual(['king']);
    if (PET_RECT === null) throw new Error('no pet');
    expect(clickableAt(middle(PET_RECT), clickablesWith(null))).toBeNull();
  });

  it('presses the pet on it, its edges as the king’s, and nothing just off it', () => {
    if (PET_RECT === null) throw new Error('no pet');
    const dog = CLICKABLES.find((item) => item.id === 'dog');
    expect(dog).toEqual({ id: 'dog', rect: PET_RECT, label: '犬をなでる' });
    expect(clickableAt(middle(PET_RECT))).toBe('dog');
    expect(clickableAt({ x: PET_RECT.left, y: PET_RECT.top })).toBe('dog');
    expect(clickableAt({ x: PET_RECT.right, y: middle(PET_RECT).y })).toBeNull();
    expect(clickableAt({ x: middle(PET_RECT).x, y: PET_RECT.bottom })).toBeNull();
    expect(clickableAt({ x: middle(PET_RECT).x, y: PET_RECT.top - 1 })).toBeNull();
  });

  it('puts the king in front where the two would overlap', () => {
    const [king] = CLICKABLES;
    if (king === undefined) throw new Error('no king');
    // A pet drawn over the king's frame: the king is pressed.
    const over = clickablesWith(king.rect);
    expect(over.map((item) => item.id)).toEqual(['king', 'dog']);
    expect(clickableAt(middle(king.rect), over)).toBe('king');
    // In the layouts they do not overlap: the pet's middle presses the pet.
    if (PET_RECT === null) throw new Error('no pet');
    expect(clickableAt(middle(PET_RECT))).toBe('dog');
  });
});

describe('when a press wakes the pet', () => {
  it('drops it while halted or while drawing would not be seen', () => {
    expect(mayPet(LIVE)).toBe(true);
    expect(mayPet({ ...LIVE, halted: true })).toBe(false);
    expect(mayPet({ ...LIVE, paused: true })).toBe(false);
  });

  it('wakes it for pettedMs from the press, and a dropped press changes nothing', () => {
    expect(pettedUntil(null, LIVE, 1_000)).toBe(1_000 + TRINKETS.pettedMs);
    expect(pettedUntil(null, { ...LIVE, halted: true }, 1_000)).toBeNull();
    expect(pettedUntil(4_000, { ...LIVE, paused: true }, 3_000)).toBe(4_000);
  });

  it('keeps it up until then, not on a halted screen', () => {
    const until = 1_000 + TRINKETS.pettedMs;
    expect(isPetted(null, 0, false)).toBe(false);
    expect(isPetted(until, 1_000, false)).toBe(true);
    expect(isPetted(until, until - 1, false)).toBe(true);
    expect(isPetted(until, until, false)).toBe(false);
    expect(isPetted(until, 1_000, true)).toBe(false);
  });

  it('only lengthens the time up when pressed again', () => {
    const petting = createPetting();
    expect(petting.isPetted(0, false)).toBe(false);
    expect(petting.press(LIVE, 0)).toBe(true);
    expect(petting.press(LIVE, 2_000)).toBe(true);
    expect(petting.isPetted(TRINKETS.pettedMs, false)).toBe(true);
    expect(petting.isPetted(2_000 + TRINKETS.pettedMs - 1, false)).toBe(true);
    expect(petting.isPetted(2_000 + TRINKETS.pettedMs, false)).toBe(false);
  });

  it('keeps it up through a dropped press, and wakes it on none', () => {
    const petting = createPetting();
    expect(petting.press({ ...LIVE, halted: true }, 0)).toBe(false);
    expect(petting.isPetted(0, false)).toBe(false);
    petting.press(LIVE, 0);
    expect(petting.press({ ...LIVE, paused: true }, 1_000)).toBe(false);
    expect(petting.isPetted(TRINKETS.pettedMs - 1, false)).toBe(true);
    expect(petting.isPetted(TRINKETS.pettedMs, false)).toBe(false);
  });
});

describe('a halt while the pet is up', () => {
  it('puts it to sleep for good: it does not wake again once the halt is over', () => {
    expect(pettedAfterHalt(3_000, true)).toBeNull();
    expect(pettedAfterHalt(3_000, false)).toBe(3_000);
    const petting = createPetting();
    petting.press(LIVE, 0);
    petting.setHalted(true);
    petting.setHalted(false);
    expect(petting.isPetted(1, false)).toBe(false);
    expect(petting.isPetted(TRINKETS.pettedMs - 1, false)).toBe(false);
  });

  it('leaves it up through parties that are not halted', () => {
    const petting = createPetting();
    petting.press(LIVE, 0);
    petting.setHalted(false);
    expect(petting.isPetted(TRINKETS.pettedMs - 1, false)).toBe(true);
  });
});

describe('the pet up from a press', () => {
  it('wags its tail from one side to the other every wagMs', () => {
    const [left, right] = PET_WAG_DECOR;
    expect(wagDecorAt(0)).toBe(left);
    expect(wagDecorAt(TRINKETS.wagMs - 1)).toBe(left);
    expect(wagDecorAt(TRINKETS.wagMs)).toBe(right);
    expect(wagDecorAt(2 * TRINKETS.wagMs)).toBe(left);
    const shown = new Set<string>();
    for (let t = 0; t < TRINKETS.pettedMs; t += 10) shown.add(wagDecorAt(t));
    expect(shown).toEqual(new Set([left, right]));
  });

  it('wags whether it slept or had company, and is as before otherwise', () => {
    const asleep = TRINKETS.petSitMs;
    for (const petCompany of [false, true]) {
      expect(petLookAt('sleeping-poodle', 0, asleep, { petCompany, petted: true })).toEqual({
        name: wagDecorAt(asleep),
        dy: 0,
      });
      expect(petLookAt('sleeping-poodle', 0, asleep, { petCompany, petted: false })).toEqual(
        petPoseAt('sleeping-poodle', 0, asleep, petCompany),
      );
    }
    expect(petLookAt('sleeping-poodle', 0, asleep, { petCompany: true, petted: false }).name).toBe(
      PET_AWAKE_DECOR,
    );
  });

  it('says 「わん」 with the bubble’s tail ending just over its head', () => {
    if (PET_RECT === null) throw new Error('no pet');
    const feet = barkFeet(PET_RECT);
    expect(feet.x).toBe(middle(PET_RECT).x);
    // drawBubble puts the box's bottom OVERHEAD_OFFSET over the feet; the tail goes on below it.
    const tailEnd = feet.y - OVERHEAD_OFFSET + BUBBLE.tailRows * DETAIL_SCALE;
    expect(tailEnd).toBe(PET_RECT.top + 5);
  });

  it('says it only clear of the bubbles over the members: the king’s words come first', () => {
    if (PET_RECT === null) throw new Error('no pet');
    const [king] = CLICKABLES;
    if (king === undefined) throw new Error('no king');
    expect(barkClear(PET_RECT, [])).toBe(true);
    // The king's 「ゴニョゴニョ」 over the throne reaches over the pet.
    const kingFeet = { x: middle(king.rect).x, y: king.rect.bottom };
    const call = bubbleBox(kingFeet, { voice: 'whisper', chars: 6 }, 'right', 0);
    expect(barkClear(PET_RECT, [call])).toBe(false);
    // A bubble that only touches its edge, or is elsewhere, does not hide it.
    const bark = barkBox(PET_RECT);
    const beside = { left: bark.right, right: bark.right + 40, top: bark.top, bottom: bark.bottom };
    expect(barkClear(PET_RECT, [beside])).toBe(true);
  });
});
