import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';
import { documentVisibility } from '../adapters/visibility';
import { createSoundController } from '../audio/controller';
import type { PartyMember } from '../audio/judge';
import { createTonePlayer } from '../audio/player';
import type { GuildMessage } from './messageQueue';

export interface SoundSources {
  /** The head of the message queue (useGuild). */
  readonly message: Readonly<Ref<GuildMessage | null>>;
  readonly party: Readonly<Ref<readonly PartyMember[]>>;
  readonly halted: () => boolean;
}

/** Events that count as the viewer acting, which lets the browser start audio. */
const UNLOCK_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Binds the sound effects to what the guild screen shows, for a component's lifetime. The settings
 * are kept in `storage` (localStorage by default; the demo mode keeps them in memory).
 */
export function useSound(sources: SoundSources, storage: KeyValueStore = createKeyValueStore()) {
  const controller = createSoundController({ player: createTonePlayer(), storage });
  const settings = shallowRef(controller.settings());
  const syncHidden = () => {
    controller.setHidden(documentVisibility.isHidden());
  };
  const unlock = () => {
    controller.unlock();
  };
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    syncHidden();
    unsubscribe = documentVisibility.subscribe(syncHidden);
    for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, { capture: true });
  });
  onBeforeUnmount(() => {
    unsubscribe?.();
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, { capture: true });
  });

  // One watcher for the halt, the party and the message: a fetch that changes several of them is
  // handed over whole, so the controller judges them in its own order, not the watchers'.
  watch(
    () => ({
      halted: sources.halted(),
      party: sources.party.value,
      message: sources.message.value,
    }),
    (screen) => {
      controller.screenChanged(screen);
    },
    { immediate: true },
  );

  return {
    settings,
    toggleSound: () => {
      controller.toggle();
      settings.value = controller.settings();
    },
    cycleVolume: () => {
      controller.cycleVolume();
      settings.value = controller.settings();
    },
    /** A quest card opened (Issue #268): the flip's sound. */
    cardOpened: () => {
      controller.cardOpened();
    },
    /** The canvas started a call of the king (Issue #28): its sound rings with it. */
    callStarted: () => {
      controller.callStarted();
    },
  };
}
