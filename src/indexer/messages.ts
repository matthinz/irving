import { RawRequest } from "../types";
import { IndexOptions } from "./types";

const PRIMARY_MESSAGE_TYPES = [
  "save_domain_links",
  "save_domain_signals",
  "worker_error",
  "worker_indexed_request",
  "worker_indexing",
] as const;

type PrimaryMessageBase = {
  type: typeof PRIMARY_MESSAGE_TYPES[number];
};

type WorkerErrorMessage = PrimaryMessageBase & {
  type: "worker_error";
  code?: string;
  message: string;
};

type WorkerIdleMessage = PrimaryMessageBase & {
  type: "worker_idle";
};

type WorkerIndexingMessage = PrimaryMessageBase & {
  type: "worker_indexing";
  requestId: number;
  url: string;
};

type WorkerIndexedRequest = PrimaryMessageBase & {
  type: "worker_indexed_request";
  requestId: number;
  url: string;
};

type SaveDomainLinksMessage = PrimaryMessageBase & {
  type: "save_domain_links";
  fromDomain: string;
  toUrls: string[];
};

type SaveDomainSignalsMessage = PrimaryMessageBase & {
  type: "save_domain_signals";
  domain: string;
  signals: string[];
};

export type IndexMessageSentToPrimary =
  | SaveDomainLinksMessage
  | SaveDomainSignalsMessage
  | WorkerErrorMessage
  | WorkerIdleMessage
  | WorkerIndexedRequest
  | WorkerIndexingMessage;

const WORKER_MESSAGE_TYPES = ["init_worker", "index_request"] as const;

type WorkerMessageBase = {
  type: typeof WORKER_MESSAGE_TYPES[number];
};

type IndexRequestMessage = WorkerMessageBase & {
  type: "index_request";
  request: RawRequest;
};

type InitWorkerMessage = WorkerMessageBase & {
  type: "init_worker";
  options: IndexOptions;
};

export type IndexMessageSentToWorker = InitWorkerMessage | IndexRequestMessage;

export function parseIndexMessageSentToPrimary(
  m: any
): IndexMessageSentToPrimary | undefined {
  if (!PRIMARY_MESSAGE_TYPES.includes(m?.type)) {
    return;
  }

  return m as IndexMessageSentToPrimary;
}

export function parseIndexMessageSentToWorker(
  m: any
): IndexMessageSentToWorker | undefined {
  if (!WORKER_MESSAGE_TYPES.includes(m?.type)) {
    return;
  }

  return m as IndexMessageSentToWorker;
}
