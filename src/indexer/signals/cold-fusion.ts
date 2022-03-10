import { URL } from "url";
import { UrlSignalChecker } from "./types";

export const coldFusionSignal: UrlSignalChecker = {
  name: "cold-fusion",
  urlMatches(url: URL): boolean {
    return url.pathname.split("/").some((p) => /\.cfm$/i.test(p));
  },
};
