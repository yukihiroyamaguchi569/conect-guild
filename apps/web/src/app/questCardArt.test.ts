import { describe, expect, it } from 'vitest';
import { ACTIVE_MEMBER_IDS, type MemberId } from '../guild.config';
import { CARD_BACK, CARD_FRAMES, CARD_PICTURES, cardArtOf, type CardBox } from './questCardArt';

const ALL_MEMBERS: readonly MemberId[] = [
  'kaname',
  'minori',
  'hibiki',
  'hirame',
  'sasae',
  'takumi',
  'musubi',
  'yukihiro',
];

describe('cardArtOf (Issue #269)', () => {
  it.each(ALL_MEMBERS)('shows %s’s own picture in the department frame', (id) => {
    const art = cardArtOf({ id, crown: false });
    // The file of that member, not only the table's entry (two swapped entries would pass that).
    expect(art.picture).toMatch(new RegExp(`ill-${id}[^/]*\\.webp$`));
    expect(art.frame).toBe(CARD_FRAMES.department);
  });

  it('gives the king the crown frame, gold and not tinted, with his picture', () => {
    const art = cardArtOf({ id: 'yukihiro', crown: true });
    expect(art.frame).toBe(CARD_FRAMES.crown);
    expect(art.frame.tinted).toBe(false);
    expect(art.frame.scroll).toBeNull();
    expect(art.picture).toBe(CARD_PICTURES.yukihiro);
  });

  it('tints the department frame’s metal only: the scroll is a picture of its own', () => {
    expect(CARD_FRAMES.department.tinted).toBe(true);
    expect(CARD_FRAMES.department.scroll).not.toBeNull();
  });

  it('has a distinct picture for every member, the members of the settings included', () => {
    expect(new Set(Object.values(CARD_PICTURES)).size).toBe(ALL_MEMBERS.length);
    for (const id of [...ACTIVE_MEMBER_IDS, 'yukihiro' as const])
      expect(CARD_PICTURES[id]).toBeTruthy();
    expect(CARD_BACK).toMatch(/back.*\.webp/);
  });
});

describe('CARD_FRAMES: the parts sit inside the card, in their order', () => {
  const inside = (box: CardBox) =>
    box.left >= 0 && box.top >= 0 && box.left + box.width <= 100 && box.top + box.height <= 100;

  it.each(Object.entries(CARD_FRAMES))('%s', (_name, frame) => {
    for (const part of [frame.window, frame.cost, frame.band, frame.text])
      expect(inside(part)).toBe(true);
    // Top to bottom: the band (with the cost beside it), the picture's window, the scroll.
    expect(frame.band.top + frame.band.height).toBeLessThanOrEqual(frame.window.top);
    expect(frame.window.top + frame.window.height).toBeLessThanOrEqual(frame.text.top);
    expect(frame.cost.left + frame.cost.width).toBeLessThanOrEqual(frame.band.left);
  });
});
