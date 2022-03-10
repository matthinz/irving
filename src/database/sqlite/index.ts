import { open } from "sqlite";
import sqlite3 from "sqlite3";
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
} from "../../types";
import { TABLES, TableName } from "./tables";
import {
  gunzip,
  gzip,
  isValidDomainName,
  md5,
  parseDomainName,
} from "../../utils";
import { createTransaction } from "./transaction";
import {
  Database,
  RawRequestScannerOptions,
  RawRequestScannerResult,
  SpiderQueueScanner,
  Transaction,
} from "../types";

type CreateSqliteDatabaseOptions = {
  autoRetry: boolean;
  migrate: boolean;
};

type LocalCache = {
  domainIds: { [name: string]: number };
  headerIds: { [name: string]: number };
  signalIds: { [name: string]: number };
};

const DEFAULTS = {
  autoRetry: true,
  migrate: true,
};

export async function createSqliteDatabase(
  filename: string,
  options?: Partial<CreateSqliteDatabaseOptions>
): Promise<Database> {
  options = Object.assign({}, DEFAULTS, options) as CreateSqliteDatabaseOptions;

  const db = await open({
    filename,
    driver: sqlite3.Database,
  });

  // db.on("trace", (sql: string) => {
  //   console.error(sql);
  // });

  const CACHE: LocalCache = {
    domainIds: {},
    headerIds: {},
    signalIds: {},
  };

  if (options.migrate) {
    await migrate();
  }

  return {
    beginTransaction,
    countRequestsLeftToIndex,
    createQueueScanner,
    createRawRequestScanner,
    createSession,
    deleteQueueItem,
    getBlob,
    getDomain,
    getDomainsMatching,
    getLastRequestIndexed,
    getQueueStatus,
    getMostRecentRequestForUrl,
    getNextRequestsToIndex,
    getRequest,
    insertNewQueueItems,
    insertQueueItem: insertQueueItems,
    insertRequest,
    insertRequestError,
    markDomainsOkToSpider,
    markRequestsIndexed,
    resetIndexingState,
    resetIndexingStateForDomains,
    saveDomainLinks,
    saveDomainSignals,
    setQueuePriorityForDomain,
  };

  function beginTransaction(): Promise<Transaction> {
    return createTransaction(db);
  }

  function buildDomainToIdMap(
    domains: (string | URL | Draft<SpiderRequest> | RawRequest)[]
  ): Promise<{ [name: string]: number | undefined }> {
    const domainsAsStrings = domains.map((item) => {
      if (typeof item === "string") {
        return item;
      } else if (item instanceof URL) {
        return item.hostname;
      } else if (item.url instanceof URL) {
        return item.url.hostname;
      } else {
        return new URL(item.url).hostname;
      }
    });

    return domainsAsStrings
      .reduce<Promise<{ [name: string]: number | undefined }>>(
        (p, domain) =>
          p.then((domainIds) => {
            if (domainIds[domain] != null) {
              return domainIds;
            }
            return ensureDomainExists(domain).then((domainId) => {
              domainIds[domain] = domainId;
              return domainIds;
            });
          }),
        Promise.resolve({})
      )
      .then((domainIds) => {
        domainsAsStrings.forEach((domain) => {
          if (domainIds[domain] == null) {
            throw new Error(`domain not found in id map: ${domain}`);
          }
        });
        return domainIds;
      });
  }

  async function buildUrlToIdMap(
    urls: (string | URL)[]
  ): Promise<{ [url: string]: number | undefined }> {
    const ids = await ensureUrlsExist(urls);
    return urls.reduce<{ [url: string]: number | undefined }>(
      (result, url, index) => {
        const asString = url.toString();
        const id = ids[index];
        if (!id) {
          throw new Error(`No ID for url ${asString}`);
        }
        result[asString] = id;
        return result;
      },
      {}
    );
  }

  async function createQueueScanner(): Promise<SpiderQueueScanner> {
    type Row = {
      id: number;
      timestamp: number;
      url: string;
    };

    let buffer: SpiderQueueItem[] = [];

    const BUFFER_SIZE = 100;

    return async function next() {
      if (buffer.length === 0) {
        const rows = await db.all<Row[]>(
          `SELECT queue.*, urls.url FROM queue INNER JOIN urls ON urls.id = queue.url_id WHERE requested_at IS NULL AND priority >= 0 ORDER BY priority DESC, RANDOM() LIMIT ?`,
          BUFFER_SIZE
        );

        buffer = rows.map((item) => ({
          id: item.id,
          timestamp: new Date(item.timestamp),
          url: new URL(item.url),
        }));
      }

      return buffer.shift();
    };
  }

  function createRawRequestScanner(
    options: RawRequestScannerOptions
  ): Promise<RawRequestScannerResult> {
    type Row = {
      id: number;
      session_id: number;
      timestamp: number;
      url_id: number;
      url: string;
      status: number;
      content_type: string;
      headers_blob_id: number;
      headers_gz: Buffer;
      header_md5: string;
      body_blob_id: number;
      body_gz: Buffer;
      body_md5: string;
      last_index_version: number;
    };

    const BUFFER_SIZE = 1000;
    let buffer: Row[] = [];
    let lastId = options.fromId ?? 0;

    const statusCriteria = options?.statuses
      ? options.statuses.map(() => "requests.status = ?").join(" OR ")
      : "1";
    const statusParams = options?.statuses ?? [];

    const indexVersionCriteria =
      options?.ignoreIndexVersion == null
        ? "1"
        : "(last_index_version != ? OR last_index_version IS NULL)";
    const indexVersionParams =
      options?.ignoreIndexVersion == null ? [] : [options.ignoreIndexVersion];

    return Promise.resolve({ next, remaining });

    async function remaining(): Promise<number> {
      if (lastId == null) {
        return 0;
      }

      const row = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM requests WHERE id > ? AND (${statusCriteria}) AND (${indexVersionCriteria})`,
        lastId,
        ...statusParams,
        ...indexVersionParams
      );
      return row ? row.count : 0;
    }

    async function next(): Promise<RawRequest | undefined> {
      if (lastId == null) {
        return;
      }

      if (buffer.length === 0) {
        buffer = await db.all<Row[]>(
          `
            SELECT
              requests.*,
              urls.url,
              body_blobs.content_gz AS body_gz,
              body_blobs.md5 AS body_md5,
              header_blobs.content_gz AS headers_gz,
              header_blobs.md5 AS headers_md5
            FROM
              requests
              INNER JOIN urls ON (urls.id = requests.url_id)
              LEFT JOIN blobs body_blobs ON (body_blobs.id = requests.body_blob_id)
              LEFT JOIN blobs header_blobs ON (header_blobs.id = requests.headers_blob_id)
            WHERE
              requests.id > ?
              AND
              (${statusCriteria})
              AND
              (${indexVersionCriteria})
            ORDER BY requests.id ASC
            LIMIT ?
          `,
          lastId,
          ...statusParams,
          ...indexVersionParams,
          BUFFER_SIZE
        );
      }

      const record = buffer.shift();

      if (record == null) {
        return;
      }

      lastId = record.id;

      return {
        id: record.id,
        timestamp: record.timestamp,
        url: record.url,
        status: record.status,
        contentType: record.content_type,
        gzippedBody: record.body_gz,
        bodyMd5: record.body_md5,
        gzippedHeaders: record.headers_gz,
        headersMd5: record.header_md5,
      };
    }
  }

  async function createSession(): Promise<SpiderSession> {
    const timestamp = new Date();

    const result = await db.run(
      "INSERT INTO sessions (timestamp) VALUES(?)",
      timestamp.getTime()
    );

    return {
      id: lastId(result),
      timestamp,
    };
  }

  async function countRequestsLeftToIndex(
    indexVersion: number
  ): Promise<number> {
    const row = await db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM requests WHERE last_index_version != ? OR last_index_version IS NULL",
      indexVersion
    );
    return row?.count ?? 0;
  }

  async function deleteQueueItem(
    item: SpiderQueueItem | number
  ): Promise<void> {
    const id = typeof item === "number" ? item : item.id;

    await db.run(
      "UPDATE queue SET requested_at = ? WHERE id = ?",
      Date.now(),
      id
    );
  }

  async function getBlob(
    id: number
  ): Promise<{ id: number; content: string } | undefined> {
    type Record = {
      id: number;
      content_gz: Buffer;
      md5: string;
    };
    const row = await db.get("SELECT * FROM blobs WHERE id = ?", id);
    if (!row) {
      return;
    }
    return {
      id: row.id,
      content: await gunzip(row.content_gz),
    };
  }

  async function getDomain(name: string): Promise<SpiderDomain | undefined> {
    const record = await db.get(
      "SELECT * FROM domains WHERE full_name = ?",
      name
    );
    if (!record) {
      return;
    }

    return {
      id: Number(record.id),
      name: String(record.full_name),
      okToSpider:
        record.ok_to_spider == null ? undefined : !!record.ok_to_spider,
    };
  }

  async function getDomainsMatching(
    expressions: string | string[]
  ): Promise<SpiderDomain[]> {
    const EXPR_BATCH_SIZE = 100;

    const result: { [name: string]: SpiderDomain | undefined } = {};

    expressions = Array.isArray(expressions) ? expressions : [expressions];

    // NOTE: fetch in batches because `expressions` can be quite large and
    //       generate SQL queries that are too long

    const batch: string[] = [];
    for (let i = 0; i < expressions.length; i++) {
      batch.push(expressions[i]);
      if (batch.length >= EXPR_BATCH_SIZE) {
        const domains = await fetchDomains(batch);
        domains.forEach((d) => {
          result[d.name] = result[d.name] ?? d;
        });
        batch.splice(0, batch.length);
      }
    }

    if (expressions.length > 0 && batch.length > 0) {
      const domains = await fetchDomains(batch);
      domains.forEach((d) => {
        result[d.name] = result[d.name] ?? d;
      });
    }

    return Object.values(result) as SpiderDomain[];

    async function fetchDomains(
      expressions: string[]
    ): Promise<SpiderDomain[]> {
      type RecordType = {
        id: number;
        name: string;
        full_name: string;
        ok_to_spider: boolean;
      };

      await expressions.reduce<Promise<unknown>>(
        (p, expr) =>
          p.then(() =>
            isValidDomainName(expr)
              ? (ensureDomainExists(expr) as Promise<unknown>)
              : Promise.resolve()
          ),
        Promise.resolve()
      );

      const criteria = expressions.map(() => "full_name LIKE ?");
      const params = expressions.map((expr) => expr.replace(/\*/g, "%"));

      if (criteria.length === 0) {
        criteria.push("1");
      }

      const rows = await db.all<RecordType[]>(
        `SELECT * FROM domains WHERE ${criteria.join(" OR ")}`,
        ...params
      );

      return rows.map((row) => ({
        id: row.id,
        name: row.full_name,
        okToSpider: row.ok_to_spider == null ? undefined : !!row.ok_to_spider,
      }));
    }
  }

  async function getLastRequestIndexed(
    options: { statuses?: number[] },
    indexVersion: number
  ): Promise<number | undefined> {
    type RowType = {
      id: number;
    };

    const statusCriteria = options?.statuses
      ? options.statuses.map(() => "requests.status = ?").join(" OR ")
      : "1";
    const statusParams = options?.statuses ?? [];

    const row = await db.get<RowType>(
      `SELECT MIN(id) AS id FROM requests WHERE (${statusCriteria}) AND (last_index_version IS NULL OR last_index_version < ?)`,
      ...statusParams,
      indexVersion
    );

    if (row?.id == null) {
      return undefined;
    }

    return row.id - 1;
  }

  async function ensureDomainExists(urlOrName: URL | string): Promise<number> {
    const parts = parseDomainName(urlOrName);

    // Move through domain parts in reverse order, e.g.:
    // com, google, www

    let promise = Promise.resolve<{ id: number; name: string }>({
      id: 0,
      name: "",
    });

    parts.reverse().forEach((part) => {
      promise = promise.then(async ({ id: parentId, name: parentName }) => {
        const fullName = parentName === "" ? part : `${part}.${parentName}`;

        if (CACHE.domainIds[fullName]) {
          return {
            id: CACHE.domainIds[fullName],
            name: fullName,
          };
        }

        await db.run(
          "INSERT INTO domains (name, full_name, parent_id) VALUES(?,?,?) ON CONFLICT DO NOTHING",
          part,
          fullName,
          parentId
        );

        const row = await db.get<{ id: number }>(
          "SELECT id FROM domains WHERE name = ? AND parent_id = ?",
          part,
          parentId
        );

        if (!row) {
          throw new Error("domains row not found after INSERT");
        }

        const result = { id: row.id, name: fullName };
        CACHE.domainIds[fullName] = row.id;

        return result;
      });
    });

    return (await promise).id;
  }

  async function ensureUrlsExist(
    urls: (URL | string | { url: string | URL })[]
  ): Promise<number[]> {
    const [insertStatement, getIdStatement] = await Promise.all([
      db.prepare(
        "INSERT INTO urls (domain_id, url) VALUES(?,?) ON CONFLICT DO NOTHING"
      ),
      db.prepare("SELECT id FROM urls WHERE domain_id = ? AND url = ? LIMIT 1"),
    ]);

    const parsedUrls = urls.map((requestOrUrl) => {
      if (requestOrUrl instanceof URL) {
        return requestOrUrl;
      } else if (typeof requestOrUrl === "string") {
        return new URL(requestOrUrl);
      } else if (requestOrUrl.url instanceof URL) {
        return requestOrUrl.url;
      } else {
        return new URL(requestOrUrl.url);
      }
    });

    const domainIds = await buildDomainToIdMap(parsedUrls);

    return parsedUrls
      .reduce<Promise<{ [url: string]: number }>>(
        (p, url) =>
          p.then(async (urlIds) => {
            const domainId = domainIds[url.hostname];
            const urlAsString = url.toString();
            if (!domainId) {
              throw new Error(`no domain id found for '${url.hostname}'`);
            }

            if (urlIds[urlAsString]) {
              return urlIds;
            }

            await insertStatement.run(domainId, urlAsString);

            const row = await getIdStatement.get<{ id: number }>(
              domainId,
              urlAsString
            );

            if (!row) {
              throw new Error(`url not found after INSERT: ${urlAsString}`);
            }

            urlIds[urlAsString] = row.id;

            return urlIds;
          }),

        Promise.resolve({})
      )
      .then((urlIds) =>
        parsedUrls.map((url) => {
          return urlIds[url.toString()];
        })
      );
  }

  async function getMostRecentRequestForUrl(
    url: URL
  ): Promise<RawRequest | undefined> {
    type Row = {
      id: number;
      session_id: number;
      timestamp: number;
      url_id: number;
      url: string;
      status: number;
      content_type: string;
      headers_blob_id: number;
      headers_gz: Buffer;
      header_md5: string;
      body_blob_id: number;
      body_gz: Buffer;
      body_md5: string;
      last_index_version: number;
    };

    const record = await db.get<Row>(
      `
        SELECT
          requests.*,
          urls.url,
          body_blobs.content_gz AS body_gz,
          body_blobs.md5 AS body_md5,
          header_blobs.content_gz AS headers_gz,
          header_blobs.md5 AS headers_md5
        FROM
          requests
          INNER JOIN urls ON (urls.id = requests.url_id)
          LEFT JOIN blobs body_blobs ON (body_blobs.id = requests.body_blob_id)
          LEFT JOIN blobs header_blobs ON (header_blobs.id = requests.headers_blob_id)
        WHERE
          urls.url = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      url.toString()
    );

    if (!record) {
      return;
    }

    return {
      id: record.id,
      timestamp: record.timestamp,
      url: record.url,
      status: record.status,
      contentType: record.content_type,
      gzippedBody: record.body_gz,
      bodyMd5: record.body_md5,
      gzippedHeaders: record.headers_gz,
      headersMd5: record.header_md5,
    };
  }

  async function getQueueStatus(): Promise<SpiderQueueStatus> {
    const result: SpiderQueueStatus = {
      ignore: 0,
      low: 0,
      medium: 0,
      high: 0,
      processed: 0,
    };

    const rows: { priority: number; count: number }[] = await db.all(
      "SELECT priority, COUNT(*) as count FROM queue WHERE requested_at IS NULL GROUP BY priority"
    );

    rows.forEach((row) => {
      switch (row.priority) {
        case QueuePriority.Ignore:
          result.ignore += row.count;
          break;
        case QueuePriority.Low:
          result.low += row.count;
          break;
        case QueuePriority.Medium:
          result.medium += row.count;
          break;
        case QueuePriority.High:
          result.high += row.count;
          break;
        default:
          throw new Error(`Invalid priority: ${row.priority}`);
      }
    });

    const countRow: { count: number } | undefined = await db.get(
      "SELECT COUNT(*) AS count FROM queue WHERE requested_at IS NOT NULL;"
    );

    result.processed = countRow?.count ?? 0;

    return result;
  }

  async function getNextRequestsToIndex(
    indexVersion: number,
    count: number
  ): Promise<SpiderRequestWithResponse[]> {
    const rows = await db.all(
      `
        SELECT
          requests.*,
          urls.url,
          body_blobs.content_gz AS body_gz,
          header_blobs.content_gz AS headers_gz
        FROM
          requests
          INNER JOIN urls ON (urls.id = requests.url_id)
          INNER JOIN blobs body_blobs ON (body_blobs.id = requests.body_blob_id)
          INNER JOIN blobs header_blobs ON (header_blobs.id = requests.headers_blob_id)
        WHERE
          requests.last_index_version != ? OR requests.last_index_version IS NULL
        ORDER BY requests.id ASC LIMIT ?
      `,
      indexVersion,
      count
    );

    const requests = (await Promise.all(rows.map(toSpiderRequest))).filter(
      (req) => !req.error
    );

    return requests as SpiderRequestWithResponse[];
  }

  async function getRequest(id: number): Promise<SpiderRequest | undefined> {
    const row = await db.get(
      `
        SELECT
          requests.*,
          urls.url,
          body_blobs.content_gz AS body_gz,
          header_blobs.content_gz AS headers_gz
        FROM
          requests
          INNER JOIN urls ON (urls.id = requests.url_id)
          LEFT JOIN blobs body_blobs ON (body_blobs.id = requests.body_blob_id)
          LEFT JOIN blobs header_blobs ON (header_blobs.id = requests.headers_blob_id)
        WHERE requests.id = ?
      `,
      id
    );

    if (!row) {
      return;
    }

    return toSpiderRequest(row);
  }

  async function insertNewQueueItems(urls: URL[], priority: QueuePriority) {
    return insertQueueItems(urls, priority, { replaceExisting: true });
  }

  async function insertQueueItems(
    urls: URL | URL[],
    priority: QueuePriority,
    options?: { replaceExisting: boolean }
  ): Promise<void> {
    urls = Array.isArray(urls) ? urls : [urls];
    const urlIds = await ensureUrlsExist(urls);

    const [deleteStatement, insertStatement] = await Promise.all([
      db.prepare("DELETE FROM queue WHERE url_id = ?"),
      db.prepare(
        "INSERT INTO queue (timestamp, url_id, priority) VALUES(?,?,?) ON CONFLICT DO NOTHING"
      ),
    ]);

    const timestamp = Date.now();

    return urls
      .reduce<Promise<unknown>>((p, url, index) => {
        const urlId = urlIds[index];
        if (urlId == null) {
          throw new Error(`No url id at index ${index}`);
        }
        return p
          .then(() =>
            options?.replaceExisting
              ? deleteStatement.run(urlId).then(() => {})
              : Promise.resolve()
          )
          .then(() => insertStatement.run(timestamp, urlId, priority));
      }, Promise.resolve())
      .then(() => {});
  }

  async function insertRequest(
    session: SpiderSession,
    request: Draft<RawRequest>
  ): Promise<number> {
    const bodyBlobId = await insertBlob(request.gzippedBody, request.bodyMd5);
    const headersBlobId = await insertBlob(
      request.gzippedHeaders,
      request.headersMd5
    );
    const urlId = (await ensureUrlsExist([request]))[0];
    const timestamp = new Date();

    const result = await db.run(
      "INSERT INTO requests(session_id, url_id, timestamp, status, content_type, headers_blob_id, body_blob_id) VALUES(?,?,?,?,?,?,?)",
      session.id,
      urlId,
      timestamp.getTime(),
      request.status,
      request.contentType,
      headersBlobId,
      bodyBlobId
    );

    return lastId(result);
  }

  async function insertRequestError(
    session: SpiderSession,
    request: Draft<SpiderRequestWithError>
  ): Promise<number> {
    const urlId = (await ensureUrlsExist([request]))[0];
    const timestamp = new Date();

    const result = await db.run(
      "INSERT INTO request_errors (session_id, url_id, timestamp, error_code, error_message) VALUES(?,?,?,?,?);",
      session.id,
      urlId,
      timestamp.getTime(),
      String(request.error.code ?? ""),
      request.error.message
    );

    return lastId(result);
  }

  async function markDomainsOkToSpider(
    names: string[],
    okToSpider: boolean
  ): Promise<void> {
    const domainIds = await Promise.all(names.map(ensureDomainExists));

    const sql = `UPDATE domains SET ok_to_spider = ? WHERE id IN (${domainIds
      .map(() => "?")
      .join(",")})`;

    await db.run(sql, okToSpider ? 1 : 0, ...domainIds);
  }

  async function markRequestsIndexed(
    requestIds: number[],
    indexVersion: number
  ) {
    await db.run(
      `UPDATE requests SET last_index_version = ? WHERE id IN (${requestIds
        .map(() => "?")
        .join(",")})`,
      indexVersion,
      ...requestIds
    );
  }

  function resetIndexingState(): Promise<void> {
    return [
      "DELETE FROM domain_links",
      "DELETE FROM domain_signals",
      "DELETE FROM signals",
      "UPDATE requests SET last_index_version = NULL",
    ]
      .reduce<Promise<unknown>>(
        (p, sql) => p.then(() => db.run(sql)),
        Promise.resolve()
      )
      .then(() => {});
  }

  async function resetIndexingStateForDomains(
    domains: (string | number)[]
  ): Promise<void> {
    const domainIds = await buildDomainToIdMap(
      domains.filter((d) => typeof d !== "number") as string[]
    );

    await domains.reduce<Promise<unknown>>(
      (p, domain) =>
        p.then(async () => {
          const domainId =
            typeof domain === "number" ? domain : domainIds[domain];
          if (!domainId) {
            throw new Error(`Unknown domain: ${domain}`);
          }

          const tx = await beginTransaction();
          await tx.run(async () => {
            await db.run(
              "DELETE FROM domain_links WHERE from_domain_id = ?",
              domainId
            );
            await db.run(
              "DELETE FROM domain_signals WHERE domain_id = ?",
              domainId
            );
            await db.run(
              "UPDATE requests last_index_version = NULL WHERE url_id IN (SELECT id FROM urls WHERE domain_id = ?)",
              domainId
            );
          });
        }),
      Promise.resolve()
    );
  }

  async function saveDomainLinks(
    records: {
      fromDomain: string | number;
      toUrls: (string | number | URL)[];
    }[],
    indexVersion: number
  ): Promise<void> {
    const domainNames = Object.keys(
      records.reduce<{ [name: string]: boolean }>((map, record) => {
        if (typeof record.fromDomain === "string") {
          map[record.fromDomain] = true;
        }
        return map;
      }, {})
    );

    const urls = Object.keys(
      records.reduce<{ [key: string]: boolean }>((urls, record) => {
        return record.toUrls.reduce<{ [key: string]: boolean }>((urls, url) => {
          if (typeof url === "number") {
            return urls;
          }

          const asString = url.toString();
          urls[asString] = true;

          return urls;
        }, urls);
      }, {})
    );

    const [domainIds, urlIds, statement] = await Promise.all([
      buildDomainToIdMap(domainNames),
      buildUrlToIdMap(urls),
      db.prepare(
        "INSERT INTO domain_links (from_domain_id, to_url_id, index_version, strength) VALUES(?,?,?,?) ON CONFLICT(from_domain_id, to_url_id, index_version) DO UPDATE SET strength = strength + excluded.strength"
      ),
    ]);

    await records.reduce<Promise<unknown>>(
      (p, record, index) =>
        p.then(() => {
          const fromDomainId =
            typeof record.fromDomain === "number"
              ? record.fromDomain
              : domainIds[record.fromDomain];

          if (fromDomainId == null) {
            throw new Error(
              `No domain ID found for '${record.fromDomain}' (${Buffer.from(
                String(record.fromDomain)
              ).toString("hex")}) -- index: ${index}`
            );
          }

          return record.toUrls.reduce<Promise<unknown>>(
            (p, to) =>
              p.then(() => {
                const toUrlId =
                  typeof to === "number" ? to : urlIds[to.toString()];
                if (!toUrlId) {
                  throw new Error(`No url ID found for '${to}'`);
                }
                return statement.run(fromDomainId, toUrlId, indexVersion, 1);
              }),
            p
          );
        }),
      Promise.resolve()
    );
  }

  async function saveDomainSignals(
    records: {
      domain: string | number;
      signals: string[];
    }[],
    indexVersion: number
  ) {
    type SignalToIdMap = {
      [name: string]: number;
    };

    const signalIds = await records.reduce<Promise<SignalToIdMap>>(
      (p, record) =>
        p.then((signalIds) =>
          record.signals.reduce<Promise<SignalToIdMap>>(
            (p, signalName) =>
              p.then(async (signalIds) => {
                if (signalIds[signalName] != null) {
                  return signalIds;
                }

                const signalId = CACHE.signalIds[signalName];
                if (signalId) {
                  signalIds[signalName] = signalId;
                }

                await db.run(
                  "INSERT INTO signals (name) VALUES(?) ON CONFLICT DO NOTHING",
                  signalName
                );

                const row = await db.get<{ id: number }>(
                  "SELECT id FROM signals WHERE name = ?",
                  signalName
                );

                if (!row) {
                  throw new Error("signal not found after INSERT");
                }

                CACHE.signalIds[signalName] = row.id;
                signalIds[signalName] = row.id;

                return signalIds;
              }),
            Promise.resolve(signalIds)
          )
        ),
      Promise.resolve({})
    );

    const domainNames = Object.keys(
      records.reduce<{ [name: string]: boolean }>((map, record) => {
        if (typeof record.domain === "string") {
          map[record.domain] = true;
        }
        return map;
      }, {})
    );

    const [domainIds, statement] = await Promise.all([
      buildDomainToIdMap(domainNames),
      db.prepare(
        "INSERT INTO domain_signals (domain_id, signal_id, index_version, strength) VALUES(?,?,?,?) ON CONFLICT (domain_id, signal_id, index_version) DO UPDATE SET strength = strength + excluded.strength"
      ),
    ]);

    await records.reduce<Promise<unknown>>(
      (p, record, index) =>
        p.then(() => {
          const domainId =
            typeof record.domain === "number"
              ? record.domain
              : domainIds[record.domain];

          if (domainId == null) {
            console.error(domainNames);
            throw new Error(
              `Domain ID not found for ${record.domain} (index: ${index})`
            );
          }

          return record.signals.reduce<Promise<unknown>>(
            (p, signalName) =>
              p.then(() => {
                const signalId = signalIds[signalName];
                if (signalId == null) {
                  throw new Error(`ID not found for signal: ${signalName}`);
                }
                return statement.run(domainId, signalId, indexVersion, 1);
              }),
            p
          );
        }),
      Promise.resolve()
    );
  }

  async function setQueuePriorityForDomain(
    domain: string,
    priority: QueuePriority
  ): Promise<void> {
    const domainId = await ensureDomainExists(domain);
    await db.run(
      "UPDATE queue SET priority = ? WHERE requested_at IS NULL AND url_id IN (SELECT id FROM urls WHERE domain_id = ?)",
      Number(priority),
      domainId
    );
  }

  async function migrate(): Promise<void> {
    let promise = Promise.resolve();
    Object.keys(TABLES).forEach((name: string) => {
      const sql = TABLES[name as TableName];
      console.log("Migrate: %s", name);
      promise = promise.then(async () => {
        try {
          await db.run(sql);
        } catch (err: any) {
          throw new Error(`Error applying migration: ${name} (${err.message})`);
        }
      });
    });

    await promise;

    console.log("Migration done");
  }

  async function insertBlob(
    content: string | Buffer,
    hash?: string
  ): Promise<number> {
    if (!hash) {
      hash = md5(typeof content === "string" ? content : await gunzip(content));
    }

    await db.run(
      "INSERT INTO blobs (md5, content_gz) VALUES(?, ?) ON CONFLICT(md5) DO NOTHING;",
      hash,
      typeof content === "string" ? await gzip(content) : content
    );

    type RowType = { id: number };

    const row = await db.get<RowType>(
      "SELECT id FROM blobs WHERE md5 = ?;",
      hash
    );

    if (!row) {
      throw new Error("Blob not found after INSERT");
    }

    return Number(row.id);
  }
}

function lastId(result: { lastID?: number }): number {
  const id = result.lastID;
  if (id == null) {
    throw new Error("sqlite did not issue an ID");
  }
  return id;
}

async function toSpiderRequest(row: any): Promise<SpiderRequest> {
  if (row.error_code || row.error_message) {
    const result: SpiderRequestWithError = {
      id: Number(row.id),
      timestamp: new Date(row.timestamp),
      url: new URL(row.url),
      error: {
        code: row.error_code ? String(row.error_code) : undefined,
        message: String(row.error_message),
      },
    };
    return result;
  }

  const result: SpiderRequestWithResponse = {
    id: Number(row.id),
    timestamp: new Date(row.timestamp),
    url: new URL(row.url),
    status: Number(row.status),
    contentType: String(row.content_type),
    headers: JSON.parse(await gunzip(row.headers_gz)),
    body: await gunzip(row.body_gz),
  };
  return result;
}
