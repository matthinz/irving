import { URL } from "url";
import {
  Draft,
  QueuePriority,
  RawRequest,
  SpiderDomain,
  SpiderQueueItem,
  SpiderQueueStatus,
  SpiderRequest,
  SpiderRequestWithError,
  SpiderRequestWithResponse,
  SpiderSession,
} from "../types";

/**
 * SpiderDatabase is our interface with the backing data store.
 * Technically its responsibilities extend slightly beyond that, e.g. it
 * assigns timestamps to things.
 */
export type Database = {
  beginTransaction(): Promise<Transaction>;

  createRawRequestScanner(
    options: RawRequestScannerOptions
  ): Promise<RawRequestScannerResult>;

  createQueueScanner(): Promise<SpiderQueueScanner>;

  createSession(): Promise<SpiderSession>;

  countRequestsLeftToIndex(indexVersion: number): Promise<number>;

  deleteQueueItem(item: SpiderQueueItem | number): Promise<void>;

  getBlob(id: number): Promise<{ id: number; content: string } | undefined>;

  getDomain(name: string): Promise<SpiderDomain | undefined>;

  getDomainsMatching(expr: string): Promise<SpiderDomain[]>;

  getDomainsMatching(expr: string[]): Promise<SpiderDomain[]>;

  getLastRequestIndexed(
    options: { statuses?: number[] },
    indexVersion: number
  ): Promise<number | undefined>;

  getMostRecentRequestForUrl(url: URL): Promise<RawRequest | undefined>;

  getRequest(id: number): Promise<SpiderRequest | undefined>;

  getNextRequestsToIndex(
    indexVersion: number,
    count: number,
    lastId?: number
  ): Promise<SpiderRequestWithResponse[]>;

  getQueueStatus(): Promise<SpiderQueueStatus>;

  setQueuePriorityForDomain(
    domain: string,
    priority: QueuePriority
  ): Promise<void>;

  insertQueueItem(url: URL, priority: QueuePriority): Promise<void>;

  /**
   * Adds new queue items for the given URLs, _replacing_ any existing items
   * that may already exist for those URLs.
   * @param urls
   * @param priority
   */
  insertNewQueueItems(urls: URL[], priority: QueuePriority): Promise<void>;

  /**
   * Inserts a request record
   */
  insertRequest(
    session: SpiderSession,
    request: Draft<RawRequest>
  ): Promise<number>;

  /**
   * Inserts a request error
   */
  insertRequestError(
    session: SpiderSession,
    error: Draft<SpiderRequestWithError>
  ): Promise<number>;

  markDomainsOkToSpider(names: string[], okToSpider: boolean): Promise<void>;

  markRequestsIndexed(
    requestIds: number[],
    indexVersion: number
  ): Promise<void>;

  resetIndexingState(): Promise<void>;

  resetIndexingStateForDomains(domains: (string | number)[]): Promise<void>;

  saveDomainLinks(
    records: {
      fromDomain: string | number;
      toUrls: (string | URL | number)[];
    }[],
    indexVersion: number
  ): Promise<void>;

  saveDomainSignals(
    records: {
      domain: string | number;
      signals: string[];
    }[],
    indexVersion: number
  ): Promise<void>;
};

export type RawRequestScannerOptions = {
  fromId?: number;
  statuses?: number[];
  ignoreIndexVersion?: number;
};

export type RawRequestScannerResult = {
  next: () => Promise<RawRequest | undefined>;
  remaining: () => Promise<number>;
};

export type SpiderQueueScanner = () => Promise<SpiderQueueItem | undefined>;

export type Transaction = {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  run<T>(callback: () => Promise<T>): Promise<T>;
};
