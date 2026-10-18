import { describe, expect, it } from 'vitest';
import {
  CLICKABLES,
  memberClickables,
  pressedAt,
  rewardClickables,
  visitorClickables,
  visitorDoorClickables,
  withMembers,
} from './clickables';
import { SPRITE_SIZE } from './metrics';
import { tileToPoint } from './path';
import { DOOR } from './visitors';

/** The visitor on the canvas (Issue #212). */

const middle = (rect: { left: number; top: number; right: number; bottom: number }) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

describe('visitorClickables', () => {
  it('is the frame of the visitor where it was drawn, named after its kind', () => {
    expect(visitorClickables({ kind: 'bard', feet: { x: 300, y: 200 } })).toEqual([
      {
        id: 'visitor',
        kind: 'bard',
        rect: { left: 300 - SPRITE_SIZE / 2, top: 200 - SPRITE_SIZE, right: 340, bottom: 200 },
        label: '吟遊詩人に話しかける',
      },
    ]);
    expect(visitorClickables({ kind: 'fortune', feet: { x: 0, y: 0 } })[0]?.label).toBe(
      '占い師のおばあさんに話しかける',
    );
  });

  it('is nothing with no visitor in the room', () => {
    expect(visitorClickables(null)).toEqual([]);
    expect(visitorDoorClickables(null)).toEqual([]);
  });

  it('has its keyboard button over the door it comes in by', () => {
    const [button] = visitorDoorClickables('postman');
    expect(button).toMatchObject({ id: 'visitor', kind: 'postman', label: '郵便屋に話しかける' });
    expect(button?.rect.bottom).toBe(tileToPoint(DOOR).y);
  });
});

describe('the visitor among the other things to press', () => {
  it('is pressed in front of a member it walks past, behind the reward on a desk', () => {
    const [reward] = rewardClickables({ member: 'minori', kind: 'medal', until: 1 });
    if (reward === undefined) throw new Error('no reward');
    const at = middle(reward.rect);
    const feet = { x: at.x, y: reward.rect.bottom };
    const visitor = visitorClickables({ kind: 'merchant', feet });
    const members = memberClickables([{ id: 'hibiki', point: feet }]);
    const front = (items: readonly (typeof reward)[]) =>
      pressedAt(at, withMembers(CLICKABLES, [...items, ...members]))?.id;
    expect(front([...visitor])).toBe('visitor');
    expect(front([reward, ...visitor])).toBe('reward');
  });

  it('leaves the king and the pet in front', () => {
    for (const item of CLICKABLES.slice(0, 2)) {
      const feet = { x: middle(item.rect).x, y: item.rect.bottom };
      const items = withMembers(CLICKABLES, visitorClickables({ kind: 'bard', feet }));
      expect(pressedAt(middle(item.rect), items)).toBe(item);
    }
  });
});
