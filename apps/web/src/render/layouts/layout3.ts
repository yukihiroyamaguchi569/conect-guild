import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Three departments (Issue #18): the two lower desks of layout4, its upper left (経理) desk with
 * its safe and things, and the tavern in the upper right. The upper desk has no one to chat with
 * (chats go both ways); the lower ones chat across the counter as in layout4.
 */
export const LAYOUT3: GuildLayout = buildLayout(3, {
  // Five rows, with the fetch status on the tab (Issue #132): the column ends at 236.5 px in the
  // demo at 1024 px (Chrome, 2026-10-15). No note reaches it, so both are the same.
  partyWindow: { bottom: 240, tallestBottom: 240 },
  // As in layout4: the upper desk is 5 tiles from かなめ, the lower ones 5.8.
  toss: { maxTiles: 5.5 },
});
