import * as fc from "fustercluck";
import { URL } from "url";
import { createSqliteDatabase, Database } from "../database";
import {
  Draft,
  QueuePriority,
  RawRequest,
  SpiderOptions,
  SpiderRequestWithError,
} from "../types";
import { SpiderPrimaryMessage, SpiderWorkerMessage } from "./messages";
import { createPrioritizingQueueScanner, getUrlPriority } from "./priority";
import { createUI } from "./ui";
import { isContentTypeAllowed } from "./utils";

// Max number of request errors we are allowed before we give up
const MAX_REQUEST_ERRORS = 3;

const OPTIONS_PATH = "../config";

export async function runPrimary(
  args: string[],
  instance: fc.Primary<SpiderPrimaryMessage, SpiderWorkerMessage>
) {
  // These variables track state that is periodically flushed out to the database
  let queueItemsToDelete: number[] = [];
  let requestErrors: Draft<SpiderRequestWithError>[] = [];
  let requests: Draft<RawRequest>[] = [];
  let urlsToEnqueue: { [url: string]: QueuePriority } = {};
  let domainsToIgnore: string[] = [];
  const errorCountsByUrl: { [url: string]: number | undefined } = {};

  const options = (await import(OPTIONS_PATH)).default as SpiderOptions;

  instance.initializeWorkersWith({
    type: "init_worker",
    optionsPath: OPTIONS_PATH,
  });

  instance.handle("allowed_by_robots", (m) => {
    // Worker determined that robots.txt allows request, so proceed!
    instance.sendToWorkers({
      type: "head_request",
      queueItemId: m.queueItemId,
      sessionId: m.sessionId,
      url: m.url,
    });
  });

  instance.handle("disallowed_by_robots", (m) => {
    // Worker determined that robots.txt disallows request

    const url = new URL(m.url);
    if (url.pathname === "/" || url.pathname === "") {
      // Assume the whole domain is disallowed
      console.error("IGNORING whole domain: %s", url.hostname);
      domainsToIgnore.push(url.hostname);
    }

    instance.sendToSelf({
      ...m,
      type: "not_spidering",
      error: {
        code: "ROBOTS_TXT",
        message: "URL disallowed by robots.txt",
      },
    });
  });

  instance.handle("found_urls", (m) => {
    // Worker looked at a response and found some URLs to follow up on!
    m.urlsWithPriorities.forEach(([url, priority]) => {
      if (urlLooksValid(url)) {
        urlsToEnqueue[url.toString()] = priority;
      }
    });
  });

  instance.handle("not_spidering", (m) => {
    // We made a call not to spider a URL
    delete errorCountsByUrl[m.url];

    queueItemsToDelete.push(m.queueItemId);
  });

  instance.handle("head_request_error", (m) => {
    // Some servers just don't support HEAD requests, so we can ignore
    // these errors. Just proceed with the GET request.
    instance.sendToWorkers({
      type: "get_request",
      queueItemId: m.queueItemId,
      sessionId: m.sessionId,
      url: m.url,
    });
  });

  instance.handle("head_request_success", (m) => {
    const contentTypeOk = isContentTypeAllowed(
      m.request.contentType,
      options.allowedContentTypes
    );

    if (contentTypeOk || m.request.contentType === "") {
      // Proceed with GET request
      instance.sendToWorkers({
        type: "get_request",
        queueItemId: m.queueItemId,
        sessionId: m.sessionId,
        url: m.url,
      });
    } else {
      // Bail
      instance.sendToSelf({
        type: "not_spidering",
        queueItemId: m.queueItemId,
        sessionId: m.sessionId,
        url: m.url,
        error: {
          code: "INVALID_CONTENT_TYPE",
          message: `HEAD returned content type '${m.request.contentType}', which is not allowed`,
        },
      });
    }
  });

  instance.handle("get_request_error", (m) => {
    // Worker made a request, but it failed!

    const errorCount = (errorCountsByUrl[m.url] ?? 0) + 1;
    errorCountsByUrl[m.url] = errorCount;

    if (errorCount >= MAX_REQUEST_ERRORS) {
      // We've had so many errors for this url, we're giving up
      instance.sendToSelf({
        ...m,
        type: "not_spidering",
        error: {
          code: "TOO_MANY_ERRORS",
          message: `Received too many errors for url '${m.url}'`,
        },
      });
    }

    requestErrors.push({
      url: new URL(m.url),
      error: {
        code: m.error.code,
        message: m.error.message,
      },
    });
  });

  instance.handle("get_request_success", (m) => {
    // Worker made a request, and it succeeded!
    requests.push(m.request);
    instance.sendToWorkers({
      ...m,
      type: "spider",
    });
  });

  instance.handle("spidered", (m) => {
    // Worker has completed _all_ spidering
    queueItemsToDelete.push(m.queueItemId);
  });

  instance.handle("start", (m) => {
    // Kick off requesting a URL
    instance.sendToWorkers({
      ...m,
      type: "robots_check",
    });
  });

  const ui = createUI();
  instance.on("receive", (m) => ui.update(m));

  const renderInterval = setInterval(ui.render, 1000);

  const db = await createSqliteDatabase(options.databaseFile);
  const session = await db.createSession();

  const nextQueueItem = createPrioritizingQueueScanner(
    await db.createQueueScanner()
  );
  let prevItemId: number | undefined;

  await instance.loop(async () => {
    await write();

    ui.setQueueStatus(await db.getQueueStatus());

    const item = await nextQueueItem();

    if (!item) {
      return false; // Stop the loop
    }

    if (item.id === prevItemId) {
      return;
    }

    prevItemId = item.id;

    if (!urlLooksValid(item.url)) {
      queueItemsToDelete.push(item.id);
      return;
    }

    const probe = await shouldSpiderUrl(item.url, options, db);

    if (!probe.shouldSpider) {
      instance.sendToSelf({
        type: "not_spidering",
        url: item.url.toString(),
        queueItemId: item.id,
        sessionId: session.id,
        error: {
          ...probe,
        },
      });
      return;
    }

    const request = await db.getMostRecentRequestForUrl(item.url);

    if (request && request.status < 400) {
      // We'll re-use this request, even if technically robots does not allow
      await instance.sendToWorkers({
        type: "spider",
        queueItemId: item.id,
        sessionId: session.id,
        request,
      });
      return;
    }

    // Queue up a check of the robots.txt for this url.
    // This will kick off the full request / spidering process.
    await instance.sendToWorkers({
      type: "robots_check",
      queueItemId: item.id,
      sessionId: session.id,
      url: item.url.toString(),
    });
  });

  await write();
  clearInterval(renderInterval);

  return;

  async function write() {
    const localUrlsToEnqueue = urlsToEnqueue;
    urlsToEnqueue = {};

    const localRequests = requests;
    requests = [];

    const localRequestErrors = requestErrors;
    requestErrors = [];

    const localQueueItemsToDelete = queueItemsToDelete;
    queueItemsToDelete = [];

    const localDomainsToIgnore = domainsToIgnore;
    domainsToIgnore = [];

    const tx = await db.beginTransaction();
    await tx.run(async () => {
      await Object.keys(localUrlsToEnqueue).reduce<Promise<unknown>>(
        (p, url) =>
          p
            .then(() => {
              const priority = localUrlsToEnqueue[url];
              return db.insertQueueItem(new URL(url), priority);
            })
            .catch((err) => {
              if (err.code === "INVALID_DOMAIN") {
                console.error(
                  "URL had an invalid domain, not enqueueing: %s",
                  url
                );
                return;
              }

              console.error(`Error enqueueing ${url} (will retry)`, err);
              urlsToEnqueue[url] = localUrlsToEnqueue[url];
            }),
        Promise.resolve()
      );

      await localRequests.reduce<Promise<unknown>>(
        (p, request) =>
          p.then(() =>
            db.insertRequest(session, request).catch((err) => {
              console.error(`Error inserting request (will retry)`, err);
              requests.push(request);
            })
          ),
        Promise.resolve()
      );

      await localRequestErrors.reduce<Promise<unknown>>(
        (p, requestError) =>
          p.then(() =>
            db.insertRequestError(session, requestError).catch((err) => {
              console.error("Error inserting request error (will retry)", err);
              requestErrors.push(requestError);
            })
          ),
        Promise.resolve()
      );

      await localQueueItemsToDelete.reduce<Promise<unknown>>(
        (p, id) =>
          p
            .then(() => db.deleteQueueItem(id))
            .catch((err) => {
              console.error(
                `Error deleting queue item #${id} (will retry)`,
                err
              );
              queueItemsToDelete.push(id);
            }),
        Promise.resolve()
      );

      await localDomainsToIgnore.reduce<Promise<unknown>>(
        (p, domain) =>
          p
            .then(() =>
              db.setQueuePriorityForDomain(domain, QueuePriority.Ignore)
            )
            .catch((err) => {
              console.error(
                `Error ignoring queue items for domain ${domain} (will be retried)`,
                err
              );
              domainsToIgnore.push(domain);
            }),
        Promise.resolve()
      );
    });
  }
}

