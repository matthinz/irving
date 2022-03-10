import { URL } from "url";
import { DomSignalChecker, UrlSignalChecker } from "./types";

export const sitecoreSignal: UrlSignalChecker & DomSignalChecker = {
  name: "sitecore",
  urlMatches(url: URL): boolean {
    return url.pathname.startsWith("/-/");
  },

  matches(req, $) {
    let looksLikeSitecore = false;
    $("img[src], script[src]").each((index, el) => {
      const src = ($(el).attr("src") ?? "").trim();
      if (src.startsWith("/-/") || src.startsWith("/sitecore/")) {
        looksLikeSitecore = true;
        return false;
      }
    });
    return looksLikeSitecore;
  },
};
