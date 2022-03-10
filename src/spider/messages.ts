// These messages are handled by the primary

import { Draft, RawRequest } from "../types";

const PRIMARY_MESSAGE_TYPES = [
  "allowed_by_robots",
  "disallowed_by_robots",
  "found_urls",
  "not_spidering",
  "head_request_error",
  "get_request_error",
  "head_request_success",
  "get_request_success",
  "making_head_request",
  "making_get_request",
  "spidered",
  "spidering",
  "start",
] as const;

export type PrimaryMessageType = typeof PRIMARY_MESSAGE_TYPES[number];

type PrimaryMessageBase = {
  type: PrimaryMessageType;
};

type AllowedByRobotsMessage = PrimaryMessageBase & {
  type: "allowed_by_robots";
  url: string;
  queueItemId: number;
  sessionId: number;
};

type DisallowedByRobotsMessage = PrimaryMessageBase & {
  type: "disallowed_by_robots";
  url: string;
  queueItemId: number;
  sessionId: number;
};

type FoundUrlsMessage = PrimaryMessageBase & {
  type: "found_urls";
  url: string;
  queueItemId: number;
  sessionId: number;
  urlsWithPriorities: [string, number][];
};

type MakingHeadRequestMessage = PrimaryMessageBase & {
  type: "making_head_request";
  url: string;
  queueItemId: number;
  sessionId: number;
};

type MakingGetRequestMessage = PrimaryMessageBase & {
  type: "making_get_request";
  url: string;
  queueItemId: number;
  sessionId: number;
};

type RequestErrorMessageBase = PrimaryMessageBase & {
  url: string;
  queueItemId: number;
  sessionId: number;
  error: {
    code?: string;
    message: string;
  };
};

type HeadRequestErrorMessage = RequestErrorMessageBase & {
  type: "head_request_error";
};

type GetRequestErrorMessage = RequestErrorMessageBase & {
  type: "get_request_error";
};

type HeadRequestSuccessMessage = PrimaryMessageBase & {
  type: "head_request_success";
  url: string;
  queueItemId: number;
  sessionId: number;
  request: Omit<Draft<RawRequest>, "gzippedBody" | "bodyMd5">;
};

type GetRequestSuccessMessage = PrimaryMessageBase & {
  type: "get_request_success";
  url: string;
  queueItemId: number;
  sessionId: number;
  request: Draft<RawRequest>;
};

type NotSpideringMessage = PrimaryMessageBase & {
  type: "not_spidering";
  queueItemId: number;
  sessionId: number;
  url: string;
  error: {
    code: string;
    message: string;
  };
};

type SpideredMessage = PrimaryMessageBase & {
  type: "spidered";
  queueItemId: number;
  sessionId: number;
  url: string;
};

type SpideringMessage = PrimaryMessageBase & {
  type: "spidering";
  queueItemId: number;
  sessionId: number;
  url: string;
};

type StartMessage = PrimaryMessageBase & {
  type: "start";
  queueItemId: number;
  sessionId: number;
  url: string;
};

export type SpiderPrimaryMessage =
  | AllowedByRobotsMessage
  | DisallowedByRobotsMessage
  | FoundUrlsMessage
  | NotSpideringMessage
  | MakingHeadRequestMessage
  | MakingGetRequestMessage
  | HeadRequestErrorMessage
  | GetRequestErrorMessage
  | HeadRequestSuccessMessage
  | GetRequestSuccessMessage
  | SpideredMessage
  | SpideringMessage
  | StartMessage;

export function parseSpiderPrimaryMessage(
  input: unknown
): SpiderPrimaryMessage | undefined {
  if (input == null || typeof input !== "object") {
    return;
  }
  if (typeof (input as any).type === "string") {
    return input as SpiderPrimaryMessage;
  }
}

// These message are handled by workers

const WORKER_MESSAGE_TYPES = [
  "init_worker",
  "head_request",
  "get_request",
  "robots_check",
  "spider",
] as const;

export type WorkerMessageType = typeof WORKER_MESSAGE_TYPES[number];

type WorkerMessageBase = {
  type: WorkerMessageType;
};

type InitWorkerMessage = WorkerMessageBase & {
  type: "init_worker";
  optionsPath: string;
};

type HeadRequestMessage = WorkerMessageBase & {
  type: "head_request";
  queueItemId: number;
  sessionId: number;
  url: string;
};

type GetRequestMessage = WorkerMessageBase & {
  type: "get_request";
  queueItemId: number;
  sessionId: number;
  url: string;
};

/**
 * Sent to request that a worker check the robots.txt to see if we
 * are permitted to request the given URL.
 */
type RobotsCheckMessage = WorkerMessageBase & {
  type: "robots_check";
  queueItemId: number;
  sessionId: number;
  url: string;
};

type SpiderMessage = WorkerMessageBase & {
  type: "spider";
  queueItemId: number;
  sessionId: number;
  request: Draft<RawRequest>;
};

export type SpiderWorkerMessage =
  | InitWorkerMessage
  | HeadRequestMessage
  | GetRequestMessage
  | RobotsCheckMessage
  | SpiderMessage;

export function parseSpiderWorkerMessage(
  input: unknown
): SpiderWorkerMessage | undefined {
  if (input == null || typeof input !== "object") {
    return;
  }
  if (typeof (input as any).type === "string") {
    return input as SpiderWorkerMessage;
  }
}
