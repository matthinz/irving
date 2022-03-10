import { RequestSignalChecker } from "./types";

export const wixSignal: RequestSignalChecker = {
  name: "wix",
  requestMatches: (req) =>
    !req.error && req.headers.some(({ name }) => name === "x-wix-request-id"),
};
