import { RequestSignalChecker } from "./types";

export const awsCloudfrontSignal: RequestSignalChecker = {
  name: "aws-cloudfront",
  requestMatches: (req) =>
    !req.error && !!req.headers.find(({ name }) => name === "x-amz-cf-id"),
};
