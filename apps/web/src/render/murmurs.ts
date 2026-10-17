import { PRESIDENT_ID } from '@conect-guild/snapshot/settings';
import type { MemberId } from '../guild.config';
import type { Bubbles } from './bubbles';
import type { Random } from './confetti';
import { dayPhaseOf, type DayPhase } from './daylight';
import type { IdleActivity, IdleSince } from './idle';
import type { PlayKind } from './idleSpots';
import type { LineScene } from './lineBook';
import { linesAt, type PickLine, type SpokenLines, type Utterance } from './lines';
import { LINES } from './metrics';

/**
 * Murmurs while nothing happens (Issue #47, docs/DESIGN.md 4.12): one member of the whole guild at
 * a time says a line of what they are doing for `LINES.murmurMs`, `LINES.murmurGapMinMs` to
 * `LINES.murmurGapMaxMs` after the one before. A scene (a level-up too), the king's call and a
 * remark (remarks.ts) put the next one off. Pure: the stage time, the wall time, the hour, who
 * may speak and the random source (`lineRandom`, render/loop.ts) are passed in.
 */

/** Someone who may murmur now, and at what. */
export interface MurmurCandidate {
  readonly id: MemberId;
  readonly scene: LineScene;
}

const WINDOW_SCENES: Readonly<Record<DayPhase, LineScene>> = {
  morning: 'windowMorning',
  day: 'windowDay',
  evening: 'windowEvening',
  night: 'windowNight',
};

const PLAY_SCENES: Readonly<Record<Exclude<PlayKind, 'window'>, LineScene>> = {
  tea: 'tea',
  pet: 'pet',
  chat: 'chat',
};

/** What a member staying at a play spot murmurs; under the window, by the part of the day. */
export function playScene(kind: PlayKind, hour: number): LineScene {
  return kind === 'window' ? WINDOW_SCENES[dayPhaseOf(hour)] : PLAY_SCENES[kind];
}

/** A member as the murmurs see them this frame. */
export interface MurmurMember {
  readonly id: MemberId;
  /** In a scene or walking back from play (director.inScene). */
  readonly inScene: boolean;
  /** Their feet on their seat (director.isAtSeat). */
  readonly atSeat: boolean;
}

/** The party and the long idle spells now. */
export interface MurmurParty {
  readonly bubbles: Bubbles;
  /** Members with nothing to do (idle.ts); the others have work at the desk. */
  readonly idleSince: IdleSince;
  /** What the members in a long idle spell do now (idle.idleActivities at `wall`). */
  readonly activities: Readonly<Partial<Record<MemberId, IdleActivity>>>;
  /** Epoch ms, the time of the activities. */
  readonly wall: number;
  /** The local hour, 0 to 24 (daylight.hourOf). */
  readonly hour: number;
  /** How many of the king's quests are open (the party window's 「やること N 件」, Issue #141). */
  readonly kingQuests: number;
}

/** What a member out playing murmurs: only while staying at the spot, not on the way. */
function outingScene(activity: IdleActivity, party: MurmurParty): LineScene | null {
  if (activity.kind !== 'play') return activity.kind === 'sleep' ? 'sleepTalk' : 'doze';
  const { outing } = activity;
  const staying = outing.out.end <= party.wall && party.wall < outing.back.start;
  return staying ? playScene(outing.spot.kind, party.hour) : null;
}

/**
 * What the king murmurs awake on the throne (Issue #151): of his work while any of his quests is
 * open, of their pile from `LINES.kingPiledQuests` on; his idle talk only with none.
 */
function kingSeatScene(quests: number): LineScene {
  if (quests === 0) return 'idle';
  return quests < LINES.kingPiledQuests ? 'kingWork' : 'kingWorkPiled';
}

/**
 * The king with something to approve (his 「承認まち」 bubble in the page): he is not restful then,
 * the only state the king has besides it. He says nothing then, and stops a murmur he is saying.
 */
function kingAwaiting(id: MemberId, idleSince: IdleSince): boolean {
  return id === 'yukihiro' && idleSince[id] === undefined;
}

