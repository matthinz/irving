import { URL } from "url";
import { SpiderRequest, SpiderRequestWithResponse } from "../../types";

type SignalBase = {
  name: string;
};

export type DomSignalChecker = SignalBase & {
  matches(req: SpiderRequestWithResponse, $: cheerio.Root): boolean;
};

export type RequestSignalChecker = SignalBase & {
  requestMatches(req: SpiderRequest): boolean;
};

export type UrlSignalChecker = SignalBase & {
  urlMatches(url: URL): boolean;
};

export type SignalChecker =
  | DomSignalChecker
  | RequestSignalChecker
  | UrlSignalChecker;
