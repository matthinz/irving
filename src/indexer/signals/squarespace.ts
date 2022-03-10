import { SpiderRequestWithResponse } from "../../types";
import { DomSignalChecker } from "./types";

export const squarespaceSignal: DomSignalChecker = {
  name: "squarespace",
  matches(req: SpiderRequestWithResponse, $: cheerio.Root): boolean {
    if (req.body.includes("<!-- This is Squarespace. -->")) {
      return true;
    }

    let anyScriptMatches = false;
    $("script").each(function (_, el) {
      const src = $(el).attr("src");
      if (!src) {
        return;
      }
      if (/static\d+\.squarespace\.com/.test(src)) {
        anyScriptMatches = true;
        return false;
      }
    });

    return anyScriptMatches;
  },
};
