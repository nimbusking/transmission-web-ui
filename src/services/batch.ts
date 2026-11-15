import type { BatchResult, ItemResult } from '../domain/types';
import { errorMessage } from '../domain/torrents';
import { isUnknownOutcome } from './rpc';
export async function runBatch<T>(
  items: readonly T[],
  execute: (
    item: T,
    index: number,
  ) => Promise<void | { status: 'success' | 'duplicate'; message?: string }>,
  identify: (item: T) => { id: number | string; name: string },
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (results: ItemResult[]) => void;
  } = {},
): Promise<BatchResult> {
  const plan = [...items],
    results: ItemResult[] = new Array(plan.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < plan.length) {
      const index = cursor++,
        item = plan[index],
        identity = identify(item);
      if (options.signal?.aborted) results[index] = { ...identity, status: 'cancelled' };
      else {
        try {
          const outcome = await execute(item, index);
          results[index] = { ...identity, status: 'success', ...outcome };
        } catch (error) {
          results[index] = {
            ...identity,
            status: isUnknownOutcome(error) ? 'unknown' : 'failed',
            message: errorMessage(error),
          };
        }
      }
      options.onProgress?.(results.filter(Boolean));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(plan.length, options.concurrency ?? 3) }, worker),
  );
  return { items: results, completedAt: Date.now() };
}
