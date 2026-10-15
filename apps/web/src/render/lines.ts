import type { MemberId } from '../guild.config';
import type { Random } from './confetti';
import { hasOwnLines, linesOf, sceneOfLine, type LineScene, type SpokenLine } from './lineBook';
import { LINES } from './metrics';

/**
 * The members' lines at the moments of a scene (Issue #47, docs/DESIGN.md 4.12). Pure but for
 * createLinePicker, whose memory of the last lines seen is the only state: the times are passed in and
 * the random source is injected (`lineRandom` in render/loop.ts, apart from the confetti's and the
 * toss's, so their sequences stay as they were).
 *
 * A scene says who speaks at which moment (`Turn`, scenes.ts); the director turns them into lines
 * on the stage clock (`Utterance`) when it schedules the scene, so a hidden page stops them with
 * everything else and a hidden canvas drops them with the scenes.
 */

/** Someone speaks at a moment of a scene, from `at` (stage ms) or when the one before is done. */
export interface Turn {
  readonly actor: MemberId;
  readonly scene: LineScene;
  readonly at: number;
}

/** A line over a member's head from `start` to `end` (exclusive), on the stage clock. */
export interface Utterance {
  readonly actor: MemberId;
  readonly line: SpokenLine;
  readonly start: number;
  readonly end: number;
}

/**
 * Chooses what `actor` says at `scene`, other than the lines of theirs still to show or showing
 * (`pending`); null when they say nothing there.
 */
export type PickLine = (
  actor: MemberId,
  scene: LineScene,
  pending: readonly SpokenLine[],
) => SpokenLine | null;

/** Who says which line at a moment. */
export type SpokenLines = Readonly<Partial<Record<MemberId, SpokenLine>>>;

const SHOW_MS: Readonly<Record<LineScene, number>> = {
  handOver: LINES.giveMs,
  deliverChest: LINES.giveMs,
  toss: LINES.tossMs,
  takeScroll: LINES.takeMs,
  takeChest: LINES.takeMs,
  clear: LINES.clearMs,
  seeClear: LINES.kingMs,
  kingClear: LINES.clearMs,
  seeKingClear: LINES.kingMs,
  awaitPresident: LINES.remarkMs,
  awaitKaname: LINES.remarkMs,
  awaitPermission: LINES.remarkMs,
  work: LINES.murmurMs,
  idle: LINES.murmurMs,
  doze: LINES.murmurMs,
  sleepTalk: LINES.murmurMs,
  tea: LINES.murmurMs,
  pet: LINES.murmurMs,
  chat: LINES.murmurMs,
  windowMorning: LINES.murmurMs,
  windowDay: LINES.murmurMs,
  windowEvening: LINES.murmurMs,
  windowNight: LINES.murmurMs,
};

/** How long a line of `scene` shows. */
export function showMs(scene: LineScene): number {
  return SHOW_MS[scene];
}

/** The last lines to avoid out of `count` to choose from: always leaves one to say. */
function avoidedOf<L>(count: number, recent: readonly L[]): readonly L[] {
  const keep = Math.min(LINES.recentLines, count - 1);
  return keep > 0 ? recent.slice(-keep) : [];
}

/**
 * One of `options` that is not among the last ones seen (`recent`, oldest first) nor still to show
 * (`pending`), chosen evenly by `random`. Null when that leaves none (the member says nothing this
 * time rather than a line said lately or about to be said) or there are none.
 */
export function pickLine<L>(
  options: readonly L[],
  recent: readonly L[],
  random: Random,
  pending: readonly L[] = [],
): L | null {
  const avoided = [...avoidedOf(options.length, recent), ...pending];
  const fresh = options.filter((line) => !avoided.includes(line));
  // No number is drawn for nothing to say, so the sequence goes on as if it was never asked.
  if (fresh.length === 0) return null;
  const index = Math.min(Math.floor(random() * fresh.length), fresh.length - 1);
  return fresh[index] ?? null;
}

/** `recent` with `line` said last, keeping as many as pickLine may avoid. */
export function remember<L>(recent: readonly L[], line: L): L[] {
  return [...recent, line].slice(-LINES.recentLines);
}

export interface LinePicker {
  readonly pick: PickLine;
  /**
   * The lines over the heads in the frame at `now` (seenLines): each is remembered once, from the
   * first frame it is seen in, even if the king's call hides it a while and it shows again. A line
   * dropped before it shows (halted, a hidden canvas) or hidden all along (the king's call) is
   * never seen, so it is not among the last ones.
   */
  saw(lines: readonly Utterance[], now: number): void;
}

/**
 * Where the last lines seen of `actor` at `scene` are kept: per member and moment, but the shared
 * lines (lineBook.SHARED_LINES) for everyone at once, so one member does not say again what another
 * has just said there.
 */
function memoryKey(actor: MemberId, scene: LineScene): string {
  return hasOwnLines(actor, scene) ? `${actor}:${scene}` : `shared:${scene}`;
}

/** Picks from the line book, remembering the last lines seen of each member at each moment. */
export function createLinePicker(random: Random): LinePicker {
  const memory = new Map<string, readonly SpokenLine[]>();
  /** The lines already remembered, by member and start (one member says one line at a time). */
  const seen = new Map<string, number>();
  return {
    pick: (actor, scene, pending) =>
      pickLine(linesOf(actor, scene), memory.get(memoryKey(actor, scene)) ?? [], random, pending),
    saw(lines, now) {
      for (const said of lines) {
        const id = `${said.actor}@${String(said.start)}`;
        const scene = sceneOfLine(said.actor, said.line);
        if (seen.has(id) || scene === null) continue;
        seen.set(id, said.end);
        const key = memoryKey(said.actor, scene);
        memory.set(key, remember(memory.get(key) ?? [], said.line));
      }
      for (const [id, end] of seen) if (end <= now) seen.delete(id);
    },
  };
}

/** The lines seen over the heads at `now`: those showing, but where the king's call has the head. */
export function seenLines(
  lines: readonly Utterance[],
  now: number,
  speeches: Readonly<Partial<Record<MemberId, unknown>>>,
): Utterance[] {
  return lines.filter(
    (said) => said.start <= now && now < said.end && speeches[said.actor] === undefined,
  );
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The lines of a scene's turns, one after another: each starts at its time or when the line before
 * ends, so two never show at once. A turn that would show while its member still says something
 * (`said`, from another scene) is dropped, not delayed; so is one nobody picks a line for. Without
 * `pick` nothing is said (the message queue plans scenes only to time them).
 */
export function speakInTurn(
  turns: readonly Turn[],
  said: readonly Utterance[],
  pick: PickLine | undefined,
): Utterance[] {
  if (pick === undefined) return [];
  const spoken: Utterance[] = [];
  let free = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    const start = Math.max(turn.at, free);
    const slot = { start, end: start + showMs(turn.scene) };
    const busy = said.some((other) => other.actor === turn.actor && overlaps(other, slot));
    const pending = said.filter((other) => other.actor === turn.actor).map((other) => other.line);
    const line = busy ? null : pick(turn.actor, turn.scene, pending);
    if (line === null) continue;
    spoken.push({ actor: turn.actor, line, ...slot });
    free = slot.end;
  }
  return spoken;
}

/** Who says what at `now`. */
export function linesAt(lines: readonly Utterance[], now: number): SpokenLines {
  const shown: Partial<Record<MemberId, SpokenLine>> = {};
  for (const said of lines) if (said.start <= now && now < said.end) shown[said.actor] = said.line;
  return shown;
}
