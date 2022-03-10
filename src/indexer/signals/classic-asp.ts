import { UrlSignalChecker } from "./types";

export const classicAspSignal: UrlSignalChecker = {
  name: "classic-asp",
  urlMatches: (url) => url.pathname.endsWith(".asp"),
};
