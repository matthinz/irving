import * as fc from "fustercluck";
import { runWorker } from "./worker";
import {
  IndexMessageSentToPrimary,
  IndexMessageSentToWorker,
  parseIndexMessageSentToPrimary,
  parseIndexMessageSentToWorker,
} from "./messages";
import { IndexOptions } from "./types";
import { runPrimary } from "./primary";

const DEFAULTS: IndexOptions = {
  databaseFile: "spider.db",
};

export async function buildIndex(args: string[]): Promise<void> {
  const options = DEFAULTS;

  const instance = fc.start<
    IndexMessageSentToPrimary,
    IndexMessageSentToWorker
  >({
    parsePrimaryMessage: parseIndexMessageSentToPrimary,
    parseWorkerMessage: parseIndexMessageSentToWorker,
  });

  if (instance.role === "primary") {
    await runPrimary(args, options, instance);
  } else {
    runWorker(instance);
  }
}
