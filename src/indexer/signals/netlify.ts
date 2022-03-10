import { RequestSignalChecker } from "./types";

export const netlifySignal: RequestSignalChecker = {
  name: "netlify",
  requestMatches: (req) =>
    !req.error &&
    !!req.headers.find(
      ({ name, value }) => name === "server" && value === "Netlify"
    ),
};
