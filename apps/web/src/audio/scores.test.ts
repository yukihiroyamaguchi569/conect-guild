import { describe, expect, it } from 'vitest';
import {
  midiToFrequency,
  SCORES,
  scoreLengthMs,
  toTones,
  type Score,
  type SoundCue,
} from './scores';

const CUES: readonly SoundCue[] = [
  'scroll',
  'chest',
  'clear',
  'levelup',
  'permission',
  'summon',
  'text',
  'card',
];

const pitches = (cue: SoundCue) => SCORES[cue].notes.flatMap((note) => note.midi ?? []);

describe('midiToFrequency', () => {
  it('maps A4 to 440 Hz and an octave to a doubling', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(81)).toBeCloseTo(880);
    expect(midiToFrequency(57)).toBeCloseTo(220);
  });

  it('maps C5 to about 523.25 Hz', () => {
    expect(midiToFrequency(72)).toBeCloseTo(523.25, 2);
  });
});

describe('SCORES', () => {
  it.each(CUES)('%s is short enough not to pile up (under 1.2 s)', (cue) => {
    expect(scoreLengthMs(SCORES[cue])).toBeGreaterThan(0);
    expect(scoreLengthMs(SCORES[cue])).toBeLessThan(1200);
  });

  it.each(CUES)('%s keeps its notes in an audible, chip-like range', (cue) => {
    for (const midi of pitches(cue)) {
      expect(midi).toBeGreaterThanOrEqual(60);
      expect(midi).toBeLessThanOrEqual(100);
    }
    expect(SCORES[cue].gain).toBeGreaterThan(0);
    expect(SCORES[cue].gain).toBeLessThanOrEqual(1);
  });

  it('scroll rises (ピロリン)', () => {
    expect(pitches('scroll')).toEqual([83, 88, 95]);
  });

  it('chest ends on its highest note, held longest (fanfare)', () => {
    const notes = SCORES.chest.notes;
    const last = notes.at(-1);
    expect(last?.midi).toBe(Math.max(...pitches('chest')));
    expect(last?.ms).toBe(Math.max(...notes.map((note) => note.ms)));
  });

  it('clear runs up twice and ends higher than it started (level up)', () => {
    const p = pitches('clear');
    expect(p.slice(0, 4)).toEqual(p.slice(0, 4).toSorted((a, b) => a - b));
    expect(p.slice(4, 8)).toEqual(p.slice(4, 8).toSorted((a, b) => a - b));
    expect(p.at(-1)).toBe(Math.max(...p));
  });

  it('levelup is longer than the clear and ends on its highest note, held longest', () => {
    const notes = SCORES.levelup.notes;
    expect(scoreLengthMs(SCORES.levelup)).toBeGreaterThan(scoreLengthMs(SCORES.clear));
    expect(notes.at(-1)?.midi).toBe(Math.max(...pitches('levelup')));
    expect(notes.at(-1)?.ms).toBe(Math.max(...notes.map((note) => note.ms)));
  });

  it('levelup is a tune of its own, not the clear again', () => {
    expect(pitches('levelup')).not.toEqual(pitches('clear'));
    expect(pitches('levelup').slice(0, 4)).toEqual([77, 81, 84, 89]);
  });

  it('permission is exactly two notes, high then low', () => {
    const p = pitches('permission');
    expect(p).toHaveLength(2);
    expect(p[0]).toBeGreaterThan(p[1] ?? Infinity);
  });

  it('summon is two notes rising, lower than every note of the other cues (the king)', () => {
    const p = pitches('summon');
    expect(p).toHaveLength(2);
    expect(p[1]).toBeGreaterThan(p[0] ?? Infinity);
    for (const cue of CUES.filter((c) => c !== 'summon'))
      expect(Math.max(...p)).toBeLessThan(Math.min(...pitches(cue)));
  });

  it('text is three equal blips, quieter than the others', () => {
    expect(pitches('text')).toEqual([96, 96, 96]);
    for (const cue of CUES.filter((c) => c !== 'text'))
      expect(SCORES.text.gain).toBeLessThan(SCORES[cue].gain);
  });
});

describe('toTones', () => {
  const score: Score = {
    wave: 'square',
    gain: 0.5,
    notes: [
      { midi: 69, ms: 100 },
      { midi: null, ms: 50 },
      { midi: 81, ms: 200 },
    ],
  };

  it('lays the notes end to end from the start time, skipping rests', () => {
    const tones = toTones(score, 2, 0.2);
    expect(tones).toHaveLength(2);
    expect(tones[0]).toEqual({ frequency: 440, wave: 'square', start: 2, stop: 2.1, gain: 0.1 });
    expect(tones[1]?.frequency).toBeCloseTo(880);
    expect(tones[1]?.start).toBeCloseTo(2.15);
    expect(tones[1]?.stop).toBeCloseTo(2.35);
  });

  it('ends at the start plus the score length', () => {
    const tones = toTones(SCORES.chest, 0, 1);
    expect(tones.at(-1)?.stop).toBeCloseTo(scoreLengthMs(SCORES.chest) / 1000);
  });

  it('returns nothing at volume 0', () => {
    expect(toTones(score, 0, 0)).toEqual([]);
  });

  it('returns nothing for a score with only rests or no notes', () => {
    expect(toTones({ ...score, notes: [{ midi: null, ms: 100 }] }, 0, 1)).toEqual([]);
    expect(toTones({ ...score, notes: [] }, 0, 1)).toEqual([]);
  });
});

describe('SCORES.card', () => {
  it('card is a soft rising sweep on the triangle wave, as short as the flip (Issue #268)', () => {
    const p = pitches('card');
    expect(SCORES.card.wave).toBe('triangle');
    for (let i = 1; i < p.length; i += 1) expect(p[i]).toBeGreaterThan(p[i - 1] ?? Infinity);
    expect(scoreLengthMs(SCORES.card)).toBeLessThanOrEqual(300);
    expect(SCORES.card.gain).toBeLessThan(SCORES.scroll.gain);
    expect(SCORES.card).not.toEqual(SCORES.scroll);
  });
});
