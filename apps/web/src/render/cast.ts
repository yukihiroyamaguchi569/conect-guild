import type { MemberId } from '../guild.config';
import { createAmbientSeeds, type AmbientMoods } from './ambient';
import type { GuildArt } from './art';
import { createAsking, type Asking } from './asking';
import { blessingFor, blessMomentOf, type BlessingLine } from './blessing';
import { createCalls, type CallsOptions, type CallView, type Calls } from './calls';
import type { Random } from './confetti';
import { frameAt, hushed, isAnimating, type Director, type StageFrame } from './director';
import type { IdleSeeds, IdleSince } from './idle';
import { createIdleCrew, type IdleCrew } from './idleCrew';
import type { LinePicker, PickLine, SpokenLines } from './lines';
import {
  murmurMoment,
  murmursAt,
  NO_MURMURS,
  seenMurmurs,
  stepMurmurs,
  type MurmurFrame,
  type Murmurs,
} from './murmurs';
import {
  isFree,
  isRemarking,
  NO_REMARKS,
  pruneRemarks,
  receiveParty,
  remarksAt,
  seenRemarks,
  silenced,
  type RemarkParty,
  type Remarks,
} from './remarks';
import { createPetting, type Petting } from './petting';
import { DEFAULT_SEATS, type SceneContext } from './scenes';
import { decorCuesOf, type DecorCues } from './trinkets';
import { cutVisit } from './visit';

/**
 * The render loop's cast (render/loop.ts): the members' small moves and long idle spells over the
 * director's scenes, the king's calls, the lines on starting to wait (remarks.ts) and the murmurs
 * (murmurs.ts, Issue #47).
 */

/** What the cast takes of a party (loop.StageParty). */
export interface CastParty extends RemarkParty {
  readonly idleSince: IdleSince;
  readonly moods: AmbientMoods;
  /** How many of the king's quests are open: what he murmurs on the throne (murmurs.ts). */
  readonly kingQuests: number;
}

export interface Cast {
  readonly crew: IdleCrew;
  readonly calls: Calls;
  /** The pet's clicks (Issue #186): whether it is up from one now (petting.ts). */
  readonly petting: Petting;
  /** The members' answers to clicks (Issue #191, asking.ts). */
  readonly asking: Asking;
  frame(director: Director, t: number, moods: AmbientMoods): StageFrame;
  /**
   * Takes a new party at stage time `t`: the idle times (members whose time changed walk back), the
   * halt, and who starts waiting (remarks.ts; nothing is said while `quiet`, nothing is drawn).
   */
  receive(director: Director, party: CastParty, at: { t: number; quiet: boolean }): Director;
  /**
   * The remarks at `t` (dropping those that are over), noting those seen over the heads of `view`
   * (remarks.seenRemarks), and whether any shows or is to come.
   */
  remarksAt(
    t: number,
    view: Pick<CallView, 'frame' | 'speeches'>,
  ): { readonly remarks: SpokenLines; readonly remarking: boolean };
  /**
   * The murmur of a frame (murmurs.ts), which a busy stage puts off, noting it if seen over the
   * head in `view` (murmurs.seenMurmurs).
   */
  murmursAt(frame: MurmurFrame, view: Pick<CallView, 'frame' | 'speeches'>): SpokenLines;
  /** Drops the remarks said and to come, and the murmurs start over (the canvas is out of sight). */
  silence(): void;
  /**
   * The king was clicked at `t` (Issue #187): he says a word other than the one he said last, drawn
   * from the talk's random source, unless the click is dropped (blessing.mayBless). True when he
   * says one.
   */
  bless(
    director: Director,
    party: CastParty,
    at: { readonly t: number; readonly paused: boolean },
  ): boolean;
  /**
   * Member `id` was clicked at `t` (Issue #191): they answer with a line of what they do, unless
   * the click is dropped (asking.askSceneOf; a remark of theirs showing or to come drops it too).
   */
  ask(
    id: MemberId,
    director: Director,
    party: CastParty,
    at: { readonly t: number; readonly paused: boolean },
  ): boolean;
}

/** Where the remarks draw their chance and their line from, and tell what was seen (Issue #47). */
export interface Talk {
  readonly random: Random;
  readonly pick: PickLine | undefined;
  readonly saw: LinePicker['saw'];
}

/** The king's words for a click (Cast.bless), through `calls`, never the same twice in a row. */
export function createBless(calls: Calls, random: Random): Cast['bless'] {
  let blessed: BlessingLine | null = null;
  return (director, party, { t, paused }) => {
    const calling = calls.isCalling(t);
    const moment = blessMomentOf({ party, director, calling, paused }, t);
    const words = blessingFor(moment, blessed, random);
    if (words === null || calls.bless(words, t) === null) return false;
    blessed = words;
    return true;
  };
}

