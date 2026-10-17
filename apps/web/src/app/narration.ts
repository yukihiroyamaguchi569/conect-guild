import type { Snapshot } from '@conect-guild/snapshot';
import {
  DEPARTMENT_LABELS,
  departmentMember,
  MEMBERS,
  RECENT_REWARD_WINDOW_MS,
  type MemberId,
} from '../guild.config';
import type { MemberState } from '../domain/party';
import { countRecentRewards } from '../domain/reward';
import type { DayPhase } from '../render/daylight';
import type { IdleActivity, Outing } from '../render/idle';
import type { PlaySpot } from '../render/idleSpots';
import type { Random } from '../render/confetti';

/**
 * The narration of the message window while no event is told (Issue #30): how the guild looks now.
 * Mostly one member's state (A), now and then the time of day (B) or the week's record (C). Names
 * and counts only, never a title. Pure: the party, the idle spells, the hour and the random source
 * are passed in.
 */

/** The king on the throne: a title of the guild picture, not a team setting. */
export const KING_TITLE = 'おうさま';
/** The pet by the throne. */
export const PET_NAME = 'トイプードル';

export interface NarrationMember {
  readonly id: MemberId;
  readonly name: string;
  readonly state: MemberState;
  /** The king's open quests (Issue #141); 0 for the others (app/guildView.ts PartyRow). */
  readonly quests: number;
}

/** Lines of one member: the A pool is drawn member first, so each member is as likely. */
export type LineGroup = readonly string[];

const kanameName = (): string => MEMBERS.kaname.name;

/** Where the walk out heads for. */
function destination(spot: PlaySpot): string {
  switch (spot.kind) {
    case 'tea':
      return 'おちゃの ところ';
    case 'pet':
      return `${PET_NAME}の ところ`;
    case 'window':
      return 'まどべ';
    case 'chat':
      return spot.partner === null ? 'となりの せき' : `${MEMBERS[spot.partner].name}の ところ`;
  }
}

export type PlayStep = 'going' | 'staying' | 'returning';

/** Where an outing is at `now` (epoch ms): walking out, at the spot, or walking back (idle.ts). */
export function playStepAt(outing: Outing, now: number): PlayStep {
  if (now < outing.out.end) return 'going';
  return now >= outing.back.start ? 'returning' : 'staying';
}

function playLines(name: string, outing: Outing, now: number): LineGroup {
  const step = playStepAt(outing, now);
  if (step === 'going') return [`${name}は ${destination(outing.spot)}へ むかっている。`];
  if (step === 'returning') return [`${name}は せきに もどっている。`];
  return stayLines(name, outing.spot);
}

/** At the spot: what the canvas shows them doing there. */
function stayLines(name: string, spot: PlaySpot): LineGroup {
  switch (spot.kind) {
    case 'tea':
      return [`${name}は おちゃを のんで ひといき ついている。`];
    case 'pet':
      return [`${name}は ${PET_NAME}と あそんでいる。`];
    case 'window':
      return [`${name}は まどの そとを ながめている。`];
    case 'chat': {
      const partner = spot.partner === null ? null : MEMBERS[spot.partner].name;
      return partner === null
        ? [`${name}は だれかと おしゃべり している。`]
        : [`${name}は ${partner}と おしゃべり している。`];
    }
  }
}

/** A member with nothing to do for a while: dozing, asleep, or out playing (render/idle.ts). */
function idleLines(
  name: string,
  activity: IdleActivity,
  onThrone: boolean,
  now: number,
): LineGroup {
  const where = onThrone ? 'ぎょくざで ' : '';
  switch (activity.kind) {
    case 'doze':
      return onThrone
        ? [`${name}は ぎょくざで まどろんでいる。`]
        : [`${name}は うとうと している…`];
    case 'sleep':
      return [`${name}は ${where}すやすや ねむっている…`, `${name}は ${where}いびきを かいている…`];
    case 'play':
      return playLines(name, activity.outing, now);
  }
}

const WAITING_PERMISSION = (name: string): LineGroup => [`${name}が きょかを まっている！`];

