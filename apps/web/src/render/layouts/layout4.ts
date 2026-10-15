import { buildLayout } from './slots';
import type { GuildLayout } from './types';

/**
 * Four departments: the office of 2026-10-12, laid out like assets/concept/rpg-company-ui.png
 * within what the HTML windows leave free. The throne at the back centre, かなめ's counter in the
 * middle, a desk in each wing and the door at the bottom right; the guests in the lower left
 * corner. Built by the rules of slots.ts (Issue #123) as it was by hand (layout4.golden.test.ts).
 */
export const LAYOUT4: GuildLayout = buildLayout(4, {
  hourglassOnCounter: false,
  // Six rows, with the fetch status on the tab (Issue #132): the column ends at 274.4 px in the
  // demo at 1024 px (Chrome, 2026-10-15). No note reaches it, so both are the same.
  partyWindow: { bottom: 278, tallestBottom: 278 },
  // 経理 and 広報 behind the counter are 5 tiles from かなめ; 企画 and 総務 in front of it 5.8.
  toss: { maxTiles: 5.5 },
});
