import { RequestSignalChecker } from "./types";

export const azureSignal: RequestSignalChecker = {
  name: "azure",

  requestMatches(req) {
    if (req.error) {
      return false;
    }
    return req.headers.some(
      ({ name, value }) =>
        name === "server" && value === "Microsoft-Azure-Application-Gateway/v2"
    );
  },
};
