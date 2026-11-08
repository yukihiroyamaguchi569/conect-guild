import { describe, expect, it } from 'vitest';
import { ACTIVE_MEMBER_IDS, type MemberId } from '../guild.config';
import {
  CARD_BACK,
  CARD_FRAMES,
  CARD_PICTURES,
  cardArtOf,
  taskPictureOf,
  type CardBox,
} from './questCardArt';

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

describe('taskPictureOf (Issue #271)', () => {
  const index = {
    cards: [
      { number: 7, updatedAt: 1_700_000_000_000 },
      { number: 101, updatedAt: 42 },
    ],
  };

  it('is the listed quest’s picture, with the time it was drawn', () => {
    expect(taskPictureOf(index, 101, '/cards/')).toBe('/cards/101.png?v=42');
    expect(taskPictureOf(index, 7, '/base/cards/')).toBe('/base/cards/7.png?v=1700000000000');
  });

  it('is null for a quest not listed, an empty list or no list', () => {
    expect(taskPictureOf(index, 102, '/cards/')).toBeNull();
    expect(taskPictureOf({ cards: [] }, 101, '/cards/')).toBeNull();
    expect(taskPictureOf(null, 101, '/cards/')).toBeNull();
  });
});

describe('cardArtOf with a quest’s own picture (Issue #271)', () => {
  it('shows it in place of the member’s, keeping the frame', () => {
    expect(cardArtOf({ id: 'minori', crown: false }, '/cards/1.png?v=1')).toEqual({
      frame: CARD_FRAMES.department,
      picture: '/cards/1.png?v=1',
    });
    expect(cardArtOf({ id: 'yukihiro', crown: true }, '/cards/2.png?v=1').frame).toBe(
      CARD_FRAMES.crown,
    );
  });

  it('falls back to the member’s picture without one', () => {
    expect(cardArtOf({ id: 'minori', crown: false }, null).picture).toBe(CARD_PICTURES.minori);
  });
});
