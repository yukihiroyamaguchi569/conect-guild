import type { KeyValueStore } from '../adapters/storage';
import type { GuildEvent } from '../domain/events';
import { callRings, cueForMessage, mayPlay, newlyAwaiting, type PartyMember } from './judge';
import type { TonePlayer } from './player';
import { SCORES, scoreLengthMs, type SoundCue } from './scores';
import {
  loadSoundSettings,
  nextVolume,
  saveSoundSettings,
  VOLUME_GAIN,
  type SoundSettings,
} from './settings';

/**
 * Decides when the sound effects ring (docs/DESIGN.md 6 章 M4). It hears what the screen does —
 * a message reaching the window, a new party, the page hidden, the screen halted — and plays
 * through the injected player. Nothing that is missed is played later.
 */
export interface SoundController {
  settings(): SoundSettings;
  /** The 音 button. Turning it on unlocks the audio (call from the click) and blips once. */
  toggle(): void;
  /** The 音量 button: 1 → 2 → 3 → 1, with a blip at the new level when the sound is on. */
  cycleVolume(): void;
  /** Any click or key press: lets a sound turned on in an earlier visit play again. */
  unlock(): void;
  /**
   * What the screen shows now, handed over whole on every change so that a fetch that changes
   * several parts at once is judged in one fixed order: the halt, then the party, then the message.
   */
  screenChanged(screen: SoundScreen): void;
  /**
   * A call of the king starts on the stage (Issue #28): it rings with it, unless another sound
   * still plays. The stage starts a call only while it is seen, after the call before it.
   */
  callStarted(): void;
  /** A quest card opened (Issue #268): its flip rings once, as every sound may. */
  cardOpened(): void;
  setHidden(hidden: boolean): void;
}

export interface SoundScreen {
  readonly halted: boolean;
  /** The party rows (empty before the first snapshot); a newly waiting member rings once. */
  readonly party: readonly PartyMember[];
  /** The head of the message queue; it rings once, when a new id reaches the window. */
  readonly message: { readonly id: number; readonly event: GuildEvent | null } | null;
}

export interface SoundControllerOptions {
  readonly player: TonePlayer;
  readonly storage: KeyValueStore;
  /** Ms on any steady clock (performance.now by default), to know when a sound is over. */
  readonly now?: () => number;
}

export function createSoundController(options: SoundControllerOptions): SoundController {
  const { player, storage } = options;
  let settings = loadSoundSettings(storage);
  let hidden = false;
  let halted = false;
  let previousParty: readonly PartyMember[] | null = null;
  let lastMessageId: number | null = null;
  const now = options.now ?? (() => performance.now());
  // When the last sound other than the king's call is over; null before any.
  let otherEndsAt: number | null = null;

  function play(cue: SoundCue): void {
    if (!mayPlay({ enabled: settings.enabled, hidden, halted })) return;
    const played = player.play(SCORES[cue], VOLUME_GAIN[settings.volume]);
    // Only a sound that really rings (not while the audio is suspended) makes the call wait.
    if (played && cue !== 'summon') {
      // Sounds that start together may end apart: the call waits for the last of them.
      otherEndsAt = Math.max(otherEndsAt ?? 0, now() + scoreLengthMs(SCORES[cue]));
    }
  }

  function update(next: SoundSettings): void {
    settings = next;
    saveSoundSettings(storage, settings);
  }

  function partyChanged(rows: readonly PartyMember[]): void {
    // No rows before the first snapshot: the first real party is the starting point.
    if (rows.length === 0) return;
    const fresh = newlyAwaiting(previousParty, rows);
    previousParty = rows;
    // One alert however many start waiting together.
    if (fresh.length > 0) play('permission');
  }

  /** The feedback blip of the buttons, once the audio is unlocked by the same click. */
  function blip(): void {
    void player.unlock().then(() => {
      play('text');
    });
  }

  return {
    settings: () => settings,
    toggle() {
      update({ ...settings, enabled: !settings.enabled });
      if (settings.enabled) blip();
    },
    cycleVolume() {
      update({ ...settings, volume: nextVolume(settings.volume) });
      if (settings.enabled) blip();
    },
    unlock() {
      if (settings.enabled) void player.unlock();
    },
    screenChanged(screen) {
      // The party kept from before a halt is stale: the first one after it (of this same fetch)
      // is only the new starting point, so waits that began meanwhile do not ring.
      if (halted && !screen.halted) previousParty = null;
      halted = screen.halted;
      partyChanged(screen.party);
      const message = screen.message;
      if (message !== null && message.id !== lastMessageId) play(cueForMessage(message));
      lastMessageId = message?.id ?? null;
    },
    callStarted() {
      if (callRings(now(), otherEndsAt)) play('summon');
    },
    cardOpened() {
      play('card');
    },
    setHidden(next) {
      hidden = next;
    },
  };
}
