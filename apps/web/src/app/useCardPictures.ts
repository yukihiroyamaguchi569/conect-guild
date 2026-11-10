import { shallowRef, type Ref } from 'vue';
import { loadCardIndex, type CardIndex } from '../adapters/cardIndex';

export interface CardPictures {
  /** The list read; null before one, while reading again and after a failed read. */
  readonly index: Readonly<Ref<CardIndex | null>>;
  /** Reads the list again, e.g. when a card opens, so a picture drawn since then shows. */
  readonly refresh: () => void;
}

/**
 * The list of the quests' own pictures (Issue #271). Off (`enabled` false, the demo) it never
 * asks: the demo's quests are fictional and have no pictures. A read that ends after a newer one
 * is dropped.
 */
export function useCardPictures(
  enabled: boolean,
  load: () => Promise<CardIndex | null> = () => loadCardIndex(),
): CardPictures {
  const index = shallowRef<CardIndex | null>(null);
  let latest = 0;
  return {
    index,
    refresh: () => {
      if (!enabled) return;
      latest += 1;
      const ticket = latest;
      // An old list could name a picture removed since: the member's shows until the new one.
      index.value = null;
      void load().then((read) => {
        if (ticket === latest) index.value = read;
      });
    },
  };
}
