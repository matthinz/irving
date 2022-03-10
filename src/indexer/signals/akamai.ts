import { RequestSignalChecker } from "./types";

export const akamaiSignal: RequestSignalChecker = {
  name: "akamai",
  requestMatches(req) {
    return (
      !req.error &&
      req.headers.some(({ name }) => name === "x-akamai-transformed")
    );
  },
};
