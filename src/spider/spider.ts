import cheerio from "cheerio";
import { URL } from "url";
import { Draft, RawRequest, SpiderOptions } from "../types";
import { gunzip, normalizeUrl } from "../utils";
import { SpiderPrimaryMessage } from "./messages";
import { getUrlPriority } from "./priority";

type Context = {
  queueItemId: number;
  sessionId: number;
};

/**
 * Handles a request from the primary to spider an HTTP response.
 */
export async function spider(
  request: Draft<RawRequest>,
  { queueItemId, sessionId }: Context,
  options: SpiderOptions,
  sendToPrimary: (m: SpiderPrimaryMessage) => void
) {
  const url = new URL(request.url);

  sendToPrimary({
    type: "spidering",
    url: url.toString(),
    queueItemId,
    sessionId,
  });

  const urls = await findUrls(request);

  if (urls.length > 0) {
    sendToPrimary({
      type: "found_urls",
      queueItemId,
      sessionId,
      url: url.toString(),
      urlsWithPriorities: urls.map((url) => {
        return [url.toString(), getUrlPriority(url, options)];
      }),
    });
  }

  sendToPrimary({
    type: "spidered",
    queueItemId,
    sessionId,
    url: request.url,
  });
}

/**
 * Examines a request and returns a set of URLs the request lead to.
 */
async function findUrls(request: Draft<RawRequest>): Promise<URL[]> {
  // Treat 301/302 redirects as new requests to be made
  if (
    request.status === 301 ||
    request.status == 302 ||
    request.status == 303
  ) {
    const headers = await gunzip(request.gzippedHeaders).then(
      (raw) => JSON.parse(raw) as { name: string; value: string }[]
    );
    try {
      const location = headers.find((h) => h.name === "location")?.value;
      if (!location) {
        return [];
      }
      return [new URL(location)];
    } catch (err: any) {
      // ignore
    }
  }

  const isHTML = /^text\/html/.test(request.contentType);
  if (!isHTML) {
    return [];
  }

  const body = await gunzip(request.gzippedBody);

  const $ = cheerio.load(body);
  const uniqueUrls: { [key: string]: URL } = {};

  $("a[href]").each(function (index, el) {
    const href = ($(el).attr("href") ?? "").trim();
    if (href === "") {
      return;
    }

    let url: URL;

    try {
      url = new URL(href, request.url);
    } catch (err: any) {
      // ignore this
      return;
    }

    url = normalizeUrl(url);

    uniqueUrls[url.toString().toLowerCase()] = url;
  });

  return Object.values(uniqueUrls);
}
