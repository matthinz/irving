import { DomSignalChecker } from "./types";

export const armyCoreSignal: DomSignalChecker = {
  name: "army-core",
  matches: (req, $) => {
    // NOTE: There are not a lot of obvious, non-visual signals that a page
    //       is built on Army CORE.

    let hasE2ReferencesInTouchIcons = false;

    $("link[rel=apple-touch-icon]").each((index, el) => {
      const href = $(el).attr("href");
      if (!href) {
        return;
      }
      if (/^\/e2\//.test(href)) {
        hasE2ReferencesInTouchIcons = true;
        return false;
      }
    });

    return hasE2ReferencesInTouchIcons;
  },
};
