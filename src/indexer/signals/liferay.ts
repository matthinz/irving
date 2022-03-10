import { DomSignalChecker } from "./types";

const ELEMENT_IDS = ["liferayPortalCSS", "liferayAUICSS"];

export const liferaySignal: DomSignalChecker = {
  name: "liferay",
  matches: (req, $) => {
    const knownElements = ELEMENT_IDS.map((id) => $(`#${id}`).length).filter(
      (x) => x > 0
    );
    if (knownElements.length > 0) {
      return true;
    }

    let foundScriptReferences = false;
    $("script[src]").each((index, el) => {
      const src = $(el).attr("src");
      if (!src) {
        return;
      }

      if (/\/liferay\//.test(src)) {
        foundScriptReferences = true;
        return false;
      }
    });

    return foundScriptReferences;
  },
};
