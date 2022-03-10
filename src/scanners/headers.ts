import { SpiderRequestWithResponse } from "../types";

const SEEN_HEADERS: { [name: string]: number } = {};
const SEEN_VALUES: { [name: string]: { [value: string]: number } } = {};

const IGNORE_HEADERS = [
  "accept-ranges",
  "access-control-max-age",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-expose-headers",
  "access-request-allow-origin",
  "age",
  "cache-control",
  "cf-ray",
  "connection",
  "content-length",
  "content-security-policy",
  "content-type",
  "charset",
  "date",
  "etag",
  "expires",
  "keep-alive",
  "last-modified",
  "link",
  "location", // don't delete this
  "mime-version",
  "pragma",
  "priority",
  "proxy-connection",
  "request-id",
  "resourcetag", // SharePoint thing
  "server-timing",
  "set-cookie", // interesting stuff in here
  "spiislatency",
  "sprequestguid",
  "sprequestduration",
  "strict-transport-security",
  "transfer-encoding",
  "vary",
  "x-akamai-transformed",
  "x-amz-cf-id",
  "x-azure-ref",
  "x-csrf-header",
  "x-oracle-dms-ecid",
  "x-oracle-dms-rid",
  "x-fb-debug",
  "x-frame-options",
  "x-ig-request-start-time",
  "x-ig-request-end-time",
  "x-connection-hash",
  "x-pingback",
  "x-redirect-id",
  "x-response-time",
  "x-runtime",
  "x-transaction",
  "x-ua-compatible",
  "x-xss-protection",

  // Below are headers that are interesting, but I want to filter out for now
  "content-disposition",
];

let COUNT = 0;

export default function scanHeaders(req: SpiderRequestWithResponse) {
  COUNT++;
  req.headers.forEach(({ name, value }) => {
    if (IGNORE_HEADERS.includes(name)) {
      return;
    }

    if (SEEN_HEADERS[name] == null) {
      console.log(name);
      SEEN_HEADERS[name] = 0;
    }
    SEEN_HEADERS[name]++;

    if (SEEN_VALUES[name] == null) {
      SEEN_VALUES[name] = {};
    }

    if (SEEN_VALUES[name][value] == null) {
      console.log("%s = %s", name, value);
      SEEN_VALUES[name][value] = 0;
    }

    SEEN_VALUES[name][value]++;
  });
}
