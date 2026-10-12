import { describe, expect, it } from 'vitest';
import type { MemberId } from '../guild.config';
import { LOGICAL_WIDTH } from './map';
import { LINES } from './metrics';
import { carry, raise, type Held } from './motion';
import { bubbleBox, meet, tagBox, WINDOWS, type OverheadSources } from './overhead';
import { bodyBox, placedBox, placeOverheads, wordsTop, type OverheadMember } from './overheadPlace';
import type { Point } from './path';

const NOTHING: OverheadSources = { speeches: {}, lines: {}, remarks: {}, bubbles: {}, murmurs: {} };

function member(id: MemberId, point: Point, held: Held | null = null): OverheadMember {
  return { id, pose: { point, held }, inScene: held !== null, mark: null };
}

/** In the open middle of the room, clear of the HTML windows and the edges. */
const OPEN = { x: 500, y: 400 };
const minori = member('minori', OPEN, raise('scroll'));
const says = { ...NOTHING, lines: { minori: 'おまかせを' } } as const;

function placedOf(members: readonly OverheadMember[], sources: OverheadSources = says) {
  const one = placeOverheads(members, sources, []).find((p) => p.id === 'minori');
  if (one === undefined) throw new Error('nothing over minori');
  return one;
}

describe('placeOverheads: words said holding an item up (Issue #77)', () => {
  it('go beside the item on the right, at the head’s height (not lifted)', () => {
    const placed = placedOf([minori]);
    expect(placed.spot).toBe('beside-right');
    expect(placed.feet).toEqual(OPEN);
    // Clear of the raised item, which is 16 px each side of the middle over the head.
    expect(placedBox(placed).left).toBeGreaterThan(OPEN.x);
  });

  it('go on the left when another member stands on the right', () => {
    const kaname = member('kaname', { x: OPEN.x + 40, y: OPEN.y - 20 });
    expect(
      meet(
        bubbleBox(OPEN, { voice: 'say', chars: 5 }, 'beside-right', 0),
        bodyBox(kaname.pose.point),
      ),
    ).toBe(true);
    const placed = placedOf([minori, kaname]);
    expect(placed.spot).toBe('beside-left');
    expect(meet(placedBox(placed), bodyBox(kaname.pose.point))).toBe(false);
  });

  it('go on the left when the right meets a 「Lv N」 tag', () => {
    const right = bubbleBox(OPEN, { voice: 'say', chars: 5 }, 'beside-right', 0);
    const tag = { text: 'Lv 9', x: right.right - 10, y: right.top + 10 };
    const placed = placeOverheads([minori], says, [tag]).find((p) => p.id === 'minori');
    expect(placed?.spot).toBe('beside-left');
    if (placed !== undefined) expect(meet(placedBox(placed), tagBox(tag))).toBe(false);
  });

  it('go on the left when the right meets another member’s bubble, placed first', () => {
    // Low enough that the body is clear of the words, its waiting bubble is not.
    const hibiki = member('hibiki', { x: OPEN.x + 40, y: OPEN.y + 40 });
    expect(
      meet(
        bubbleBox(OPEN, { voice: 'say', chars: 5 }, 'beside-right', 0),
        bodyBox(hibiki.pose.point),
      ),
    ).toBe(false);
    const sources = { ...says, bubbles: { hibiki: 'awaiting-permission' } } as const;
    const all = placeOverheads([minori, hibiki], sources, []);
    expect(all.map((p) => p.id)).toEqual(['minori', 'hibiki']);
    const [words, waiting] = all;
    if (words === undefined || waiting === undefined) throw new Error('missing');
    expect(words.spot).toBe('beside-left');
    expect(meet(placedBox(words), placedBox(waiting))).toBe(false);
  });
});

describe('placeOverheads: words held up near the windows and the edges', () => {
  it('go on the left when the right is under an HTML window', () => {
    const near = { x: WINDOWS[1]?.left ?? 0, y: 400 };
    const right = bubbleBox(near, { voice: 'say', chars: 5 }, 'beside-right', 0);
    expect(WINDOWS.some((w) => meet(right, w))).toBe(true);
    expect(placedOf([member('minori', near, raise('chest'))]).spot).toBe('beside-left');
  });

  it('go on the left when the right would leave the canvas', () => {
    const edge = { x: LOGICAL_WIDTH - 24, y: 480 };
    expect(placedOf([member('minori', edge, raise('chest'))]).spot).toBe('beside-left');
  });

  it('go over the item, lifted as before, when neither side is free', () => {
    const left = member('kaname', { x: OPEN.x - 40, y: OPEN.y - 20 });
    const right = member('hibiki', { x: OPEN.x + 40, y: OPEN.y - 20 });
    const placed = placedOf([minori, left, right]);
    expect(placed.spot).toBe('right');
    expect(placed.feet).toEqual({ x: OPEN.x, y: OPEN.y - LINES.raisedLiftPx });
  });

  it('leave a waiting sign over a raised item (no words: no beside)', () => {
    const sources = { ...NOTHING, bubbles: { minori: 'awaiting-president' } } as const;
    const standing = { ...minori, inScene: false };
    const placed = placedOf([standing], sources);
    expect(placed.spot).toBe('right');
    expect(placed.feet.y).toBe(OPEN.y - LINES.raisedLiftPx);
  });
});

describe('placeOverheads: everything else', () => {
  it('puts words over the head when nothing is held up, or the item is carried', () => {
    for (const held of [null, carry('chest')]) {
      const placed = placedOf([member('minori', OPEN, held)]);
      expect(placed).toMatchObject({ spot: 'right', feet: OPEN });
    }
  });

  it('places nothing for a member with nothing over the head, in the members’ order', () => {
    const sources = {
      ...NOTHING,
      lines: { kaname: 'はい、どうぞ', minori: 'おまかせを' },
    } as const;
    const members = [member('kaname', { x: 300, y: 400 }), member('hibiki', OPEN), minori];
    expect(placeOverheads(members, sources, []).map((p) => p.id)).toEqual(['kaname', 'minori']);
  });

  it('gives the 「Z」 of a sleeper no bubble', () => {
    const asleep = { ...member('minori', OPEN), mark: { kind: 'z', rise: 0.3 } } as const;
    const placed = placedOf([asleep], NOTHING);
    expect(placed.bubble).toBeNull();
    const box = placedBox(placed);
    expect(box.right - box.left).toBe(0);
  });
});

describe('wordsTop', () => {
  it('gives the top of the words of the call or a line, null for a sign or a murmur', () => {
    const at = member('minori', OPEN);
    const top = (sources: OverheadSources, id: MemberId = 'minori') =>
      wordsTop(placeOverheads([at], sources, []), id);
    const line = placeOverheads([at], says, [])[0];
    if (line === undefined) throw new Error('no line');
    expect(top(says)).toBe(placedBox(line).top);
    expect(top({ ...NOTHING, speeches: { minori: 'はっ！' } })).toBe(placedBox(line).top);
    expect(top({ ...NOTHING, murmurs: { minori: 'ぱちぱち…' } })).toBeNull();
    expect(top({ ...NOTHING, bubbles: { minori: 'awaiting-kaname' } })).toBeNull();
    expect(top(says, 'kaname')).toBeNull();
  });
});
