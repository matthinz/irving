import { URL } from "url";

export enum QueuePriority {
  Ignore = -1,
  Low = 0,
  Medium = 10,
  High = 100,
}

export type Draft<T> = Omit<T, "id" | "timestamp">;

export type UrlFilter = string | RegExp | ((url: URL) => boolean);

export type SpiderOptions = {
  allowedContentTypes: string[];
  canSpiderDomain: (domain: string) => boolean | undefined;
  databaseFile: string;
  getRequestTimeout: number;
  headRequestTimeout: number;
  ignoreUrls?: UrlFilter[];
  lowPriorityUrls?: UrlFilter[];
  highPriorityUrls?: UrlFilter[];
  maxResponseBodySizeInBytes: number;
  minTimeBetweenRequests: number | (() => number);

  /**
   * Rules used to define "platforms" for reporting purposes.
   */
  platforms: {
    label: string;
    signals: string[];
    specificity: number;
  }[];
};

export type SpiderDomain = {
  id: number;
  name: string;
  okToSpider?: boolean | undefined;
};

export type SpiderQueueItem = {
  id: number;
  timestamp: Date;
  url: URL;
};

export type SpiderQueueStatus = {
  ignore: number;
  low: number;
  medium: number;
  high: number;
  processed: number;
};

type SpiderRequestBase = {
  id: number;
  url: URL;
  timestamp: Date;
};

export type SpiderRequestWithResponse = SpiderRequestBase & {
  status: number;
  contentType: string;
  headers: { name: string; value: string }[];
  body: string;
  error?: undefined;
};

export type SpiderRequestWithError = SpiderRequestBase & {
  error: { code: string | undefined; message: string };
};

export type SpiderRequest = SpiderRequestWithError | SpiderRequestWithResponse;

export type SpiderSession = {
  id: number;
  timestamp: Date;
};

export type RawRequest = {
  id: number;
  url: string;
  timestamp: number;
  status: number;
  contentType: string;
  gzippedHeaders: Buffer;
  headersMd5: string;
  gzippedBody: Buffer;
  bodyMd5: string;
};

export type SpiderRequestQuery = {
  includeSuccesses?: boolean;
  includeStatusCodes?: number[];
  includeErrors?: boolean;
  includeErrorCodes?: string[];
  includeContentTypes?: string[];
};
