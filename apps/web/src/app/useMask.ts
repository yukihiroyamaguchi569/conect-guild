import { shallowRef, type Ref } from 'vue';
import { z } from 'zod';
import { createKeyValueStore, type KeyValueStore } from '../adapters/storage';

/** localStorage key of the show mode (Issue #144): whether titles are masked, nothing else. */
export const MASK_STORAGE_KEY = 'conect-guild:mask';

const maskSchema = z.strictObject({ on: z.boolean() });

/** Whether the stored setting masks the titles; not masked when it is missing, broken or unreadable. */
export function loadMasked(storage: KeyValueStore): boolean {
  const stored = storage.read(MASK_STORAGE_KEY, maskSchema);
  return stored.ok && stored.value.on;
}

/** Saves the setting; a failure only means it is not kept for the next visit. */
export function saveMasked(storage: KeyValueStore, on: boolean): boolean {
  return storage.write(MASK_STORAGE_KEY, { on } satisfies z.infer<typeof maskSchema>).ok;
}

export interface MaskSwitch {
  readonly masked: Readonly<Ref<boolean>>;
  readonly toggleMask: () => void;
}

/**
 * The show mode's switch, kept in `storage` (localStorage by default). Off (`enabled` false, the
 * demo) it never masks and never touches the storage: the demo's titles are fictional.
 */
export function useMask(
  enabled: boolean,
  storage: KeyValueStore = createKeyValueStore(),
): MaskSwitch {
  const masked = shallowRef(enabled && loadMasked(storage));
  return {
    masked,
    toggleMask: () => {
      if (!enabled) return;
      masked.value = !masked.value;
      saveMasked(storage, masked.value);
    },
  };
}