function urlLooksValid(url: URL | string): boolean {
  if (typeof url === "string") {
    try {
      url = new URL(url);
    } catch (err: any) {
      return false;
    }
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  if (url.hostname.indexOf(".") < 0) {
    return false;
  }

  return true;
}

/**
 * Returns a structure describing whether we should proceed with spidering
 * the given URL.
 */
export async function shouldSpiderUrl(
  url: URL,
  options: SpiderOptions,
  db: Database
): Promise<
  | { shouldSpider: true; code?: undefined; message?: undefined }
  | { shouldSpider: false; code: string; message: string }
> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      shouldSpider: false,
      code: "BAD_PROTOCOL",
      message: `URL has bad protocol (${url.protocol})`,
    };
  }

  const priority = getUrlPriority(url, options);

  if (priority === QueuePriority.Ignore) {
    return {
      shouldSpider: false,
      code: "IGNORED",
      message: "URL is ignored",
    };
  }

  const domain = await db.getDomain(url.hostname);

  if (!domain) {
    return {
      shouldSpider: false,
      code: "UNKNOWN_DOMAIN",
      message: "URL is for an unknown domain",
    };
  }

  if (domain.okToSpider === false) {
    return {
      shouldSpider: false,
      code: "NOT_OK_TO_SPIDER",
      message: `${domain.name} marked as not ok to spider`,
    };
  }

  if (domain.okToSpider == null) {
    const ok = options.canSpiderDomain(domain.name);

    if (ok === true) {
      return { shouldSpider: true };
    }

    if (ok === false) {
      return {
        shouldSpider: false,
        code: "CONFIG_SAYS_NO",
        message: `canSpiderDomain() returned false for ${domain.name}`,
      };
    }

    return {
      shouldSpider: false,
      code: "NOT_OK_TO_SPIDER",
      message: `${domain.name} is not explicitly marked as ok to spider, and config did not say yes`,
    };
  }

  return { shouldSpider: true };
}
