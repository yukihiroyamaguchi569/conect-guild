import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Three departments (Issue #18): the two lower desks of layout4, its upper left (経理) desk with
 * its safe and things, and the tavern in the upper right. The upper desk has no one to chat with
 * (chats go both ways); the lower ones chat across the counter as in layout4.
 */
export const LAYOUT3: GuildLayout = buildLayout(3, {
  // Five rows: one row (38.0 px) less than layout4 (284.5 px against 322.4 px in the demo at
  // 1024 px, Chrome, 2026-10-14). Taken off layout4's 340 and 372.5 px and rounded up.
  partyWindow: { bottom: 303, tallestBottom: 335 },
  // As in layout4: the upper desk is 5 tiles from かなめ, the lower ones 5.8.
  toss: { maxTiles: 5.5 },
});
