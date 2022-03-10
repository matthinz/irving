import { RequestSignalChecker } from "./types";

export const awsElbSignal: RequestSignalChecker = {
  name: "aws-elb",
  requestMatches: (req) =>
    !req.error &&
    !!req.headers.find(
      ({ name, value }) => name === "server" && value.startsWith("awselb/")
    ),
};
