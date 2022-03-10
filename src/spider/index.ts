import * as fc from "fustercluck";
import { SpiderOptions } from "../types";
import {
  parseSpiderPrimaryMessage,
  parseSpiderWorkerMessage,
  SpiderPrimaryMessage,
  SpiderWorkerMessage,
} from "./messages";
import { runPrimary } from "./primary";
import { runWorker } from "./worker";

export async function spider(): Promise<void> {
  const instance = fc.start<SpiderPrimaryMessage, SpiderWorkerMessage>({
    parsePrimaryMessage: parseSpiderPrimaryMessage,
    parseWorkerMessage: parseSpiderWorkerMessage,
  });

  if (instance.role === "primary") {
    runPrimary([], instance);
  } else {
    runWorker(instance);
  }

  return;
}
