import type { DecorName } from '../../../../assets/decor/decor';
import { COMMANDER_ID } from '@conect-guild/snapshot/settings';
import { DEPARTMENT_MEMBERS, type MemberId } from '../guild.config';
import { decorPose, type AmbientMoods } from './ambient';
import { SELECTED_LAYOUT } from './layouts';
import type { GuildLayout } from './layouts/types';
import { CONFETTI, TRINKETS } from './metrics';
import type { Point } from './path';

/**
 * The small things that move with the members (Issue #11), without new pictures: a glint on 経理's
 * abacus and coins, notes and "!" from 広報's megaphone, a band of light turning 企画's globe and
 * the papers sorted on ささえ's file stack (総務) while that department works; the hourglass
 * running while the king has PRs to approve (it stands on ささえ's desk, but it is the king's
 * sign); a banner fluttering when a quest of its side of the room is cleared; the pet waking
 * to sit up now and then, and the light patches drifting with the sun. Pure: the time, each
 * thing's phase and what the members do are passed in. Distances are px of the decor pictures
 * (logical px), from the picture's top-left.
 */

/** When a thing moves. */
export type DecorTrigger =
  /** While the member works (working or busy: desk work in ambient.ts). */
  | { readonly kind: 'working'; readonly member: MemberId }
  /** While PRs wait for the king. */
  | { readonly kind: 'awaiting-president' }
  /** While the confetti flies over one of these members (a quest of theirs was cleared). */
  | { readonly kind: 'cleared'; readonly members: readonly MemberId[] };

/** What the triggers look at, taken from the members' moods and the confetti now flying. */
export interface DecorCues {
  /** Members of a department at work and at their seat (Issue #29). */
  readonly working: ReadonlySet<MemberId>;
  readonly awaitingPresident: boolean;
  /** When the confetti now flying over each member started (the latest one). */
  readonly clearedAt: Readonly<Partial<Record<MemberId, number>>>;
  /** Someone out playing stays by the pet now (IdlePose.withPet): it is up and sitting. */
  readonly petCompany: boolean;
}

export const NO_CUES: DecorCues = {
  working: new Set(),
  awaitingPresident: false,
  clearedAt: {},
  petCompany: false,
};

/**
 * The members of a department at work have the desk-work mood (ambient.ambientMoodOf: working or
 * busy), and the king fidgets exactly while PRs wait for him. かなめ's desk work (PRs to review)
 * moves no thing: she has none of her own. A department's things move only while its member is at
 * the seat (`members`, director.isAtSeat): not while they walk in a scene or are out playing
 * (Issue #29). The hourglass and the banners do not look at anyone's seat: the hourglass is the
 * king's sign (he never leaves the throne), and a banner hangs on the wall of its side of the room
 * for a cleared quest, whose confetti flies over the seat wherever its member is. The pet sits up
 * while anyone stays by it (`withPet`, Issue #39).
 */
export function decorCuesOf(
  moods: AmbientMoods,
  bursts: readonly { readonly actor: MemberId; readonly start: number }[],
  now: number,
  members: readonly {
    readonly id: MemberId;
    readonly atSeat: boolean;
    readonly withPet: boolean;
  }[],
): DecorCues {
  const seated = new Set(members.filter((m) => m.atSeat).map((m) => m.id));
  const working = new Set<MemberId>();
  for (const id of DEPARTMENT_MEMBERS) {
    if (moods[id] === 'desk-work' && seated.has(id)) working.add(id);
  }
  // Only the confetti flying now: one still to come must not stop a banner already fluttering.
  const clearedAt: Partial<Record<MemberId, number>> = {};
  for (const { actor, start } of bursts) {
    if (start > now || now >= start + CONFETTI.durationMs) continue;
    clearedAt[actor] = Math.max(start, clearedAt[actor] ?? start);
  }
  return {
    working,
    awaitingPresident: moods.yukihiro === 'fidget',
    clearedAt,
    petCompany: members.some((m) => m.withPet),
  };
}

