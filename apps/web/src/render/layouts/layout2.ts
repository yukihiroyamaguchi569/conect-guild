import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Two departments (Issue #18): the two lower desks of layout4, the tavern in the upper right and a
 * library in the upper left, where layout4 has the 経理 desk (slots.ts: rule 2's exception).
 */
export const LAYOUT2: GuildLayout = buildLayout(2, {
  hourglassOnCounter: false,
  // Four rows: the party window keeps its minimum height (GuildScreen.vue .stage__party, 21.1cqw),
  // and with the fetch status on the tab (Issue #132) that is the column: it ends at 225.3 px in
  // the demo at 1024 px (Chrome, 2026-10-15). No note reaches it, so both are the same.
  partyWindow: { bottom: 229, tallestBottom: 229 },
  // As in layout4: the lower desks are 5.8 tiles from かなめ, so she walks every scroll over.
  toss: { maxTiles: 5.5 },
});
