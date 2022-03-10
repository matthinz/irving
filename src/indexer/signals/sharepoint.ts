import { replaceWith } from "cheerio/lib/api/manipulation";
import { RequestSignalChecker } from "./types";

export const sharepointSignal: RequestSignalChecker = {
  name: "sharepoint",
  requestMatches: (req) =>
    // https://docs.microsoft.com/en-us/openspecs/sharepoint_protocols/ms-wsshp/287b545f-e41d-46b2-a7b3-42e5331eb390
    !req.error && !!req.headers.find(({ name }) => name === "sprequestguid"),
};
