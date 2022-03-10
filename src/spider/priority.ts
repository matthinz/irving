import { URL } from "url";
import {
  QueuePriority,
  SpiderOptions,
  SpiderQueueItem,
  UrlFilter,
} from "../types";

export function getUrlPriority(
  url: URL,
  options: SpiderOptions
): QueuePriority {
  const shouldIgnore = options.ignoreUrls?.reduce<boolean>(
    (result, f) => result || evalFilter(f, url),
    false
  );

  if (shouldIgnore) {
    return QueuePriority.Ignore;
  }

  const isLow = options.lowPriorityUrls?.reduce<boolean>(
    (result, f) => result || evalFilter(f, url),
    false
  );

  if (isLow) {
    return QueuePriority.Low;
  }

  const isHigh = options.highPriorityUrls?.reduce<boolean>(
    (result, f) => result || evalFilter(f, url),
    false
  );

  if (isHigh) {
    return QueuePriority.High;
  }

  return QueuePriority.Medium;
}

function evalFilter(f: UrlFilter, url: URL): boolean {
  if (typeof f === "string") {
    return url.toString().indexOf(f) >= 0;
  }

  if (f instanceof RegExp) {
    return f.test(url.toString());
  }

  return f(url);
}

/**
 * Creates a helper that attempts to move through queue items more evenly.
 */
export function createPrioritizingQueueScanner(
  getNext: () => Promise<SpiderQueueItem | undefined>
): () => Promise<SpiderQueueItem | undefined> {
  return getNext;

  // This buffer tracks everything we've requested from the DB but have not
  // yet used.
  let buffer: { [id: number]: SpiderQueueItem } = {};

  // batch tracks the current set of things we're moving through. Each item
  // in the batch will have a different hostname (if possible).
  let batch: SpiderQueueItem[] = [];

  const BATCH_SIZE = 25;
  const MAX_BUFFER_SIZE = 250;
  const MAX_BATCH_BUILD_TIME = 5000;

  return async function next(): Promise<SpiderQueueItem | undefined> {
    if (batch.length > 0) {
      return batch.shift();
    }

    const nextBatch: { [domain: string]: SpiderQueueItem } = {};
    const startedBuildingAt = Date.now();
    let count = 0;

    const itemsInBuffer = Object.values(buffer);

    for (let i = 0; i < itemsInBuffer.length; i++) {
      const item = itemsInBuffer[i];
      if (nextBatch[item.url.hostname]) {
        // already in there
        continue;
      }

      // We're gonna use it
      nextBatch[item.url.hostname] = item;
      count++;
      delete buffer[item.id];

      if (count >= BATCH_SIZE) {
        break;
      }
    }

    while (count < BATCH_SIZE) {
      if (Date.now() - startedBuildingAt > MAX_BATCH_BUILD_TIME) {
        console.error(
          "Hit MAX_BATCH_BUILD_TIME (%dms). Going with imperfect batch",
          MAX_BATCH_BUILD_TIME
        );
        break;
      }

      const item = await getNext();
      if (!item) {
        break;
      }
      if (nextBatch[item.url.hostname]) {
        // already in there, store in the buffer for later
        buffer[item.id] = item;

        if (Object.keys(buffer).length >= MAX_BUFFER_SIZE) {
          console.error(
            "Hit MAX_BUFFER_SIZE (%d). Going with imperfect batch.",
            MAX_BUFFER_SIZE
          );
          break;
        }

        continue;
      }
      nextBatch[item.url.hostname] = item;
      count++;
    }

    batch = Object.values(nextBatch);

    return batch.shift();
  };
}