/** Whose work moves each department's thing, and whose cleared quests flutter each banner. */
export interface TriggerTable {
  readonly things: ReadonlyMap<DecorName, MemberId>;
  /** The back wall's banner: かなめ and the upper desks. */
  readonly upper: readonly MemberId[];
  /** The left wall's banner: the lower desks. */
  readonly lower: readonly MemberId[];
}

/** Rows above this are the back wall. */
const BACK_WALL_ROWS = 3;

/** The triggers of `layout` with `departmentMembers[i]` at desk i. */
export function triggerTableFor(
  layout: GuildLayout,
  departmentMembers: readonly MemberId[],
): TriggerTable {
  const desks = layout.desks.flatMap((desk, i) => {
    const member = departmentMembers[i];
    return member === undefined ? [] : [{ desk, member }];
  });
  const side = (name: GuildLayout['desks'][number]['side']): MemberId[] =>
    desks.filter(({ desk }) => desk.side === name).map(({ member }) => member);
  return {
    things: new Map(
      desks.flatMap(({ desk, member }) => desk.things.map((thing) => [thing, member] as const)),
    ),
    upper: [COMMANDER_ID, ...side('upper')],
    lower: side('lower'),
  };
}

const SELECTED_TRIGGERS = triggerTableFor(SELECTED_LAYOUT, DEPARTMENT_MEMBERS);

/** The trigger of a thing that moves only sometimes in `table`; null for one that always moves. */
export function triggerIn(
  table: TriggerTable,
  placement: { readonly name: DecorName; readonly row: number },
): DecorTrigger | null {
  const member = table.things.get(placement.name);
  if (member !== undefined) return { kind: 'working', member };
  if (placement.name === 'hourglass') return { kind: 'awaiting-president' };
  if (placement.name === 'banner') {
    return {
      kind: 'cleared',
      members: placement.row < BACK_WALL_ROWS ? table.upper : table.lower,
    };
  }
  return null;
}

/** triggerIn the selected layout. */
export function triggerOf(placement: {
  readonly name: DecorName;
  readonly row: number;
}): DecorTrigger | null {
  return triggerIn(SELECTED_TRIGGERS, placement);
}

/**
 * Since when the thing moves, or null while it is still. Things moved by the party state have no
 * start of their own (0); a banner flutters from the latest confetti on its side.
 */
export function activeSince(trigger: DecorTrigger | null, cues: DecorCues): number | null {
  if (trigger === null) return 0;
  if (trigger.kind === 'working') return cues.working.has(trigger.member) ? 0 : null;
  if (trigger.kind === 'awaiting-president') return cues.awaitingPresident ? 0 : null;
  const starts = trigger.members.flatMap((id) => {
    const start = cues.clearedAt[id];
    return start === undefined ? [] : [start];
  });
  return starts.length === 0 ? null : Math.max(...starts);
}

/** A number in [0, 1) that looks random but is fixed for each step (integer hash). */
export function hashStep(step: number): number {
  return (Math.imul(step ^ 0x9e37_79b9, 2_654_435_761) >>> 0) / 2 ** 32;
}

/** Where a glint may show on each shining thing (the beads and the coins). */
export const GLINT_POINTS: Readonly<Partial<Record<DecorName, readonly Point[]>>> = {
  abacus: [
    { x: 7, y: 16 },
    { x: 12, y: 19 },
    { x: 17, y: 16 },
    { x: 21, y: 23 },
    { x: 10, y: 26 },
  ],
  'coin-pile': [
    { x: 9, y: 16 },
    { x: 20, y: 11 },
    { x: 19, y: 19 },
    { x: 5, y: 23 },
    { x: 22, y: 21 },
  ],
};

export interface Glint extends Point {
  /** Arm length of the four-pointed star, logical px (3, or 6 at its brightest). */
  readonly arm: number;
}

