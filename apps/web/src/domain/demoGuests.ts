import {
  GUEST_RECENT_LIMIT,
  type GuestGithubPart,
  type SessionState,
} from '@conect-guild/snapshot';
import type { GuildGuest } from '@conect-guild/snapshot/settings';
import { DEMO_LOOP_MS } from './demoScript';

/**
 * The guests of the demo (Issue #108): only when the settings name guests, so a team without them
 * sees the same demo as before. Their names come from the settings; their work is made up here.
 * Each loop the first guest works and has a PR merged, the second waits for a permission, then
 * works and has an Issue completed. Pure: times are ms from the loop's start, `nowMs` epoch ms.
 */

/** When in a loop each guest finishes (its PR merged or its Issue completed). */
const FINISH_AT_MS = [35_000, 50_000] as const;

/** Made-up open items of each guest; the finished one of each loop is numbered after them. */
const OPEN_TITLES: readonly (readonly { readonly title: string; readonly isPr: boolean }[])[] = [
  [
    { title: '店の看板を描き直す', isPr: true },
    { title: '薬草の在庫表を作る', isPr: false },
  ],
  [{ title: '北の山道を地図に足す', isPr: false }],
];
const FINISHED_TITLES = ['棚の並びを変える', '旅の日誌をまとめる'] as const;

/** A guest's session at `inLoopMs`: the first works, the second waits, then works, then rests. */
function stateAt(index: number, inLoopMs: number): SessionState {
  if (index === 0) return inLoopMs < FINISH_AT_MS[0] ? 'working' : 'resting';
  if (inLoopMs < 15_000) return 'awaiting-permission';
  return inLoopMs < FINISH_AT_MS[1] ? 'working' : 'resting';
}

const iso = (ms: number): string => new Date(ms).toISOString();

function partOf(
  index: number,
  repo: string,
  at: { readonly loop: number; readonly inLoopMs: number; readonly nowMs: number },
): GuestGithubPart {
  const loopStart = at.nowMs - at.inLoopMs;
  const finishAt = FINISH_AT_MS[index] ?? DEMO_LOOP_MS;
  const done = at.inLoopMs >= finishAt ? at.loop + 1 : at.loop;
  const open = OPEN_TITLES[index] ?? [];
  const recent = Array.from({ length: Math.min(done, GUEST_RECENT_LIMIT) }, (_, k) => {
    const loop = done - 1 - k;
    return {
      kind: index === 0 ? ('pr-merged' as const) : ('issue-completed' as const),
      number: open.length + 1 + loop,
      title: FINISHED_TITLES[index] ?? '',
      at: iso(loopStart + (loop - at.loop) * DEMO_LOOP_MS + finishAt),
    };
  });
  return {
    repo,
    fetchedAt: iso(at.nowMs),
    open: open.map((item, i) => ({
      number: open.length - i,
      ...item,
      createdAt: iso(loopStart),
      updatedAt: iso(loopStart),
    })),
    recent,
  };
}

/** The guests' session states and repositories for the demo snapshot, in the settings' order. */
export function demoGuestsAt(
  guests: readonly GuildGuest[],
  at: { readonly loop: number; readonly inLoopMs: number; readonly nowMs: number },
): { readonly states: SessionState[]; readonly parts: (GuestGithubPart | null)[] } {
  return {
    states: guests.map((_, index) => stateAt(index, at.inLoopMs)),
    parts: guests.map((guest, index) =>
      guest.repo === undefined ? null : partOf(index, guest.repo, at),
    ),
  };
}
