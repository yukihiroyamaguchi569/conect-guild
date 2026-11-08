import { describe, expect, it, vi } from 'vitest';
import type { CardIndex } from '../adapters/cardIndex';
import { useCardPictures } from './useCardPictures';

const ONE: CardIndex = { cards: [{ number: 1, updatedAt: 1 }] };
const TWO: CardIndex = { cards: [{ number: 2, updatedAt: 2 }] };

function deferred() {
  let resolve: (value: CardIndex | null) => void = () => undefined;
  const promise = new Promise<CardIndex | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useCardPictures (Issue #271)', () => {
  it('never asks in the demo', () => {
    const load = vi.fn(() => Promise.resolve(ONE));
    const pictures = useCardPictures(false, load);
    pictures.refresh();
    expect(load).not.toHaveBeenCalled();
    expect(pictures.index.value).toBeNull();
  });

  it('keeps the list read, and drops it after a failed read', async () => {
    const load = vi.fn<() => Promise<CardIndex | null>>(() => Promise.resolve(ONE));
    const pictures = useCardPictures(true, load);
    pictures.refresh();
    await vi.waitFor(() => {
      expect(pictures.index.value).toEqual(ONE);
    });
    load.mockResolvedValueOnce(null);
    pictures.refresh();
    await vi.waitFor(() => {
      expect(pictures.index.value).toBeNull();
    });
  });

  it('drops a read that ends after a newer one', async () => {
    const slow = deferred();
    const fast = deferred();
    const load = vi
      .fn<() => Promise<CardIndex | null>>()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const pictures = useCardPictures(true, load);
    pictures.refresh();
    pictures.refresh();
    fast.resolve(TWO);
    await vi.waitFor(() => {
      expect(pictures.index.value).toEqual(TWO);
    });
    slow.resolve(ONE);
    await slow.promise;
    await Promise.resolve();
    expect(pictures.index.value).toEqual(TWO);
  });
});
