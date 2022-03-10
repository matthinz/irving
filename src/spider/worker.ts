import { createHttpClient, HttpClient } from "../http";
import { SpiderOptions } from "../types";
import { isContentTypeAllowed } from "./utils";
import { URL } from "url";
import { createRobotsChecker } from "./robots";
import * as fc from "fustercluck";
import { SpiderPrimaryMessage, SpiderWorkerMessage } from "./messages";
import { executeRequest } from "./request";
import { spider } from "./spider";

export function runWorker(
  instance: fc.Worker<SpiderPrimaryMessage, SpiderWorkerMessage>
) {
  let options: SpiderOptions | undefined;
  let httpClient: HttpClient | undefined;

  const isAllowedByRobots = createRobotsChecker();

  instance.handle("init_worker", async (m) => {
    // We are being asked to initialize ourselves
    options = (await import(m.optionsPath)).default as SpiderOptions;
    httpClient = initHttpClient(options);
  });

  instance.handle("head_request", async (m) => {
    // We are being asked to request a URL
    if (!httpClient || !options) {
      throw new Error("not intialized");
    }
    await executeRequest(
      "HEAD",
      new URL(m.url),
      m,
      options,
      httpClient,
      instance.sendToPrimary
    );
  });

  instance.handle("get_request", async (m) => {
    if (!httpClient || !options) {
      throw new Error("not intialized");
    }
    await executeRequest(
      "GET",
      new URL(m.url),
      m,
      options,
      httpClient,
      instance.sendToPrimary
    );
  });

  instance.handle("robots_check", async (m) => {
    // We are being asked to see if a site's robots.txt allows requesting
    // a specific url
    const allowed = await isAllowedByRobots(new URL(m.url));
    instance.sendToPrimary({
      ...m,
      type: allowed ? "allowed_by_robots" : "disallowed_by_robots",
    });
  });

  instance.handle("spider", async (m) => {
    // We are being asked to examine a response and see what links it contains
    if (!options) {
      throw new Error("not initialized");
    }
    await spider(m.request, m, options, instance.sendToPrimary);
  });

  function initHttpClient(options: SpiderOptions): HttpClient {
    return createHttpClient({
      ...options,
      minimumTimeBetweenRequests: () => {
        if (!options) {
          throw new Error("options not found");
        }
        const minTime =
          typeof options.minTimeBetweenRequests === "function"
            ? options.minTimeBetweenRequests()
            : options.minTimeBetweenRequests;
        return minTime;
      },
      shouldProcessContentType: (contentType: string): boolean => {
        if (!options) {
          throw new Error("options not found");
        }
        return isContentTypeAllowed(contentType, options.allowedContentTypes);
      },
    });
  }
}
