import { RequestSignalChecker } from "./types";

export const oracleServiceBusSignal: RequestSignalChecker = {
  name: "oracle-service-bus",
  requestMatches: (req) =>
    !req.error &&
    !!req.headers.find(({ name }) => name === "x-oracle-dms-ecid"),
};