function departmentLines(member: NarrationMember): LineGroup {
  const { name } = member;
  switch (member.state) {
    case 'awaiting-permission':
      return WAITING_PERMISSION(name);
    case 'awaiting-president':
      return [`${name}は ${KING_TITLE}の しょうにんを まっている。`];
    case 'awaiting-kaname':
      return [`${name}は ${kanameName()}の かくにんを まっている。`];
    case 'busy':
      return [
        `${name}は せっせと しごとを している。`,
        `${name}は ペンを はしらせている。`,
        `${name}は しょるいを さばいている。`,
      ];
    case 'working':
      return [`${name}は クエストに とりくんでいる。`, `${name}は つくえに むかっている。`];
    case 'done':
      return [`${name}は クエストを おえて ひといき ついている。`];
    case 'idle':
      return [`${name}は せきで のんびり している。`];
  }
}

function kanameLines(member: NarrationMember): LineGroup {
  const { name } = member;
  switch (member.state) {
    case 'awaiting-permission':
      return WAITING_PERMISSION(name);
    case 'awaiting-kaname':
      return [`${name}は とどいた PRを たしかめている。`];
    case 'busy':
      return [`${name}は せっせと しごとを している。`];
    case 'working':
      return [`${name}は うけつけで まきものを ととのえている。`];
    default:
      return [`${name}は うけつけで つぎの クエストを まっている。`];
  }
}

function kingLines(member: NarrationMember): LineGroup {
  if (member.state === 'awaiting-president') {
    return [`${KING_TITLE}は しょうにんを まつ PRに めを とおしている。`];
  }
  // His own quests (Issue #166), as a department member's working line; never the title.
  return member.quests > 0
    ? [`${KING_TITLE}は ぎょくざで クエストに とりくんでいる。`]
    : [`${KING_TITLE}は ぎょくざから へやを みわたしている。`];
}

/**
 * How one member looks now (A). `activity` is their long idle spell at `now` (epoch ms; render/idle.ts
 * idleActivities); undefined while they are awake or have work.
 */
export function memberLines(
  member: NarrationMember,
  activity: IdleActivity | undefined,
  now: number,
): LineGroup {
  const king = member.id === 'yukihiro';
  if (activity !== undefined) {
    return idleLines(king ? KING_TITLE : member.name, activity, king, now);
  }
  if (king) return kingLines(member);
  return member.id === 'kaname' ? kanameLines(member) : departmentLines(member);
}

/** The time of day and the room (B). */
export const DAY_LINES: Readonly<Record<DayPhase, LineGroup>> = {
  morning: [
    'あさひが まどから さしこんでいる。',
    'あさの ギルドは まだ しずかだ。',
    `${PET_NAME}が あくびを した。`,
  ],
  day: [
    'まどの そとを ことりが とんでいった。',
    'ひるの ギルドは にぎやかだ。',
    `${PET_NAME}が しっぽを ふっている。`,
  ],
  evening: [
    'ゆうひが へやを あかく そめている。',
    'そろそろ ひが くれる。',
    `${PET_NAME}が あくびを した。`,
  ],
  night: [
    'よるも ふけてきた…',
    'ランタンの ひが ゆらめいている。',
    `${PET_NAME}は まるくなって ねむっている。`,
  ],
};

/** Issues closed within `windowMs` before `now` (the collector keeps 7 days of them). */
function countRecentClears(issues: Snapshot['issues'], now: number, windowMs: number): number {
  return issues.filter(
    (issue) =>
      issue.state === 'closed' &&
      issue.closedAt !== null &&
      now - Date.parse(issue.closedAt) <= windowMs,
  ).length;
}

/** The members who brought the most chests (ties share the line); none when nobody brought one. */
function topCollectors(
  snapshot: Pick<Snapshot, 'issues' | 'prs'>,
  now: number,
): { readonly count: number; readonly names: readonly string[] } {
  const rewards = countRecentRewards(snapshot, now);
  const count = Math.max(0, ...DEPARTMENT_LABELS.map((label) => rewards[label] ?? 0));
  const names = DEPARTMENT_LABELS.filter((label) => count > 0 && rewards[label] === count).map(
    (label) => MEMBERS[departmentMember(label)].name,
  );
  return { count, names };
}

/**
 * The week's record (C): the quests cleared, the chests brought, and who brought the most. A count
 * of 0 gives no line, so a quiet week says nothing.
 */
