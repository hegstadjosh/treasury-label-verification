/**
 * Small concurrency-cap helper used by the batch route.
 *
 * Why not just `Promise.all(items.map(fn))`? With N=200 uploaded labels and a
 * real Gemini extractor at ~8s/call, an unbounded fan-out would hit per-host
 * rate limits and OOM the function. The cap keeps inflight work bounded while
 * preserving input order in the output array.
 *
 * Why not pull in `p-map`? One function, no edge cases worth a dependency.
 */

/**
 * Map `items` through `fn` with at most `concurrency` calls in flight at a
 * time. Output is ordered to match input — slot `i` of the result corresponds
 * to `items[i]`, regardless of completion order. Rejections from `fn`
 * propagate (the caller is responsible for try/catching inside `fn` if it
 * wants per-item failures to resolve rather than throw).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency < 1) {
    throw new Error(`mapWithConcurrency: concurrency must be >= 1, got ${concurrency}`);
  }
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}
