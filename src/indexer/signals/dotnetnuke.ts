import { SpiderRequest } from "../../types";
import { DomSignalChecker, RequestSignalChecker } from "./types";

export const dotNetNukeSignal: DomSignalChecker & RequestSignalChecker = {
  name: "dot-net-nuke",
  matches: (req: SpiderRequest, $: cheerio.Root): boolean => {
    return $(".DnnModule").length > 0;
  },
  requestMatches(req) {
    return (
      !req.error &&
      !!req.headers.find(
        ({ name, value }) =>
          name === "set-cookie" && value.includes("dnn_IsMobile")
      )
    );
  },
};
