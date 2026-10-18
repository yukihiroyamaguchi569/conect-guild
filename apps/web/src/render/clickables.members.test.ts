import { describe, expect, it } from 'vitest';
import { ACTIVE_MEMBER_IDS, MEMBERS } from '../guild.config';
import {
  CLICKABLES,
  MEMBER_SEAT_CLICKABLES,
  memberClickables,
  pressedAt,
  seatedSpriteRect,
  withMembers,
} from './clickables';
import { SPRITE_SIZE } from './metrics';
import { DEFAULT_SEATS } from './scenes';

/** The members on the canvas (Issue #191). */

const middle = (rect: { left: number; top: number; right: number; bottom: number }) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

describe('memberClickables', () => {
  it('is the frame of each member but the king where they were drawn', () => {
    const items = memberClickables([
      { id: 'yukihiro', point: { x: 500, y: 100 } },
      { id: 'hibiki', point: { x: 200, y: 300 } },
    ]);
    expect(items).toEqual([
      {
        id: 'member',
        member: 'hibiki',
        rect: { left: 200 - SPRITE_SIZE / 2, top: 300 - SPRITE_SIZE, right: 240, bottom: 300 },
        label: `${MEMBERS.hibiki.name}に話しかける`,
      },
    ]);
    expect(memberClickables([])).toEqual([]);
  });
});

describe('MEMBER_SEAT_CLICKABLES', () => {
  it('has a button over each member but the king at the seat, in the settings order', () => {
    const ids = ACTIVE_MEMBER_IDS.filter((id) => id !== 'yukihiro');
    expect(
      MEMBER_SEAT_CLICKABLES.map((item) => (item.id === 'member' ? item.member : null)),
    ).toEqual(ids);
    for (const item of MEMBER_SEAT_CLICKABLES) {
      if (item.id !== 'member') throw new Error('not a member');
      expect(item.rect).toEqual(seatedSpriteRect(DEFAULT_SEATS[item.member]));
    }
  });
});

describe('withMembers', () => {
  const all = withMembers(CLICKABLES, MEMBER_SEAT_CLICKABLES);

  it('puts the members behind the king and the pet, in front of the things', () => {
    const order = all.map((item) => item.id);
    expect(order.slice(0, 2)).toEqual(['king', 'dog']);
    const firstThing = order.indexOf('thing');
    expect(order.lastIndexOf('member')).toBeLessThan(firstThing);
    expect(all).toHaveLength(CLICKABLES.length + MEMBER_SEAT_CLICKABLES.length);
  });

  it('presses a member over a thing behind them, and the king over everything', () => {
    for (const member of MEMBER_SEAT_CLICKABLES) {
      expect(pressedAt(middle(member.rect), all)).toBe(member);
    }
    const [king] = CLICKABLES;
    if (king === undefined) throw new Error('no king');
    expect(pressedAt(middle(king.rect), all)).toBe(king);
  });
});
