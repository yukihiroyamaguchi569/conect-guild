import { z } from 'zod';
import type { FetchFn } from './snapshot';

/**
 * The list of the quests' own pictures (Issue #271), served by the dev server's plugin
 * (vite-plugin-cards.ts) from apps/web/.data/cards: the numbers that have a picture, and when it
 * was drawn (to load a redrawn picture again).
 */
export const cardIndexSchema = z.strictObject({
  cards: z.array(
    z.strictObject({
      number: z.number().int().positive(),
      updatedAt: z.number().int().nonnegative(),
    }),
  ),
});

export type CardIndex = z.infer<typeof cardIndexSchema>;

export interface LoadCardIndexOptions {
  readonly url?: string;
  readonly fetchFn?: FetchFn;
  /** Covers both the request and reading the body. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Where the pictures are: /cards/index.json and /cards/<number>.png. */
export function defaultCardsBase(): string {
  return `${import.meta.env.BASE_URL}cards/`;
}

async function readIndex(
  url: string,
  fetchFn: FetchFn,
  signal: AbortSignal,
): Promise<CardIndex | null> {
  const response = await fetchFn(url, { cache: 'no-store', signal });
  if (!response.ok) return null;
  const parsed = cardIndexSchema.safeParse(JSON.parse(await response.text()));
  return parsed.success ? parsed.data : null;
}

/**
 * Fetches the list with no-store and a timeout, then validates it. Never throws: null for any
 * failure (network, HTTP error, timeout, broken or invalid JSON), and the card keeps the member's
 * picture.
 */
export async function loadCardIndex(options: LoadCardIndexOptions = {}): Promise<CardIndex | null> {
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await readIndex(
      options.url ?? `${defaultCardsBase()}index.json`,
      fetchFn,
      controller.signal,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
