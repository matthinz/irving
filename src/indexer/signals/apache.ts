import { RequestSignalChecker } from "./types";

export const apacheSignal: RequestSignalChecker = {
  name: "apache",
  requestMatches(req) {
    if (req.error) {
      return false;
    }
    return req.headers.some(
      ({ name, value }) => name === "server" && /apache/i.test(value)
    );
  },
};
