import { URL } from "url";
import { RawRequest, SpiderRequestWithResponse } from "../types";
import { indexRequest } from "./index-request";
import {
  IndexMessageSentToPrimary,
  IndexMessageSentToWorker,
} from "./messages";
import * as fc from "fustercluck";
import { gunzip } from "../utils";

const MAX_IN_PROGRESS = 100;

export function runWorker(
  instance: fc.Worker<IndexMessageSentToPrimary, IndexMessageSentToWorker>
) {
  let inProgress = 0;

  instance.handle("index_request", async (m) => {
    inProgress++;
    try {
      const request = await prepareRequest(m.request);
      await doIndex(request, instance.sendToPrimary);
    } finally {
      inProgress--;
    }
  });

  instance.addBusyCheck(() => inProgress >= MAX_IN_PROGRESS);
}

async function doIndex(
  request: SpiderRequestWithResponse,
  sendToPrimary: (m: IndexMessageSentToPrimary) => void
): Promise<void> {
  sendToPrimary({
    type: "worker_indexing",
    requestId: request.id,
    url: request.url.toString(),
  });

  const { links, signals } = await indexRequest(request);

  sendToPrimary({
    type: "save_domain_links",
    fromDomain: request.url.hostname,
    toUrls: links,
  });

  sendToPrimary({
    type: "save_domain_signals",
    domain: request.url.hostname,
    signals,
  });

  sendToPrimary({
    type: "worker_indexed_request",
    requestId: request.id,
    url: request.url.toString(),
  });
}

async function prepareRequest(
  request: RawRequest
): Promise<SpiderRequestWithResponse> {
  const [headers, body] = await Promise.all([
    gunzip(request.gzippedHeaders),
    gunzip(request.gzippedBody),
  ]);
  return {
    id: request.id,
    timestamp: new Date(request.timestamp),
    url: new URL(request.url),
    status: request.status,
    contentType: request.contentType,
    headers: JSON.parse(headers) as { name: string; value: string }[],
    body,
  };
}
