import { describe, expect, it, vi } from 'vitest';
import type { MemberId } from '../guild.config';
import { createCalls } from './calls';
import { EMPTY_DIRECTOR, frameAt, type StageFrame } from './director';
import { DEFAULT_SEATS } from './scenes';
import { summonsEnd } from './summons';

/** The king's calls on the stage (Issue #28): who is reported active, and when a call starts. */

const WALL = 1_700_000_000_000;
const END = summonsEnd({ start: 0, members: [] });

function setup() {
  const onActive = vi.fn<(ids: readonly MemberId[], at: number) => void>();
  const onCallStart = vi.fn<() => void>();
  const calls = createCalls({ wallNow: () => WALL, onActive, onCallStart });
  const frame: StageFrame = frameAt(EMPTY_DIRECTOR, 0, DEFAULT_SEATS);
  return { calls, frame, onActive, onCallStart };
}

describe('createCalls: idle times', () => {
  it('reports nobody active when a call is added or while it plays (sleepers stay put)', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori'], 0);
    calls.view(() => frame, 0);
    calls.view(() => frame, END - 1);
    expect(onActive).not.toHaveBeenCalled();
  });

  it('waits for the last call of a row before reporting the king (he stays put through all)', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori'], 0);
    calls.add(['sasae'], 0);
    calls.view(() => frame, END);
    expect(onActive).not.toHaveBeenCalled();
    calls.view(() => frame, 2 * END);
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledWith(['yukihiro'], WALL);
  });

  it('reports only the king active once the call is over, never the members', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori', 'kaname'], 0);
    calls.view(() => frame, END);
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onActive).toHaveBeenCalledWith(['yukihiro'], WALL);
    calls.view(() => frame, END + 1);
    expect(onActive).toHaveBeenCalledTimes(1);
  });
});

describe('createCalls: starts', () => {
  it('reports a call when it starts on the stage, once', () => {
    const { calls, frame, onCallStart } = setup();
    calls.add(['kaname'], 100);
    expect(onCallStart).not.toHaveBeenCalled();
    calls.view(() => frame, 100);
    calls.view(() => frame, 200);
    expect(onCallStart).toHaveBeenCalledTimes(1);
  });

  it('reports the second call of a row when it starts, not when it is added', () => {
    const { calls, frame, onCallStart } = setup();
    calls.add(['kaname'], 0);
    calls.view(() => frame, 0);
    calls.add(['sasae'], 10);
    calls.view(() => frame, 10);
    calls.view(() => frame, END - 1);
    expect(onCallStart).toHaveBeenCalledTimes(1);
    calls.view(() => frame, END);
    expect(onCallStart).toHaveBeenCalledTimes(2);
  });

  it('says whether calls go on, and hands back the words', () => {
    const { calls, frame } = setup();
    expect(calls.view(() => frame, 0).calling).toBe(false);
    calls.add(['kaname'], 0);
    const view = calls.view(() => frame, 0);
    expect(view.calling).toBe(true);
    expect(view.speeches).toEqual({ yukihiro: '！' });
    expect(calls.view(() => frame, END).calling).toBe(false);
  });
});

describe('createCalls: halted', () => {
  it('drops the call playing and those to come, and takes none while halted', () => {
    const { calls, frame, onCallStart, onActive } = setup();
    calls.add(['kaname'], 0);
    calls.add(['sasae'], 0);
    calls.view(() => frame, 0);
    calls.setHalted(true);
    expect(calls.view(() => frame, 10)).toMatchObject({ speeches: {}, calling: false });
    calls.add(['minori'], 20);
    expect(calls.view(() => frame, 20).calling).toBe(false);
    calls.setHalted(false);
    expect(calls.view(() => frame, END).calling).toBe(false);
    expect(onCallStart).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();
    calls.add(['minori'], 3 * END);
    expect(calls.view(() => frame, 3 * END).speeches).toEqual({ yukihiro: '！' });
  });
});

describe('createCalls: holds after a halt', () => {
  it('forgets where the king was held, so a call after the halt holds him where it finds him', () => {
    const { calls, frame } = setup();
    calls.add(['kaname'], 0);
    calls.view(() => frame, 0);
    calls.setHalted(true);
    calls.setHalted(false);
    // The next call starts right when the dropped one would have ended.
    calls.add(['sasae'], END);
    const sunk: StageFrame = {
      ...frame,
      members: frame.members.map((m) =>
        m.id === 'yukihiro'
          ? { ...m, pose: { ...m.pose, point: { x: m.pose.point.x, y: m.pose.point.y + 4 } } }
          : m,
      ),
    };
    // Past the "！" (when he rises a little), in the murmur.
    const king = calls.view(() => sunk, END + 1_000).frame.members.find((m) => m.id === 'yukihiro');
    const before = sunk.members.find((m) => m.id === 'yukihiro');
    expect(king?.pose.point).toEqual(before?.pose.point);
  });
});

describe('createCalls: the end of a call', () => {
  it('wakes the king before the frame of the end is built (no frame asleep again)', () => {
    const { calls, frame, onActive } = setup();
    calls.add(['minori'], 0);
    calls.view(() => frame, 0);
    const activeWhenBuilt: number[] = [];
    calls.view(() => {
      activeWhenBuilt.push(onActive.mock.calls.length);
      return frame;
    }, END);
    expect(activeWhenBuilt).toEqual([1]);
  });
});

describe('createCalls: add', () => {
  it('adds a call only when it can be seen and the screen is live, and says so', () => {
    const { calls, frame } = setup();
    expect(calls.add(['kaname'], null)).toBeNull();
    expect(calls.add([], 0)).toBeNull();
    calls.setHalted(true);
    expect(calls.add(['kaname'], 0)).toBeNull();
    calls.setHalted(false);
    expect(calls.view(() => frame, 0).calling).toBe(false);
    expect(calls.add(['kaname'], 0)).toEqual({ start: 0, members: ['kaname'] });
    expect(calls.view(() => frame, 0).calling).toBe(true);
  });
});
