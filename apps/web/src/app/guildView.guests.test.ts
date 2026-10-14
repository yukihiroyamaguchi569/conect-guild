import { describe, expect, it } from 'vitest';
import type { GuestItem, GuestView } from '../domain/guests';
import {
  buildGuestBoard,
  GUEST_BOARD_ITEMS,
  guestCueToPlay,
  guestSparkleAfterHalt,
} from './guildView';

function items(count: number): GuestItem[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `架空の題名 ${String(i + 1)}`,
    isPr: i % 2 === 1,
  }));
}

function guest(index: number, open: GuestItem[] | null): GuestView {
  return {
    index,
    name: `客${String(index)}`,
    state: 'idle',
    repo: open === null ? null : { openIssues: 0, openPrs: 0, open },
  };
}

describe('buildGuestBoard', () => {
  it('is empty without guests', () => {
    expect(buildGuestBoard([])).toEqual([]);
  });

  it('lists the first few open items of each guest and counts the rest', () => {
    const board = buildGuestBoard([guest(0, items(5)), guest(1, items(GUEST_BOARD_ITEMS))]);
    expect(board).toEqual([
      { key: 'guest:0', name: '客0', items: items(5).slice(0, GUEST_BOARD_ITEMS), more: 2 },
      { key: 'guest:1', name: '客1', items: items(GUEST_BOARD_ITEMS), more: 0 },
    ]);
  });

  it('keeps a guest with nothing open, and one with no repository read, apart', () => {
    expect(buildGuestBoard([guest(0, []), guest(1, null)])).toEqual([
      { key: 'guest:0', name: '客0', items: [], more: 0 },
      { key: 'guest:1', name: '客1', items: null, more: 0 },
    ]);
  });
});

describe('guestCueToPlay', () => {
  const cue = { id: 7, guest: 1 };

  it('sparkles the guest of a new message once', () => {
    expect(guestCueToPlay(null, cue, true)).toEqual({ lastId: 7, play: 1 });
    expect(guestCueToPlay(7, cue, true)).toEqual({ lastId: 7, play: null });
  });

  it('keeps a cue that came while the stage loads, for when it runs', () => {
    expect(guestCueToPlay(null, cue, false)).toEqual({ lastId: null, play: null });
    expect(guestCueToPlay(null, cue, true)).toEqual({ lastId: 7, play: 1 });
  });

  it('does nothing without a cue (the message left the window meanwhile)', () => {
    expect(guestCueToPlay(3, null, true)).toEqual({ lastId: 3, play: null });
  });
});

describe('guestSparkleAfterHalt', () => {
  const cue = { id: 7, guest: 0 };

  it('sparkles the line still in the window again once the halt is over', () => {
    const shown = guestCueToPlay(null, cue, true).lastId;
    const halted = guestSparkleAfterHalt(shown, true);
    // Not while halted (the stage is not ready then)...
    expect(guestCueToPlay(halted, cue, false).play).toBeNull();
    // ...but once it is back.
    const back = guestSparkleAfterHalt(halted, false);
    expect(guestCueToPlay(back, cue, true)).toEqual({ lastId: 7, play: 0 });
  });

  it('keeps what was sparkled when nothing halts', () => {
    expect(guestSparkleAfterHalt(7, false)).toBe(7);
  });
});
