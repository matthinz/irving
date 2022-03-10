import { DomSignalChecker } from "./types";

export const ploneSignal: DomSignalChecker = {
  name: "plone",
  matches(req, $) {
    const generator = $("meta[name=generator]").attr("content");
    if (!generator) {
      return false;
    }
    return generator.includes("Plone");
  },
};
