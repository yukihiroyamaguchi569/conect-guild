import type { Snapshot } from '@conect-guild/snapshot';
import {
  DEPARTMENT_LABELS,
  departmentMember,
  MEMBERS,
  type DepartmentLabel,
  type MemberId,
} from '../guild.config';
import { branchDepartmentsOfIssues } from './party';
import { issueDepartment } from './quest';

/**
 * The king's reward of the day (Issue #194, docs/DESIGN.md 8): at REWARD_HOUR (local time) the
 * member who cleared the most quests that day gets a rice ball, dumplings or a medal from the king,
 * which stays on their desk until the day is over. Pure: the time and the random source are passed
 * in.
 */

/** When the reward comes, local time (the president's decision, 2026-10-18). */
const REWARD_HOUR = 17;

export const REWARD_KINDS = ['onigiri', 'dango', 'medal'] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/** What the message window calls each. */
const REWARD_NAMES: Readonly<Record<RewardKind, string>> = {
  onigiri: 'おにぎり',
  dango: 'おだんご',
  medal: 'くんしょう',
};

export interface DailyReward {
  readonly department: DepartmentLabel;
  readonly member: MemberId;
  readonly kind: RewardKind;
}

/** REWARD_HOUR of the local day of `now` (epoch ms). */
export function deliveryOf(now: number): number {
  const date = new Date(now);
  date.setHours(REWARD_HOUR, 0, 0, 0);
  return date.getTime();
}

/** The next local midnight after `now` (epoch ms): the end of its day. */
export function dayEndOf(now: number): number {
  return new Date(now).setHours(24, 0, 0, 0);
}

/**
 * The department that cleared the most quests closed from `from` to before `to` (epoch ms): the
 * desk's clears (an Issue's department as its clear is told, quest.issueDepartment). A tie goes to
 * the one that reached the count first, then to the settings' order; null when nobody cleared one.
 * The reception's clears (no department) and the king's quests are not counted.
 */
export function topClearer(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  from: number,
  to: number,
): DepartmentLabel | null {
  const fromBranches = branchDepartmentsOfIssues(snapshot.prs);
  const times = new Map<DepartmentLabel, number[]>();
  for (const issue of snapshot.issues) {
    const at = issue.closedAt === null ? Number.NaN : Date.parse(issue.closedAt);
    const department = issueDepartment(issue, fromBranches);
    if (issue.state !== 'closed' || !(at >= from && at < to) || department === null) continue;
    times.set(department, [...(times.get(department) ?? []), at]);
  }
  const ranked = DEPARTMENT_LABELS.flatMap((label) => {
    const sorted = (times.get(label) ?? []).toSorted((a, b) => a - b);
    const reachedAt = sorted.at(-1);
    return reachedAt === undefined ? [] : [{ label, count: sorted.length, reachedAt }];
  });
  // Stable: equal counts and times keep the settings' order.
  const [top] = ranked.toSorted((a, b) => b.count - a.count || a.reachedAt - b.reachedAt);
  return top?.label ?? null;
}

/**
 * The reward on a desk at `now`: from REWARD_HOUR to the end of the day, for the quests cleared
 * from midnight until REWARD_HOUR; null before it, and when nobody cleared one. `random` (0 to
 * below 1) picks what it is.
 */
export function rewardAt(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  now: number,
  random: () => number,
): DailyReward | null {
  const delivery = deliveryOf(now);
  if (now < delivery) return null;
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const department = topClearer(snapshot, midnight, delivery);
  if (department === null) return null;
  const index = Math.min(Math.floor(random() * REWARD_KINDS.length), REWARD_KINDS.length - 1);
  const kind = REWARD_KINDS[index] ?? 'onigiri';
  return { department, member: departmentMember(department), kind };
}

/**
 * A random number of the local day of `now`, the same all day (a reload shows the same reward), from
 * one day to the next as good as random.
 */
export function dayRandom(now: number): () => number {
  const date = new Date(now);
  const day = date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
  return () => {
    const x = Math.sin(day) * 10_000;
    return x - Math.floor(x);
  };
}

/** The reward of a day once it came, kept as it was all that day. */
export interface KeptReward extends DailyReward {
  /** When it came (REWARD_HOUR of its day), epoch ms. */
  readonly delivery: number;
  /** The next midnight: it is gone from then on (whatever the fetches), epoch ms. */
  readonly until: number;
}

/** What the screen has seen of the rewards, from fetch to fetch (watchReward). */
export interface RewardWatch {
  /** REWARD_HOUR of the day the screen was open before it: that day's reward is told when it comes. */
  readonly awaited: number | null;
  /** The reward of the day on a desk; null before it came and when nobody earned one. */
  readonly kept: KeptReward | null;
}

export const NO_REWARD_WATCH: RewardWatch = { awaited: null, kept: null };

/**
 * The watch after a fetch of `snapshot` (judged at its `fetchedAt`) that the screen saw at `seenAt`
 * (epoch ms, the browser's clock), and the reward to tell now. Once a day's reward is found it is
 * kept for the day, whatever later fetches say (an Issue reopened after REWARD_HOUR moves nothing).
 * It is told only when the screen was open on that day before REWARD_HOUR, at the first fetch that
 * finds it (a clear the collector brings late is told late); a screen opened later finds it on the
 * desk already. Before REWARD_HOUR nothing is kept.
 */
export function watchReward(
  watch: RewardWatch,
  snapshot: Pick<Snapshot, 'issues' | 'prs' | 'fetchedAt'>,
  seenAt: number,
): { readonly watch: RewardWatch; readonly told: KeptReward | null } {
  const seenDelivery = deliveryOf(seenAt);
  const awaited = seenAt < seenDelivery ? seenDelivery : watch.awaited;
  const now = Date.parse(snapshot.fetchedAt);
  const delivery = deliveryOf(now);
  // The day's reward stays while the day lasts, whatever the snapshot (a late or an older one).
  const { kept: held } = watch;
  if (held !== null && seenAt >= held.delivery && seenAt < held.until) {
    return { watch: { awaited, kept: held }, told: null };
  }
  const until = dayEndOf(now);
  // A snapshot of a day already over when seen changes nothing (nor tells anything).
  if (seenAt >= until) return { watch: { ...watch, awaited }, told: null };
  // Not before REWARD_HOUR by the snapshot, nor by the browser (a collector's clock a little ahead).
  if (now < delivery || seenAt < delivery) return { watch: { awaited, kept: null }, told: null };
  const reward = rewardAt(snapshot, now, dayRandom(now));
  if (reward === null) return { watch: { awaited, kept: null }, told: null };
  const kept: KeptReward = { ...reward, delivery, until };
  return { watch: { awaited, kept }, told: awaited === delivery ? kept : null };
}

/** The message window's line, e.g. 「おうさまから ささえに ほうびの おにぎりが とどいた！」. */
export function rewardMessage(reward: DailyReward): string {
  return `おうさまから ${MEMBERS[reward.member].name}に ほうびの ${REWARD_NAMES[reward.kind]}が とどいた！`;
}