export function recordLines(snapshot: Pick<Snapshot, 'issues' | 'prs'>, now: number): LineGroup[] {
  const windowMs = RECENT_REWARD_WINDOW_MS;
  const clears = countRecentClears(snapshot.issues, now, windowMs);
  const chests = snapshot.prs.filter(
    (pr) => pr.mergedAt !== null && now - Date.parse(pr.mergedAt) <= windowMs,
  ).length;
  const top = topCollectors(snapshot, now);
  const lines: LineGroup[] = [];
  if (clears > 0) lines.push([`この 1 しゅうかんで クエストを ${String(clears)} こ クリアした！`]);
  if (chests > 0) lines.push([`この 1 しゅうかんで たからばこが ${String(chests)} こ とどいた！`]);
  if (top.names.length > 0) {
    const who = top.names.join('と ');
    lines.push([`いちばん たからばこを あつめたのは ${who}（${String(top.count)} こ）！`]);
  }
  return lines;
}

/** Every line the window may tell now, by kind (A: the members, B: the time, C: the record). */
export interface NarrationPools {
  readonly scene: readonly LineGroup[];
  readonly time: readonly LineGroup[];
  readonly record: readonly LineGroup[];
}

export type NarrationKind = keyof NarrationPools;

/** How often each kind is told when all have a line (A most of the time). */
export const NARRATION_WEIGHTS: Readonly<Record<NarrationKind, number>> = {
  scene: 0.65,
  time: 0.2,
  record: 0.15,
};

const KINDS: readonly NarrationKind[] = ['scene', 'time', 'record'];

export interface NarrationInput {
  /** The party rows (buildParty); empty before the first snapshot. */
  readonly party: readonly NarrationMember[];
  /** The long idle spells now (render/idle.ts idleActivities). */
  readonly activities: Readonly<Partial<Record<MemberId, IdleActivity>>>;
  /** The local time of day, 0 to 24. */
  readonly phase: DayPhase;
  readonly snapshot: Pick<Snapshot, 'issues' | 'prs'>;
  /** Epoch ms. */
  readonly now: number;
}

/** Every line the window may tell now. Nothing before the first snapshot (no party yet). */
export function narrationPools(input: NarrationInput): NarrationPools {
  if (input.party.length === 0) return { scene: [], time: [], record: [] };
  return {
    scene: input.party.map((member) => memberLines(member, input.activities[member.id], input.now)),
    time: [DAY_LINES[input.phase]],
    record: recordLines(input.snapshot, input.now),
  };
}

/** `pools` without `previous`, so the same line never comes twice in a row. */
function without(pools: NarrationPools, previous: string | null): NarrationPools {
  const drop = (groups: readonly LineGroup[]) =>
    groups.map((lines) => lines.filter((line) => line !== previous)).filter((g) => g.length > 0);
  return { scene: drop(pools.scene), time: drop(pools.time), record: drop(pools.record) };
}

/** The element at `r` (0 to 1) of the way through `items`. */
function itemAt<T>(items: readonly T[], r: number): T | undefined {
  return items[Math.min(Math.floor(r * items.length), items.length - 1)];
}

/** A kind by its weight among `kinds` (none empty), with `r` in [0, 1). */
function kindAt(kinds: readonly NarrationKind[], r: number): NarrationKind | undefined {
  const total = kinds.reduce((sum, kind) => sum + NARRATION_WEIGHTS[kind], 0);
  let rest = r * total;
  for (const kind of kinds) {
    rest -= NARRATION_WEIGHTS[kind];
    if (rest < 0) return kind;
  }
  return kinds.at(-1);
}

/**
 * The next line: a kind by NARRATION_WEIGHTS (among those with a line), then a group of it, then a
 * line of the group, each with one draw of `random`. Never `previous` again, unless it is the only
 * line there is. Null when there is nothing to tell.
 */
export function pickNarration(
  pools: NarrationPools,
  previous: string | null,
  random: Random,
): string | null {
  const fresh = without(pools, previous);
  const kind = kindAt(
    KINDS.filter((k) => fresh[k].length > 0),
    random(),
  );
  if (kind === undefined) return KINDS.flatMap((k) => pools[k].flat())[0] ?? null;
  const group = itemAt(fresh[kind], random());
  return group === undefined ? null : (itemAt(group, random()) ?? null);
}
