import { DomSignalChecker } from "./types";

export const joomlaSignal: DomSignalChecker = {
  name: "joomla",
  matches(req, $) {
    const generator = $("meta[name=generator]").attr("content");
    if (!generator) {
      return false;
    }
    return /Joomla/.test(generator);
  },
};