/**
 * What `member` would murmur now, or null when they say nothing: in a scene, with a waiting bubble,
 * on the way to or from a play spot, or the king with something to approve (kingAwaiting).
 */
export function murmurSceneOf(member: MurmurMember, party: MurmurParty): LineScene | null {
  const { id } = member;
  if (member.inScene || party.bubbles[id] !== undefined) return null;
  if (kingAwaiting(id, party.idleSince)) return null;
  const restful = party.idleSince[id] !== undefined;
  const activity = party.activities[id];
  if (activity !== undefined) return outingScene(activity, party);
  if (!member.atSeat) return null;
  if (!restful) return 'work';
  return id === PRESIDENT_ID ? kingSeatScene(party.kingQuests) : 'idle';
}

/** How many of the king's quests are open, from the party rows (app/guildView.PartyRow). */
export function kingQuestCountOf(
  rows: readonly { readonly id: MemberId; readonly quests: number }[],
): number {
  return rows.find((row) => row.id === PRESIDENT_ID)?.quests ?? 0;
}

/** Everyone who may murmur now, in the order of `members`. */
export function murmurCandidates(
  members: readonly MurmurMember[],
  party: MurmurParty,
): MurmurCandidate[] {
  return members.flatMap((member) => {
    const scene = murmurSceneOf(member, party);
    return scene === null ? [] : [{ id: member.id, scene }];
  });
}

function weightOf(candidate: MurmurCandidate): number {
  return candidate.scene === 'sleepTalk' ? LINES.sleepTalkWeight : 1;
}

/**
 * Who murmurs: one of `candidates` other than the one who murmured last, chosen by weight (a
 * sleeper `LINES.sleepTalkWeight`, anyone else 1); null when nobody else may. No number is drawn
 * then.
 */
export function chooseSpeaker(
  candidates: readonly MurmurCandidate[],
  last: MemberId | null,
  random: Random,
): MurmurCandidate | null {
  const others = candidates.filter((candidate) => candidate.id !== last);
  if (others.length === 0) return null;
  const total = others.reduce((sum, candidate) => sum + weightOf(candidate), 0);
  let left = random() * total;
  for (const candidate of others) {
    left -= weightOf(candidate);
    if (left < 0) return candidate;
  }
  return others.at(-1) ?? null;
}

/** The wait until the next murmur, evenly from `murmurGapMinMs` to `murmurGapMaxMs`. */
export function murmurGap(random: Random): number {
  const span = LINES.murmurGapMaxMs - LINES.murmurGapMinMs;
  return LINES.murmurGapMinMs + Math.min(Math.floor(random() * (span + 1)), span);
}

export interface Murmurs {
  /** Stage time the next murmur is due; null before the first party and after a halt. */
  readonly next: number | null;
  /** The murmur showing (or just over). */
  readonly said: Utterance | null;
  /** Who murmured last: not the next one. */
  readonly last: MemberId | null;
  /** The last frame was busy: the first quiet one puts the next off by `murmurRestMs`. */
  readonly busy: boolean;
}

export const NO_MURMURS: Murmurs = { next: null, said: null, last: null, busy: false };

export interface MurmurMoment {
  /** Stage time now. */
  readonly t: number;
  /** Nobody murmurs: before the first snapshot, or halted (all is forgotten). */
  readonly off: boolean;
  /** A scene (a level-up too), a call of the king or a remark plays now. */
  readonly busy: boolean;
  /** Who may murmur now; asked only when one is due. */
  readonly candidates: () => readonly MurmurCandidate[];
  /** Whether `actor` must stop the murmur they are saying now (the king awaiting approval). */
  readonly hushed: (actor: MemberId) => boolean;
  readonly random: Random;
  /** Without one nothing is said. */
  readonly pick: PickLine | undefined;
}

/** A murmur of `candidate` from `t`, or null when they have nothing to say there. */
function utter(
  candidate: MurmurCandidate,
  t: number,
  pick: PickLine | undefined,
): Utterance | null {
  const line = pick?.(candidate.id, candidate.scene, []) ?? null;
  return line === null ? null : { actor: candidate.id, line, start: t, end: t + LINES.murmurMs };
}