/** The glint showing at `now`, if any: at one of `points`, growing then shrinking. */
export function glintAt(points: readonly Point[], phaseMs: number, now: number): Glint | null {
  const t = now + phaseMs;
  const step = Math.floor(t / TRINKETS.sparkleStepMs);
  const elapsed = t - step * TRINKETS.sparkleStepMs;
  if (elapsed >= TRINKETS.sparkleShowMs || hashStep(step) >= TRINKETS.sparkleShare) return null;
  const point = points[Math.floor(hashStep(step + 7_919) * points.length)];
  if (point === undefined) return null;
  const middle = Math.abs(elapsed - TRINKETS.sparkleShowMs / 2) < TRINKETS.sparkleShowMs / 6;
  return { ...point, arm: middle ? 6 : 3 };
}

/**
 * Where the notes start: over the megaphone's bell. They drift up and to the left, off ひびき, who
 * sits just right of it (her face would hide them).
 */
export const MEGAPHONE_MOUTH: Point = { x: 22, y: 8 };

export interface Note extends Point {
  readonly kind: 'note' | 'bang';
}

/**
 * The notes and "!" in the air at `now`: one leaves the bell every TRINKETS.noteEveryMs, rises
 * and drifts to the left for TRINKETS.noteLifeMs, wiggling a little.
 */
export function notesAt(phaseMs: number, now: number): Note[] {
  const t = now + phaseMs;
  const newest = Math.floor(t / TRINKETS.noteEveryMs);
  const alive = Math.ceil(TRINKETS.noteLifeMs / TRINKETS.noteEveryMs);
  const notes: Note[] = [];
  for (let index = newest; index > newest - alive; index -= 1) {
    const age = (t - index * TRINKETS.noteEveryMs) / TRINKETS.noteLifeMs;
    if (age < 0 || age >= 1) continue;
    const wiggle = Math.floor(age * 6) % 2 === 0 ? 0 : 2;
    notes.push({
      kind: hashStep(index) < TRINKETS.bangShare ? 'bang' : 'note',
      x: MEGAPHONE_MOUTH.x - Math.round(age * TRINKETS.noteDriftPx) - wiggle,
      y: MEGAPHONE_MOUTH.y - Math.round(age * TRINKETS.noteRisePx),
    });
  }
  return notes;
}

/** The globe's body, where the band of light crosses (x from `left` to `right`). */
export const GLOBE_BODY = { left: 5, right: 25, top: 5, bottom: 25 } as const;

/** The left edge of the band of light on the globe at `now`, crossing from left to right. */
export function spinBandAt(phaseMs: number, now: number): number {
  const t = (now + phaseMs) % TRINKETS.spinMs;
  const span = GLOBE_BODY.right - GLOBE_BODY.left - TRINKETS.spinBandPx;
  return GLOBE_BODY.left + Math.floor((t / TRINKETS.spinMs) * (span + 1));
}

/** The top sheet of the file stack, px of its picture. */
export const FILE_TOP = { x: 6, y: 11, w: 15, h: 4 } as const;

export interface PapersLook {
  /** Added to the top sheet's left, logical px. */
  readonly slide: number;
  /** True while its right corner is lifted. */
  readonly curl: boolean;
  /** Where a sheet floating up off the stack is, from FILE_TOP's top-left; null when none is. */
  readonly float: Point | null;
}

/**
 * The papers on ささえ's file stack at `now`: each turn the top sheet lies flat, slides, lifts its
 * corner and lies flat again, in quarters; on some turns (fixed per turn) a sheet floats up and
 * aside from the start of the turn, then settles back on the stack by TRINKETS.floatMs.
 */
export function papersAt(phaseMs: number, now: number): PapersLook {
  const t = now + phaseMs;
  const turn = Math.floor(t / TRINKETS.shuffleMs);
  const elapsed = t - turn * TRINKETS.shuffleMs;
  const quarter = Math.floor((elapsed / TRINKETS.shuffleMs) * 4);
  const slid = quarter === 1 || quarter === 2;
  const floats = hashStep(turn) < TRINKETS.floatShare && elapsed < TRINKETS.floatMs;
  // 0 at the start, 1 halfway, back to 0 at the end: up, then down onto the stack.
  const lift = 1 - Math.abs((2 * elapsed) / TRINKETS.floatMs - 1);
  return {
    slide: slid ? TRINKETS.shuffleSlidePx : 0,
    curl: quarter === 2,
    float: floats
      ? {
          x: Math.round(lift * TRINKETS.floatDriftPx),
          // + 0 turns -0 into 0.
          y: -Math.round(lift * TRINKETS.floatRisePx) + 0,
        }
      : null,
  };
}

