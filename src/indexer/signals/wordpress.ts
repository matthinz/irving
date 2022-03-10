import { URL } from "url";
import { DomSignalChecker, RequestSignalChecker } from "./types";

const COMMON_WORDPRESS_HEADERS = [
  "x-tec-api-root", // https://theeventscalendar.com/
];

export const wordpressSignal: RequestSignalChecker & DomSignalChecker = {
  name: "wordpress",
  requestMatches: (req) => {
    if (req.error) {
      return false;
    }

    return req.headers.some(({ name, value }) => {
      if (name === "x-redirect-by") {
        return value === "WordPress" || value === "Yoast SEO";
      }

      return COMMON_WORDPRESS_HEADERS.includes(name);
    });
  },

  matches(req, $) {
    let hasWpMarkersInSources = false;

    $("link[href],script[src]").each((index, el) => {
      const src = $(el).attr("href") ?? $(el).attr("src");
      if (!src) {
        return;
      }

      let srcUrl: URL;
      try {
        srcUrl = new URL(src, req.url);
      } catch (err: any) {
        return;
      }

      if (srcUrl.hostname !== req.url.hostname) {
        return;
      }

      const hasWpMarker = /\/wp-(content|json)\//.test(srcUrl.pathname);
      if (hasWpMarker) {
        hasWpMarkersInSources = true;
        return false;
      }
    });

    return hasWpMarkersInSources;
  },
};
