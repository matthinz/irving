import { SpiderRequest } from "../../types";
import { RequestSignalChecker } from "./types";

export const concrete5Signal: RequestSignalChecker = {
  name: "concrete5",
  requestMatches: (req: SpiderRequest) =>
    !req.error &&
    !!req.headers.find(
      ({ name, value }) =>
        name === "set-cookie" && value.startsWith("CONCRETE5=")
    ),
};
