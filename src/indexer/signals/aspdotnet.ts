import { URL } from "url";
import { SpiderRequest } from "../../types";
import { RequestSignalChecker, UrlSignalChecker } from "./types";

export const aspDotNetSignal: UrlSignalChecker & RequestSignalChecker = {
  name: "aspdotnet",
  requestMatches(req: SpiderRequest): boolean {
    if (req.error) {
      return false;
    }
    return !!req.headers.find((h) => h.name === "x-aspnet-version");
  },
  urlMatches(url: URL): boolean {
    return url.pathname.split("/").some((p) => /\.as[phm]x$/i.test(p));
  },
};
