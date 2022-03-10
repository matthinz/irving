import { Database } from "../database";
import { SpiderRequestWithResponse } from "../types";

const BUFFER_SIZE = 100;

type IteratorResult =
  | {
      request: SpiderRequestWithResponse;
      remaining: number;
    }
  | { request?: undefined; remaining: 0 };

/**
 * Creates a function that scans through the requests table one record
 * at a time.
 */
export function createRequestIterator(
  db: Database,
  indexVersion: number
): () => Promise<IteratorResult> {
  let buffer: SpiderRequestWithResponse[] = [];
  let remaining: number;

  return async function (): Promise<IteratorResult> {
    if (buffer.length === 0) {
      buffer = await db.getNextRequestsToIndex(indexVersion, BUFFER_SIZE);
      remaining = await db.countRequestsLeftToIndex(indexVersion);

      if (buffer.length === 0) {
        // We done
        return { remaining: 0 };
      }
    }

    const request = buffer.shift();

    if (!request) {
      throw new Error("Buffer should not be empty here");
    }

    remaining--;

    return {
      request,
      remaining,
    };
  };
}
