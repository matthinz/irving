import { URL } from "url";
import { UrlSignalChecker } from "./types";

export const phpSignal: UrlSignalChecker = {
  name: "php",
  urlMatches(url: URL): boolean {
    return url.pathname.split("/").some((p) => /\.php$/i.test(p));
  },
};
