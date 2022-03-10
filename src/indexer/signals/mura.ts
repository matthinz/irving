import { DomSignalChecker } from "./types";

export const muraSignal: DomSignalChecker = {
  name: "mura",
  matches(req, $) {
    let generatorMetaFound = false;

    $("meta[name=generator]").each((index, el) => {
      const content = $(el).attr("content");
      if (content && /Mura CMS/.test(content)) {
        generatorMetaFound = true;
        return false;
      }
    });

    return generatorMetaFound;
  },
};
