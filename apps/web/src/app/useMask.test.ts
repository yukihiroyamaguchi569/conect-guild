import { describe, expect, it } from 'vitest';
import { createKeyValueStore, type StorageLike } from '../adapters/storage';
import { loadMasked, MASK_STORAGE_KEY, saveMasked, useMask } from './useMask';

function memory(initial?: string) {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set(MASK_STORAGE_KEY, initial);
  const storage: StorageLike = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
  return { items, store: createKeyValueStore(() => storage) };
}

const throwing = createKeyValueStore(() => {
  throw new Error('blocked');
});

describe('the show mode setting (Issue #144)', () => {
  it('does not mask when nothing is stored', () => {
    expect(loadMasked(memory().store)).toBe(false);
  });

  it('round-trips the setting, storing a boolean only', () => {
    const { items, store } = memory();
    expect(saveMasked(store, true)).toBe(true);
    expect(items.get(MASK_STORAGE_KEY)).toBe('{"on":true}');
    expect(loadMasked(store)).toBe(true);
    saveMasked(store, false);
    expect(loadMasked(store)).toBe(false);
  });

  it.each(['{"on":"yes"}', '{"on":true,"title":"x"}', 'true', 'not json', '{}'])(
    'does not mask for a broken value %s',
    (raw) => {
      expect(loadMasked(memory(raw).store)).toBe(false);
    },
  );

  it('does not mask when storage throws, and reports a failed save', () => {
    expect(loadMasked(throwing)).toBe(false);
    expect(saveMasked(throwing, true)).toBe(false);
  });
});

describe('useMask', () => {
  it('starts from the stored setting and keeps each toggle', () => {
    const { items, store } = memory('{"on":true}');
    const { masked, toggleMask } = useMask(true, store);
    expect(masked.value).toBe(true);
    toggleMask();
    expect(masked.value).toBe(false);
    expect(items.get(MASK_STORAGE_KEY)).toBe('{"on":false}');
  });

  it('still toggles for this visit when the save fails', () => {
    const { masked, toggleMask } = useMask(true, throwing);
    toggleMask();
    expect(masked.value).toBe(true);
  });

  it('never masks nor touches the storage when disabled (the demo)', () => {
    const { items, store } = memory('{"on":true}');
    const { masked, toggleMask } = useMask(false, store);
    expect(masked.value).toBe(false);
    toggleMask();
    expect(masked.value).toBe(false);
    expect(items.get(MASK_STORAGE_KEY)).toBe('{"on":true}');
  });
});
