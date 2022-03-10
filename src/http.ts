import http from "http";
import https from "https";
import dns from "dns/promises";
import { URL } from "url";
import CacheableLookup from "cacheable-lookup";

export type HttpClient = {
  get: (url: URL) => Promise<HttpResponse>;
  head: (url: URL) => Promise<HttpResponse>;
};

export type HttpClientOptions = {
  maxResponseBodySizeInBytes: number;
  getRequestTimeout: number;
  headRequestTimeout: number;
  shouldProcessContentType: (contentType: string) => boolean;
  minimumTimeBetweenRequests: number | (() => number);
  resolveTimeout: number;
};

export type HttpHeader = {
  name: string;
  value: string;
};

export type HttpResponse = {
  status: number;
  contentType: string;
  headers: HttpHeader[];
  body: string;
};

export type HttpHeadResponse = Omit<HttpResponse, "body">;

type HttpRequestOptions = {
  maxResponseBodySizeInBytes: number;
  method: "GET" | "HEAD";
  shouldProcessContentType: (contentType: string) => boolean;
  shouldReadResponseBody: boolean;
  timeout: number;
};

const DEFAULT_OPTIONS: HttpClientOptions = {
  maxResponseBodySizeInBytes: 1 * 1000 * 1000,
  getRequestTimeout: 5000,
  headRequestTimeout: 1000,
  minimumTimeBetweenRequests: 1000,
  resolveTimeout: 2500,
  shouldProcessContentType: () => true,
};

export function createHttpClient(
  options: Partial<HttpClientOptions>
): HttpClient {
  let throttlePromise = Promise.resolve();

  const resolver = new dns.Resolver({
    timeout: options.resolveTimeout ?? DEFAULT_OPTIONS.resolveTimeout,
  });
  resolver.setServers(["1.1.1.1", "8.8.8.8", "8.8.4.4"]);

  const cacheable = new CacheableLookup({
    resolver,
  });

  return { get, head };

  async function get(url: URL): Promise<HttpResponse> {
    await throttleHttpRequests();

    const requestOptions: HttpRequestOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      method: "GET",
      shouldReadResponseBody: true,
      timeout: options.getRequestTimeout ?? DEFAULT_OPTIONS.getRequestTimeout,
    };

    return await doHttpRequest(url, requestOptions, cacheable);
  }

  async function head(url: URL): Promise<HttpResponse> {
    await throttleHttpRequests();

    const requestOptions: HttpRequestOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      method: "HEAD",
      shouldReadResponseBody: false,
      timeout: options.getRequestTimeout ?? DEFAULT_OPTIONS.getRequestTimeout,
    };

    return await doHttpRequest(url, requestOptions, cacheable);
  }

  function throttleHttpRequests(): Promise<void> {
    throttlePromise = throttlePromise.then(async () => {
      const minTimeBetweenRequests =
        typeof options.minimumTimeBetweenRequests === "function"
          ? options.minimumTimeBetweenRequests()
          : options.minimumTimeBetweenRequests ?? 0;

      await delay(minTimeBetweenRequests);
    });

    return throttlePromise;
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

function doHttpRequest(
  url: URL,
  options: HttpRequestOptions,
  cacheable: CacheableLookup
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const destroyTimer = setTimeout(() => {
      const err = new Error(`Request timed out after ${options.timeout}ms`);
      (err as any).code = "TIMED_OUT";
      req.destroy(err);
    }, options.timeout);

    const requestOptions: http.RequestOptions = {
      lookup: (hostname, family, callback) => {
        // @ts-ignore
        return cacheable.lookup(hostname, family, callback);
      },
      method: options.method,
      timeout: options.timeout,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
      },
    };

    let req: http.ClientRequest;

    switch (url.protocol) {
      case "http:":
        req = http.request(url, requestOptions);
        break;
      case "https:":
        req = https.request(url, requestOptions);
        break;
      default:
        reject(new Error(`Invalid protocol: ${url.protocol}`));
        return;
    }

    req.on("response", (res) => {
      const contentType = res.headers["content-type"] ?? "";
      const status = res.statusCode ?? 0;
      const headers = buildHeaders(res.headers);

      let shouldReadResponseBody = options.shouldReadResponseBody;

      if (status === 301 || status === 302 || status === 303) {
        // Don't read bodies for redirects
        shouldReadResponseBody = false;
      }

      if (!shouldReadResponseBody) {
        resolve({
          status,
          headers,
          contentType,
          body: "",
        });
      }

      if (!options.shouldProcessContentType(contentType)) {
        const err: any = new Error(
          `Received invalid content-type header: ${contentType}`
        );
        err.code = "INVALID_CONTENT_TYPE";
        reject(err);
        return;
      }

      let body: Buffer | undefined = Buffer.from("");
      res.on("data", (chunk) => {
        if (body == null) {
          return;
        }
        body = Buffer.concat([body, chunk]);
        if (body.length > options.maxResponseBodySizeInBytes) {
          body = undefined;
          reject(
            new Error(
              `Response body exceeded maximum allowed size of ${options.maxResponseBodySizeInBytes}`
            )
          );
          res.destroy();
        }
      });

      res.on("close", () => {
        clearTimeout(destroyTimer);
        resolve({
          status,
          headers,
          contentType,
          body: body?.toString("utf8") ?? "",
        });
      });
    });

    req.on("error", (err) => {
      clearTimeout(destroyTimer);
      reject(err);
    });

    req.end();
  });
}

function buildHeaders(headers: http.IncomingHttpHeaders): HttpHeader[] {
  const result: HttpHeader[] = [];
  Object.keys(headers).forEach((name: string) => {
    const rawValue = headers[name];
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    values.forEach((value) => {
      result.push({ name, value: value ?? "" });
    });
  });
  return result;
}
