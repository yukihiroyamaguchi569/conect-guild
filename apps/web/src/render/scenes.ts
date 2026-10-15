import { byMember, PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { GuildEvent } from '../domain/events';
import { departmentMember, MEMBERS, type MemberId, type TilePos } from '../guild.config';
import { createConfetti, type Particle, type Random } from './confetti';
import type { LineScene } from './lineBook';
import type { PickLine, Turn } from './lines';
import { isWalkable, PLACES } from './map';
import { LINES } from './metrics';
import {
  carry,
  raise,
  staySegment,
  walkSegment,
  type Held,
  type Prop,
  type Segment,
} from './motion';
import { hopSegments } from './levelUp';
import { findPath, type TilePath } from './path';
import { planToss, shouldToss, type Flight } from './toss';

/**
 * Event → scene script (docs/DESIGN.md 4.4 and chapter 6 M2). Pure: the start time and the random
 * source are passed in, and the result is plain data the director plays back. Nobody leaves the
 * room: かなめ goes between the members and the reception (decided by the president, 2026-10-12).
 *
 * Whoever brings the item carries it in their arms; whoever receives it takes it in their arms the
 * same way (so it does not jump from one to the other), then raises it over their head.
 *
 * - issue-opened: かなめ takes up a scroll, walks out from behind the counter to the member's seat
 *   and hands it over; the member holds it up a while at the seat, かなめ walks back
 * - pr-merged: the member takes up a chest, walks to the counter front and hands it over across the
 *   counter; かなめ holds it up a while, the member walks back to the seat
 * - issue-closed: confetti over the member's seat
 * - level-up: the member hops twice at the seat, with confetti and "LEVEL UP" over it (levelUp.ts)
 * - no department: かなめ only raises the scroll / chest at the reception (confetti stays the same)
 * - king-quest-opened (Issue #142): as issue-opened, かなめ walks the scroll to the side of the
 *   throne (PLACES.throneSide) and the king holds it up on the throne, with a word of his own
 *   (Issue #146); never tossed
 * - king-quest-cleared (Issue #147): no confetti; the king says a word on the throne, and かなめ
 *   answers at the reception a moment after it ends
 * - issue-opened to a near desk, now and then: かなめ tosses the scroll from the counter and the
 *   member catches it at the seat (toss.ts, Issue #12)
 *
 * A handover takes about 10–14 s in all (scenes.test.ts checks every department).
 *
 * Each scene also says who speaks at which moment (`turns`, lines.ts, Issue #47): the one who brings
 * the item as they reach the other (or lets the tossed scroll go), then the one who takes it as they
 * hold it up; on a clear the member under the confetti, then the king; on the king's clear the king,
 * then かなめ.
 */

/** The giver takes up the item in their arms at the start before setting off. */
export const PICK_UP_MS = 2_000;
/** Giver and receiver side by side; the item changes hands halfway. */
export const HANDOVER_MS = 3_000;
/** The receiver holds the item in their arms a moment after taking it ... */
export const RECEIVE_MS = 600;
/** ... then raises it over their head. */
export const HOLD_UP_MS = 5_000;
export const RECEPTION_MS = 2_500;

/** One member's part in a scene: back-to-back segments. */
export interface Track {
  readonly actor: MemberId;
  readonly segments: readonly Segment[];
}

/** Confetti over a member's seat. */
export interface Burst {
  readonly actor: MemberId;
  readonly start: number;
  readonly particles: readonly Particle[];
  /** True for a level-up: the words "LEVEL UP" show with the confetti (levelUp.ts). */
  readonly levelUp?: true;
}

export interface Scene {
  readonly tracks: readonly Track[];
  readonly bursts: readonly Burst[];
  /** Items in the air (toss.ts). */
  readonly flights: readonly Flight[];
  /** Who speaks when (lines.ts), in the order they speak. */
  readonly turns: readonly Turn[];
}

export interface SceneContext {
  readonly seats: Readonly<Record<MemberId, TilePos>>;
  readonly random: Random;
  /**
   * Whether かなめ tosses the scroll to a near desk (toss.ts): a source of its own, so the confetti
   * draws the same numbers as without tosses. Without one she always walks the scroll over.
   */
  readonly tossRandom?: Random;
  /** What the members say at the turns (lines.createLinePicker); without one nobody speaks. */
  readonly pickLine?: PickLine;
}

/** The member who acts for an event; かなめ for the reception, the king for his quests. */
export function actorOf(event: Pick<GuildEvent, 'kind' | 'department'>): MemberId {
  if (event.kind === 'king-quest-opened' || event.kind === 'king-quest-cleared')
    return PRESIDENT_ID;
  return event.department === null ? 'kaname' : departmentMember(event.department);
}

/** Members whose movement a scene takes over (they must not be in two scenes at once). */
export function castOf(event: Pick<GuildEvent, 'kind' | 'department'>): MemberId[] {
  if (event.kind === 'issue-closed') return [];
  if (event.kind === 'level-up') return [actorOf(event)];
  const actor = actorOf(event);
  return actor === 'kaname' ? [actor] : [actor, 'kaname'];
}

/** Path between two tiles, or just the start tile when there is no way (the member stays). */
function route(from: TilePos, to: TilePos): TilePath {
  return findPath(from, to) ?? [from];
}

/** Appends segments one after another, each starting where the previous ended. */
class TrackBuilder {
  private readonly actor: MemberId;
  private readonly segments: Segment[] = [];
  private cursor: number;
  private at: TilePos;

  constructor(actor: MemberId, start: number, from: TilePos) {
    this.actor = actor;
    this.cursor = start;
    this.at = from;
  }

  walk(to: TilePos, held: Held | null = null): this {
    return this.push(walkSegment(route(this.at, to), this.cursor, held), to);
  }

  stay(ms: number, held: Held | null = null): this {
    return this.push(staySegment(this.at, this.cursor, ms, held), this.at);
  }

  /** The time the next segment would start. */
  get time(): number {
    return this.cursor;
  }

  build(): Track {
    return { actor: this.actor, segments: this.segments };
  }

  private push(segment: Segment, to: TilePos): this {
    this.segments.push(segment);
    this.cursor = segment.end;
    // A walk with no way leaves the member where they were.
    this.at = segment.path.length > 1 ? to : this.at;
    return this;
  }
}

/**
 * Where a visitor from `from` stands to hand something to the member on `seat`: beside the seat
 * (left or right, so neither hides the other), else in front of or behind it; the nearest one that
 * can be reached. `from` itself when none can.
 */
function besideSeat(from: TilePos, seat: TilePos): TilePos {
  const at = (col: number, row: number): TilePos => ({ col: seat.col + col, row: seat.row + row });
  for (const group of [
    [at(-1, 0), at(1, 0)],
    [at(0, 1), at(0, -1)],
  ]) {
    const ways = group
      .filter(isWalkable)
      .map((tile) => findPath(from, tile))
      .filter((path) => path !== null)
      .toSorted((a, b) => a.length - b.length);
    const nearest = ways[0]?.at(-1);
    if (nearest !== undefined) return nearest;
  }
  return from;
}

/** The tracks of a handover and who speaks when in it. */
interface Staging {
  readonly tracks: readonly Track[];
  readonly turns: readonly Turn[];
}

/**
 * What the one who brings `prop` says, and what the one who takes it says: the king has lines of
 * his own for the scroll of his quest (Issue #146).
 */
function linesFor(prop: Prop, receiver: MemberId): { give: LineScene; take: LineScene } {
  if (prop === 'chest') return { give: 'deliverChest', take: 'takeChest' };
  return { give: 'handOver', take: receiver === PRESIDENT_ID ? 'kingTakeScroll' : 'takeScroll' };
}

/** Who brings what to where in a handover. */
interface Delivery {
  readonly giver: MemberId;
  readonly receiver: MemberId;
  /** Where the giver stands to hand the item over. */
  readonly to: TilePos;
  readonly prop: Prop;
}

/**
 * The giver takes up the item at their seat and carries it in their arms to `to`, hands it over
 * halfway through the stop and walks back; the receiver waits at their seat, takes the item in
 * their arms, then raises it over their head a while.
 */
function deliver(item: Delivery, start: number, seats: SceneContext['seats']): Staging {
  const { giver, receiver, to, prop } = item;
  const giving = new TrackBuilder(giver, start, seats[giver])
    .stay(PICK_UP_MS, carry(prop))
    .walk(to, carry(prop));
  const arrived = giving.time;
  const handover = arrived + HANDOVER_MS / 2;
  giving
    .stay(HANDOVER_MS / 2, carry(prop))
    .stay(HANDOVER_MS / 2)
    .walk(seats[giver]);
  const receiving = new TrackBuilder(receiver, start, seats[receiver])
    .stay(handover - start)
    .stay(RECEIVE_MS, carry(prop));
  const raised = receiving.time;
  receiving.stay(HOLD_UP_MS, raise(prop));
  const { give, take } = linesFor(prop, receiver);
  return {
    tracks: [giving.build(), receiving.build()],
    turns: [
      { actor: giver, scene: give, at: arrived },
      { actor: receiver, scene: take, at: raised },
    ],
  };
}

function reception(start: number, seats: SceneContext['seats'], prop: Prop): Staging {
  return {
    tracks: [
      new TrackBuilder('kaname', start, seats.kaname).stay(RECEPTION_MS, raise(prop)).build(),
    ],
    turns: [{ actor: 'kaname', scene: linesFor(prop, 'kaname').take, at: start }],
  };
}

/**
 * かなめ brings the scroll to the member's seat, or to the side of the throne for the king; the
 * member brings the chest to the counter.
 */
function deliveryOf(
  kind: 'issue-opened' | 'pr-merged',
  actor: MemberId,
  seats: SceneContext['seats'],
): Delivery {
  return kind === 'issue-opened'
    ? {
        giver: 'kaname',
        receiver: actor,
        to: actor === PRESIDENT_ID ? PLACES.throneSide : besideSeat(seats.kaname, seats[actor]),
        prop: 'scroll',
      }
    : { giver: actor, receiver: 'kaname', to: PLACES.counterFront, prop: 'chest' };
}

/** The handover, or かなめ alone at the reception when there is no department or no way to meet. */
function handoverTracks(
  kind: 'issue-opened' | 'pr-merged',
  actor: MemberId,
  start: number,
  seats: SceneContext['seats'],
): Staging {
  const prop = kind === 'issue-opened' ? 'scroll' : 'chest';
  if (actor === 'kaname') return reception(start, seats, prop);
  const item = deliveryOf(kind, actor, seats);
  const way = findPath(seats[item.giver], item.to);
  // An item never changes hands between members who cannot meet.
  return way === null || way.length < 2
    ? reception(start, seats, prop)
    : deliver(item, start, seats);
}

/** かなめ tosses the scroll from her seat; the member catches it at theirs (toss.ts). */
function tossScene(actor: MemberId, start: number, seats: SceneContext['seats']): Scene {
  const toss = planToss({ from: 'kaname', to: actor, prop: 'scroll' }, start, seats, {
    pickUpMs: PICK_UP_MS,
    holdUpMs: HOLD_UP_MS,
  });
  return {
    tracks: [
      { actor: 'kaname', segments: toss.thrower },
      { actor, segments: toss.catcher },
    ],
    bursts: [],
    flights: [toss.flight],
    turns: [
      { actor: 'kaname', scene: 'toss', at: toss.flight.start },
      { actor, scene: 'takeScroll', at: toss.flight.end },
    ],
  };
}

/** The cleared member speaks under the confetti, then the king a moment after. */
function clearTurns(actor: MemberId, start: number): Turn[] {
  return [
    { actor, scene: 'clear', at: start },
    { actor: 'yukihiro', scene: 'seeClear', at: start + LINES.clearMs + LINES.kingGapMs },
  ];
}

/** The king speaks on the throne, then かなめ at the reception a moment after (Issue #147). */
function kingClearTurns(start: number): Turn[] {
  return [
    { actor: PRESIDENT_ID, scene: 'kingClear', at: start },
    { actor: 'kaname', scene: 'seeKingClear', at: start + LINES.clearMs + LINES.kingGapMs },
  ];
}

export function planScene(event: GuildEvent, start: number, context: SceneContext): Scene {
  const actor = actorOf(event);
  if (event.kind === 'issue-closed') {
    return {
      tracks: [],
      bursts: [{ actor, start, particles: createConfetti(context.random) }],
      flights: [],
      turns: clearTurns(actor, start),
    };
  }
  if (event.kind === 'king-quest-cleared') {
    return { tracks: [], bursts: [], flights: [], turns: kingClearTurns(start) };
  }
  if (event.kind === 'level-up') {
    return {
      tracks: [{ actor, segments: hopSegments(context.seats[actor], start) }],
      bursts: [{ actor, start, particles: createConfetti(context.random), levelUp: true }],
      flights: [],
      // The level-up has no line of its own (Issue #47 part 1 covers the scroll, chest and clear).
      turns: [],
    };
  }
  const { seats, tossRandom } = context;
  if (
    event.kind === 'issue-opened' &&
    actor !== 'kaname' &&
    tossRandom !== undefined &&
    shouldToss(seats.kaname, seats[actor], tossRandom)
  ) {
    return tossScene(actor, start, seats);
  }
  const kind = event.kind === 'king-quest-opened' ? 'issue-opened' : event.kind;
  return { ...handoverTracks(kind, actor, start, seats), bursts: [], flights: [] };
}

/** Seats from the guild config (the selected office layout, render/layouts/seats.ts). */
export const DEFAULT_SEATS: Readonly<Record<MemberId, TilePos>> = byMember(
  (id) => MEMBERS[id].seat,
);
