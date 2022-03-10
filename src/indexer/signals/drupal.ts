import { URL } from "url";

import {
  DomSignalChecker,
  RequestSignalChecker,
  UrlSignalChecker,
} from "./types";

export const drupalSignal: UrlSignalChecker &
  RequestSignalChecker &
  DomSignalChecker = {
  name: "drupal",

  matches(req, $) {
    if ($("[data-drupal-selector]").length > 0) {
      return true;
    }

    let foundSitesDirReferences = false;
    let foundDrupalNodeReferencesInClassNames = false;
    let foundDrupalJs = false;

    $("script[src]").each((index, el) => {
      const src = $(el).attr("src");
      if (!src) {
        return;
      }

      if (/\bdrupal\b/i.test(src)) {
        foundDrupalJs = true;
        return false;
      }
    });

    $("a[href],script[src]").each((index, el) => {
      const $el = $(el);
      const href = $el.attr("href") ?? $el.attr("src");
      if (!href) {
        return;
      }

      try {
        const url = new URL(href, req.url);
        const looksLikeSiteDirReference =
          /^\/sites\/[a-z0-9_-]+\/modules\//i.test(url.pathname);

        if (looksLikeSiteDirReference) {
          foundSitesDirReferences = true;
          return false;
        }
      } catch (err: any) {}
    });

    $("[class*=node]").each((index, el) => {
      const classNames = ($(el).attr("class") ?? "").split(/\s+/);
      const lookLikeDrupalNodeReferences = classNames.some(
        (c) => /-node$/.test(c) || /-node-\d+$/.test(c)
      );

      if (lookLikeDrupalNodeReferences) {
        foundDrupalNodeReferencesInClassNames = true;
        return false;
      }
    });

    const score = [
      foundDrupalJs,
      foundSitesDirReferences,
      foundDrupalNodeReferencesInClassNames,
    ].filter((x) => x).length;

    return score > 1;
  },

  requestMatches: (req) => {
    if (req.error) {
      return false;
    }

    return req.headers.some(({ name, value }) => {
      if (name === "x-generator" && value === "Drupal 7 (http://drupal.org)") {
        return true;
      }
      return name.startsWith("x-drupal-");
    });
  },

  urlMatches(url: URL): boolean {
    return url.pathname.includes("/sites/default/files/");
  },
};
