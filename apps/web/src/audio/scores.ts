/**
 * The sound effects as plain data: famicom-like beeps played by oscillators, no sound files
 * (docs/DESIGN.md 6 章 M4). A score is a list of notes; `toTones` turns it into timed tones.
 */

export type SoundCue =
  'scroll' | 'chest' | 'clear' | 'levelup' | 'permission' | 'summon' | 'text' | 'card';

export type Wave = 'square' | 'triangle';

export interface Note {
  /** MIDI note number (69 = A4 = 440 Hz); null is a rest. */
  readonly midi: number | null;
  readonly ms: number;
}

export interface Score {
  readonly wave: Wave;
  /** Loudness relative to the other scores (1 = full). */
  readonly gain: number;
  readonly notes: readonly Note[];
}

const n = (midi: number | null, ms: number): Note => ({ midi, ms });

/** Each cue's notes. Short, so a few can follow one another without piling up. */
export const SCORES: Readonly<Record<SoundCue, Score>> = {
  // 巻物を受け取る: a quick rising ピロリン (B5 E6 B6).
  scroll: { wave: 'square', gain: 0.8, notes: [n(83, 70), n(88, 70), n(95, 180)] },
  // 宝箱を届ける: a short fanfare (C E G C, then G C held).
  chest: {
    wave: 'square',
    gain: 0.8,
    notes: [n(72, 90), n(76, 90), n(79, 90), n(84, 120), n(null, 60), n(79, 90), n(84, 360)],
  },
  // クリア: a level-up run, C major then D major, ending high on E6.
  clear: {
    wave: 'square',
    gain: 0.8,
    notes: [
      n(72, 60),
      n(76, 60),
      n(79, 60),
      n(84, 60),
      n(null, 40),
      n(74, 60),
      n(78, 60),
      n(81, 60),
      n(86, 60),
      n(88, 360),
    ],
  },
  // レベルアップ (Issue #19): an original tune, longer and brighter than the clear. An F major run
  // up to F6, a step up E6 F6 G6 to A6, then G6 A6 and a held C7, the highest note.
  levelup: {
    wave: 'square',
    gain: 0.8,
    notes: [
      n(77, 60),
      n(81, 60),
      n(84, 60),
      n(89, 60),
      n(null, 40),
      n(88, 60),
      n(89, 60),
      n(91, 60),
      n(93, 120),
      n(null, 40),
      n(91, 60),
      n(93, 60),
      n(96, 330),
    ],
  },
  // 許可待ち: two notes, high then low (ピンポン), to draw attention.
  permission: { wave: 'triangle', gain: 1, notes: [n(88, 160), n(null, 40), n(81, 320)] },
  // 王様の呼びかけ (Issue #28): two low notes up a fourth, D4 then G4 (ポ・ポン), lower than every other cue.
  summon: { wave: 'square', gain: 0.7, notes: [n(62, 90), n(null, 30), n(67, 180)] },
  // クエストのカードをめくる (Issue #268): a soft, quick sweep up on the triangle wave (シュルッ),
  // landing on a short D7, as long as the flip itself.
  card: {
    wave: 'triangle',
    gain: 0.6,
    notes: [n(79, 30), n(83, 30), n(86, 30), n(91, 30), n(98, 120)],
  },
  // 文字送り: three soft, very short blips (ピピピ).
  text: {
    wave: 'square',
    gain: 0.35,
    notes: [n(96, 30), n(null, 40), n(96, 30), n(null, 40), n(96, 30)],
  },
};

/** One oscillator's sound, in seconds on the audio clock. */
export interface Tone {
  readonly frequency: number;
  readonly wave: Wave;
  readonly start: number;
  readonly stop: number;
  readonly gain: number;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The total length of a score in ms (rests included). */
export function scoreLengthMs(score: Score): number {
  return score.notes.reduce((sum, note) => sum + note.ms, 0);
}

/** The tones of `score` played from `startSec`, at `volume` (0..1) times the score's gain. */
export function toTones(score: Score, startSec: number, volume: number): Tone[] {
  const tones: Tone[] = [];
  let at = startSec;
  for (const note of score.notes) {
    const stop = at + note.ms / 1000;
    if (note.midi !== null && volume > 0) {
      tones.push({
        frequency: midiToFrequency(note.midi),
        wave: score.wave,
        start: at,
        stop,
        gain: volume * score.gain,
      });
    }
    at = stop;
  }
  return tones;
}