/** The members' long idle spells (idleCrew.ts). */
function crewOf(
  random: Random,
  options: Pick<CallsOptions, 'wallNow' | 'onActive'> & { readonly idleSeeds?: IdleSeeds },
): IdleCrew {
  return createIdleCrew({
    random,
    seeds: options.idleSeeds,
    wallNow: options.wallNow ?? (() => Date.now()),
    onActive: options.onActive,
  });
}

/** The members' small moves and long idle spells over the director's scenes, and the king's calls. */
export function createCast(
  art: GuildArt,
  random: Random,
  options: CallsOptions & { readonly idleSeeds?: IdleSeeds },
  talk: Talk,
): Cast {
  const seeds = createAmbientSeeds(random);
  const hasHoldFrames = (id: MemberId): boolean => art.sprites.hasHoldFrames(id);
  const crew = crewOf(random, options);
  const calls = createCalls(options);
  const petting = createPetting();
  const asking = createAsking(crew, calls, talk);
  let remarks: Remarks = NO_REMARKS;
  let murmurs: Murmurs = NO_MURMURS;
  return {
    crew,
    calls,
    petting,
    asking,
    receive: (director, party, at) => {
      petting.setHalted(party.halted);
      if (party.halted) asking.clear();
      // かなめ's visits to the throne dropped with the calls turn back to her counter (visit.ts).
      const cut = calls
        .setHalted(party.halted)
        .reduce((kept, visit) => cutVisit(kept, visit, at.t), director);
      const next = crew.setSince(party.halted ? hushed(cut) : cut, party.idleSince, at.t);
      // After the walks back: a member called home now is not free to speak.
      const free = (id: MemberId) => isFree(next, at.t, id, crew.poses());
      remarks = receiveParty(remarks, party, { ...at, ...talk, free });
      return next;
    },
    remarksAt: (t, view) => {
      talk.saw(seenRemarks(remarks, t, view), t);
      remarks = pruneRemarks(remarks, t);
      return { remarks: remarksAt(remarks, t), remarking: isRemarking(remarks, t) };
    },
    murmursAt: (frame, view) => {
      murmurs = stepMurmurs(
        murmurs,
        murmurMoment(frame, () => crew.activities(), talk),
      );
      talk.saw(seenMurmurs(murmurs, frame, view), frame.t);
      return murmursAt(murmurs, frame.t);
    },
    silence: () => {
      remarks = silenced(remarks);
      murmurs = NO_MURMURS;
      asking.clear();
    },
    bless: createBless(calls, talk.random),
    ask: (id, director, party, at) => asking.ask(id, { director, party }, { ...at, remarks }),
    frame: (director, t, moods) =>
      frameAt(director, t, DEFAULT_SEATS, {
        moods,
        seeds,
        hasHoldFrames,
        idle: crew.frame(director, t),
      }),
  };
}

/**
 * What the stage shows at `t` and `hour`: the members with the king's call, its words, the remarks,
 * the murmurs, the small things, and whether anything still moves or is to come.
 */
export function stageAt(
  cast: Cast,
  director: Director,
  at: { readonly t: number; readonly hour: number; readonly party: CastParty },
): CallView & {
  readonly hour: number;
  readonly remarks: SpokenLines;
  readonly murmurs: SpokenLines;
  readonly animating: boolean;
  readonly cues: DecorCues;
} {
  const { t, party } = at;
  // The king woken by the end of a call (onActive) never leaves the throne: `director` stays good.
  const view = cast.calls.view(() => cast.frame(director, t, party.moods), t);
  const cues = {
    ...decorCuesOf(party.moods, director.bursts, t, view.frame.members),
    petted: cast.petting.isPetted(t, party.halted),
  };
  const said = cast.remarksAt(t, view);
  // The answers to clicks (Issue #191) show where the remarks do, under them, and put the murmurs
  // off too.
  const remarks = { ...cast.asking.linesAt(t), ...said.remarks };
  cast.asking.drew(t, view.frame.members, (id) => {
    const { speeches, frame: drawn } = view;
    return [speeches[id], drawn.lines[id], said.remarks[id]].some((top) => top !== undefined);
  });
  const remarking = said.remarking || cast.asking.isAnswering(t, null);
  const animating = isAnimating(director, t) || remarking;
  const frame = { ...at, members: view.frame.members, busy: animating || view.calling };
  const murmurs = cast.murmursAt(frame, view);
  return { ...view, hour: at.hour, remarks, murmurs, animating, cues };
}

/**
 * Where the remarks (remarks.ts) draw their chance and their line from: `lineRandom` and the picker
 * of the scenes, so a member does not repeat a line whichever way it came.
 */
export function talkOf(
  options: { readonly lineRandom?: Random },
  context: SceneContext & { readonly sawLines: LinePicker['saw'] },
): Talk {
  return {
    random: options.lineRandom ?? Math.random,
    pick: context.pickLine,
    saw: context.sawLines,
  };
}
