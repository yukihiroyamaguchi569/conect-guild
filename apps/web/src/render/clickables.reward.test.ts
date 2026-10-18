import { describe, expect, it } from 'vitest';
import { MEMBERS } from '../guild.config';
import {
  CLICKABLES,
  MEMBER_SEAT_CLICKABLES,
  memberClickables,
  pressedAt,
  pressKey,
  rewardClickables,
  roomPresses,
  withMembers,
} from './clickables';
import { SELECTED_LAYOUT } from './layouts';
import { rewardOnDesk, type StageReward } from './rewardDesk';
import { DEFAULT_SEATS } from './scenes';

/** The reward of the day on a desk, to press (Issue #213). */

const middle = (rect: { left: number; top: number; right: number; bottom: number }) => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

const MEDAL: StageReward = { member: 'minori', kind: 'medal', until: 1 };

describe('rewardClickables', () => {
  it('is the reward where it is drawn, 48 px square (1.5 times a tile, Issue #208)', () => {
    const placed = rewardOnDesk(SELECTED_LAYOUT, DEFAULT_SEATS.minori, 'medal');
    if (placed === null) throw new Error('no desk for minori');
    expect(rewardClickables(MEDAL)).toEqual([
      {
        id: 'reward',
        reward: MEDAL,
        rect: { left: placed.x, top: placed.y, right: placed.x + 48, bottom: placed.y + 48 },
        label: `${MEMBERS.minori.name}の くんしょうを みる`,
      },
    ]);
  });

  it('names each kind on the button', () => {
    const label = (kind: StageReward['kind']) =>
      rewardClickables({ ...MEDAL, member: 'sasae', kind })[0]?.label;
    expect(label('onigiri')).toBe(`${MEMBERS.sasae.name}の おにぎりを みる`);
    expect(label('dango')).toBe(`${MEMBERS.sasae.name}の おだんごを みる`);
  });

  it('is nothing without a reward', () => {
    expect(rewardClickables(null)).toEqual([]);
  });
});

describe('the reward among the other things to press', () => {
  const [reward] = rewardClickables(MEDAL);
  if (reward === undefined) throw new Error('no reward');
  const items = withMembers(CLICKABLES, [reward, ...MEMBER_SEAT_CLICKABLES]);

  it('is pressed in front of a member passing by the desk (it is drawn after them)', () => {
    const at = middle(reward.rect);
    const [passing] = memberClickables([
      { id: 'hibiki', point: { x: at.x, y: reward.rect.bottom } },
    ]);
    if (passing === undefined) throw new Error('no member');
    expect(pressedAt(at, [passing])).toBe(passing);
    expect(pressedAt(at, withMembers(CLICKABLES, [reward, passing]))).toBe(reward);
  });

  it('leaves the member at the desk to be pressed beside it', () => {
    for (const member of MEMBER_SEAT_CLICKABLES)
      expect(pressedAt(middle(member.rect), items)).toBe(member);
  });

  it('comes after the king and the pet and before the members and the things', () => {
    expect(items.map((item) => item.id).slice(0, 4)).toEqual(['king', 'dog', 'reward', 'member']);
    expect(items.at(-1)?.id).toBe('thing');
    for (const front of CLICKABLES.slice(0, 2))
      expect(pressedAt(middle(front.rect), items)).toBe(front);
  });
});

describe('roomPresses', () => {
  const things = CLICKABLES.filter((item) => item.id === 'thing');

  it('puts the reward among the things, top row first and left to right', () => {
    const row = roomPresses(things, rewardClickables(MEDAL));
    expect(row).toHaveLength(things.length + 1);
    const tops = row.map((item) => [item.rect.top, item.rect.left] as const);
    const sorted = [...tops].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(tops).toEqual(sorted);
    expect(row.filter((item) => item.id === 'reward')).toHaveLength(1);
  });

  it('is the things alone, in their order, without a reward', () => {
    expect(roomPresses(things, [])).toEqual(things);
  });
});

describe('pressKey', () => {
  it('tells apart things of one kind by their spot, whatever their place in the row', () => {
    const things = CLICKABLES.filter((item) => item.id === 'thing');
    const keys = things.map(pressKey);
    expect(new Set(keys).size).toBe(things.length);
    const row = roomPresses(things, rewardClickables(MEDAL));
    expect(row.map(pressKey)).toEqual(expect.arrayContaining(keys));
  });
});