export interface SheetRect extends Point {
  readonly w: number;
  readonly h: number;
}

/**
 * Where the floating sheet is drawn, px of the stack's picture: lying on the top sheet at
 * `float` (0, 0), so it leaves from and lands on the stack, and moved by `float` in the air.
 */
export function floatingSheet(float: Point): SheetRect {
  return { x: FILE_TOP.x + 2 + float.x, y: FILE_TOP.y + 1 + float.y, w: FILE_TOP.w - 4, h: 2 };
}

/** The hourglass's neck and lower bulb: the stream runs from `top` to `bottom` at `x`. */
export const SAND_STREAM = { x: 15, top: 19, bottom: 25 } as const;

/** Where the falling grain is at `now`, px below SAND_STREAM.top. */
export function sandGrainAt(phaseMs: number, now: number): number {
  const t = ((now + phaseMs) % TRINKETS.sandMs) / TRINKETS.sandMs;
  return Math.floor(t * (SAND_STREAM.bottom - SAND_STREAM.top));
}

/**
 * How far the banner is pushed sideways at `fromTop` (0 at the rod, 1 at the hem), `elapsed` ms
 * after the quest was cleared: a wave runs down it, wider at the hem, dying out with the confetti.
 */
export function waveAt(fromTop: number, elapsed: number): number {
  if (elapsed < 0 || elapsed >= CONFETTI.durationMs) return 0;
  const fade = 1 - elapsed / CONFETTI.durationMs;
  const angle = 2 * Math.PI * (elapsed / TRINKETS.waveMs - fromTop);
  // + 0 turns -0 into 0.
  return Math.round(TRINKETS.wavePx * fade * fromTop * Math.sin(angle)) + 0;
}

/** The pet's picture while it is up and sitting. */
export const PET_AWAKE_DECOR: DecorName = 'awake-poodle';

/** The pet wakes and sits up at the start of every TRINKETS.petIntervalMs, for TRINKETS.petSitMs. */
export function petAwakeAt(phaseMs: number, now: number): boolean {
  return (now + phaseMs) % TRINKETS.petIntervalMs < TRINKETS.petSitMs;
}

export interface PetPose {
  /** The picture to draw: `asleep` or PET_AWAKE_DECOR. */
  readonly name: DecorName;
  /** Added to the picture's top, logical px. */
  readonly dy: number;
}

/**
 * The pet (`asleep`, its sleeping picture) breathes while it sleeps and sits still while it is up:
 * now and then on its own, and all the while someone stays by it (`company`, DecorCues.petCompany).
 */
export function petPoseAt(
  asleep: DecorName,
  phaseMs: number,
  now: number,
  company: boolean,
): PetPose {
  if (company || petAwakeAt(phaseMs, now)) return { name: PET_AWAKE_DECOR, dy: 0 };
  return { name: asleep, dy: decorPose('breath', phaseMs, now).dy };
}

export interface PatchLook {
  /** Added to the patch's left, logical px. */
  readonly dx: number;
  /** How strongly it shows, 0 to 1 (the sun). */
  readonly alpha: number;
}

/**
 * A light patch on the floor: it moves from left (morning) to right (evening) with the sun, sways
 * a little, and fades with the sun (`sun` from daylight.ts).
 */
export function patchAt(hour: number, sun: number, now: number): PatchLook {
  const day = Math.min(Math.max((hour - 6) / 12, 0), 1);
  const sway = Math.sin((2 * Math.PI * now) / TRINKETS.patchSwayMs);
  return {
    dx: Math.round((day * 2 - 1) * TRINKETS.patchDriftPx + sway * TRINKETS.patchSwayPx),
    alpha: Math.min(Math.max(sun, 0), 1),
  };
}
