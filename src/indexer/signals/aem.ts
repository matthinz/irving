import { URL } from "url";
import { DomSignalChecker, UrlSignalChecker } from "./types";

export const aemSignal: UrlSignalChecker & DomSignalChecker = {
  name: "aem",
  urlMatches(url: URL): boolean {
    return /^\/content\/dam\//.test(url.pathname);
  },
  matches(req, $) {
    let foundEtcDesignsReference = false;
    let foundClientLibsReference = false;
    let foundContentDamReference = false;
    let score = 0;
    const REQUIRED_SCORE = 2;

    $("link[href],script[src],img[src]").each((index, el) => {
      const $el = $(el);
      const src = $el.attr("href") ?? $el.attr("src");
      if (!src) {
        return;
      }

      foundContentDamReference =
        foundContentDamReference || src.startsWith("/content/dam/");
      foundEtcDesignsReference =
        foundEtcDesignsReference || src.startsWith("/etc/designs");
      foundClientLibsReference =
        foundClientLibsReference ||
        /\/clientlib\.(js|css)/.test(src) ||
        src.startsWith("/etc/clientlibs") ||
        src.startsWith("/etc.clientlibs/");

      score = [
        foundContentDamReference,
        foundEtcDesignsReference,
        foundClientLibsReference,
      ].filter((x) => x).length;

      if (score >= REQUIRED_SCORE) {
        return false;
      }
    });

    return score >= REQUIRED_SCORE;
  },
};
