import { RequestSignalChecker } from "./types";

export const cloudflareSignal: RequestSignalChecker = {
  name: "cloudflare",
  requestMatches: (req) =>
    !req.error && req.headers.some(({ name }) => name === "cf-ray"),
};
