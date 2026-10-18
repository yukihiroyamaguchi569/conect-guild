import type { Snapshot } from '@conect-guild/snapshot';
import { shallowRef, type Ref } from 'vue';
import { z } from 'zod';
import type { KeyValueStore } from '../adapters/storage';
import {
  dayEndOf,
  deliveryOf,
  NO_REWARD_WATCH,
  REWARD_KINDS,
  rewardMessage,
  watchReward,
  type KeptReward,
} from '../domain/dailyReward';
import type { MessageEntry } from '../domain/message';
import { DEPARTMENT_LABELS, departmentMember } from '../guild.config';

/** localStorage key of the reward of the day (Issue #194): times, the desk's number and the kind. */
export const REWARD_STORAGE_KEY = 'conect-guild:daily-reward';

const storedRewardSchema = z.strictObject({
  delivery: z.number().int().nonnegative(),
  until: z.number().int().nonnegative(),
  /** The department's place in the settings (DEPARTMENT_LABELS). */
  desk: z.number().int().nonnegative(),
  kind: z.enum(REWARD_KINDS),
});
type StoredReward = z.infer<typeof storedRewardSchema>;

/**
 * The reward kept by an earlier screen; null when its desk is gone or its times are not those of a
 * day's reward (REWARD_HOUR and the next midnight).
 */
function restored(stored: StoredReward): KeptReward | null {
  const department = DEPARTMENT_LABELS[stored.desk];
  const day = stored.delivery === deliveryOf(stored.delivery);
  if (department === undefined || !day || stored.until !== dayEndOf(stored.delivery)) return null;
  const { delivery, until, kind } = stored;
  return { department, member: departmentMember(department), kind, delivery, until };
}

function toStored(kept: KeptReward): StoredReward {
  const { delivery, until, kind } = kept;
  return { delivery, until, desk: DEPARTMENT_LABELS.indexOf(kept.department), kind };
}

/**
 * The king's reward of the day (Issue #194) from fetch to fetch (domain/dailyReward.ts
 * watchReward): the one on a desk, and the message line once it comes. The reward found is kept in
 * `storage` too, so a screen opened again that day shows the same one whatever the snapshot says
 * by then, from its start at `startedAt` (epoch ms) on, fetched or not; whether to tell it is in
 * memory only, so a screen opened after it came tells nothing. The line is dropped unshown if its
 * turn comes after the day is over (MessageEntry.until).
 */
export function createRewardWatch(
  storage: KeyValueStore,
  startedAt: number,
): {
  readonly reward: Readonly<Ref<KeptReward | null>>;
  /** A fetch of `snapshot` seen at `seenAt` (epoch ms): the line to tell, if any. */
  observe(snapshot: Snapshot, seenAt: number): MessageEntry[];
} {
  const read = storage.read(REWARD_STORAGE_KEY, storedRewardSchema);
  const kept = read.ok ? restored(read.value) : null;
  let watch = { ...NO_REWARD_WATCH, kept };
  const today = kept !== null && startedAt >= kept.delivery && startedAt < kept.until;
  const reward = shallowRef<KeptReward | null>(today ? kept : null);
  return {
    reward,
    observe(snapshot, seenAt) {
      const next = watchReward(watch, snapshot, seenAt);
      if (next.watch.kept !== null && next.watch.kept !== watch.kept) {
        storage.write(REWARD_STORAGE_KEY, toStored(next.watch.kept));
      }
      watch = next.watch;
      reward.value = watch.kept;
      const { told } = next;
      return told === null ? [] : [{ text: rewardMessage(told), event: null, until: told.until }];
    },
  };
}
