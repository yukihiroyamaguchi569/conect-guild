/**
 * Like Promise.all over `items.map(fn)`, but with at most `limit` calls in flight.
 * Results keep the order of `items`. After the first rejection no new call
 * starts, and the rejection is returned only once every running call has
 * finished, so no work (e.g. a gh process) outlives this call.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let failure: { readonly error: unknown } | undefined;
  // One iterator shared by all workers hands each item to exactly one of them.
  const entries = items.entries();
  async function worker(): Promise<void> {
    for (const [index, item] of entries) {
      if (failure !== undefined) return;
      try {
        results[index] = await fn(item);
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (failure !== undefined) throw failure.error;
  return results;
}
