import { RequestSignalChecker } from "./types";

export const javaSignal: RequestSignalChecker = {
  name: "java",
  requestMatches: (req) =>
    !req.error &&
    !!req.headers.find(
      ({ name, value }) =>
        name === "set-cookie" && value.startsWith("JSESSIONID=")
    ),
};