/** The murmur `said` while it lasts and its speaker is not hushed (Issue #165), else null. */
function stillSaid(said: Utterance | null, moment: MurmurMoment): Utterance | null {
  if (said === null || said.end <= moment.t) return null;
  return moment.hushed(said.actor) ? null : said;
}

/**
 * The murmurs at `moment.t`, called on every frame. The first frame plans the first one; a busy
 * frame drops the one showing, and the first quiet frame after it puts the next off to at least
 * `murmurRestMs` from then (however long the frames were apart); once one is due someone says a
 * line, and the next is planned from its end. When nobody may, or has nothing left to say, nothing
 * is said and the next is planned from now. A frame where the speaker is hushed (the king awaiting
 * approval, Issue #165) drops the murmur too; the next stays planned from its end.
 */
export function stepMurmurs(murmurs: Murmurs, moment: MurmurMoment): Murmurs {
  const { t, random } = moment;
  if (moment.off) return NO_MURMURS;
  const planned = murmurs.next ?? t + murmurGap(random);
  if (moment.busy) return { ...murmurs, said: null, next: planned, busy: true };
  const next = murmurs.busy ? Math.max(planned, t + LINES.murmurRestMs) : planned;
  const said = stillSaid(murmurs.said, moment);
  if (said !== null || t < next) return { ...murmurs, said, next, busy: false };
  return murmurNow(murmurs.last, moment);
}

/** A murmur due now: someone says a line and the next is planned from its end, or from now. */
function murmurNow(last: MemberId | null, moment: MurmurMoment): Murmurs {
  const { t, random } = moment;
  const speaker = chooseSpeaker(moment.candidates(), last, random);
  const spoken = speaker === null ? null : utter(speaker, t, moment.pick);
  if (spoken === null) return { said: null, last, next: t + murmurGap(random), busy: false };
  return { said: spoken, last: spoken.actor, next: spoken.end + murmurGap(random), busy: false };
}

/** A frame as the murmurs see it (render/loop.ts). */
export interface MurmurFrame {
  readonly t: number;
  readonly hour: number;
  readonly party: Pick<MurmurParty, 'bubbles' | 'idleSince' | 'kingQuests'> & {
    /** False before the first snapshot. */
    readonly known: boolean;
    readonly halted: boolean;
  };
  readonly members: readonly MurmurMember[];
  /** A scene (a level-up too), a call of the king or a remark plays now. */
  readonly busy: boolean;
}

/**
 * The moment of a frame: off before the first snapshot and while halted, and who may murmur, with
 * the long idle spells read only when asked (`idle`).
 */
export function murmurMoment(
  frame: MurmurFrame,
  idle: () => Pick<MurmurParty, 'activities' | 'wall'>,
  talk: { readonly random: Random; readonly pick: PickLine | undefined },
): MurmurMoment {
  const { t, hour, party, members, busy } = frame;
  const candidates = () => murmurCandidates(members, { ...party, ...idle(), hour });
  const hushed = (actor: MemberId) => kingAwaiting(actor, party.idleSince);
  return { t, off: party.halted || !party.known, busy, candidates, hushed, ...talk };
}

/**
 * The murmur seen over the head at `frame.t`: showing, and nothing above it there (the member in a
 * scene, the king's call, a waiting bubble). Only a murmur seen counts as said for not repeating a
 * line (lines.createLinePicker).
 */
export function seenMurmurs(
  murmurs: Murmurs,
  frame: Pick<MurmurFrame, 't' | 'members'> & { readonly party: Pick<MurmurParty, 'bubbles'> },
  view: { readonly speeches: Readonly<Partial<Record<MemberId, unknown>>> },
): Utterance[] {
  const { said } = murmurs;
  const { t, party, members } = frame;
  if (said === null || t < said.start || said.end <= t) return [];
  const { actor } = said;
  const inScene = members.some((member) => member.id === actor && member.inScene);
  const covered = view.speeches[actor] !== undefined || party.bubbles[actor] !== undefined;
  return inScene || covered ? [] : [said];
}

/** Who murmurs at `t`. */
export function murmursAt(murmurs: Murmurs, t: number): SpokenLines {
  return murmurs.said === null ? {} : linesAt([murmurs.said], t);
}
