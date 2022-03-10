import { RequestSignalChecker } from "./types";

export const nginxSignal: RequestSignalChecker = {
  name: "nginx",
  requestMatches(req) {
    if (req.error) {
      return false;
    }
    return req.headers.some(
      ({ name, value }) => name === "server" && /nginx/i.test(value)
    );
  },
};
