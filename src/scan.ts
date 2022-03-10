import path from "path";
import { URL } from "url";
import { createSqliteDatabase, Database } from "./database";
import { RawRequest, SpiderRequestWithResponse } from "./types";
import { gunzip } from "./utils";
import * as fc from "fustercluck";

type InitWorkerMessage = {
  type: "init_worker";
  jsFiles: string[];
};

type ProcessRequestWorkerMessage = {
  type: "process_request";
  request: RawRequest;
};

type WorkerMessage = InitWorkerMessage | ProcessRequestWorkerMessage;

type PrimaryMessage = never;

export async function scanRequests(args: string[]) {
  const instance = fc.start<PrimaryMessage, WorkerMessage>({
    parseWorkerMessage,
  });

  if (instance.role === "primary") {
    runPrimary(args, instance);
  } else {
    runWorker(instance);
  }
}

async function runPrimary(
  jsFiles: string[],
  instance: fc.Primary<PrimaryMessage, WorkerMessage>
) {
  const db = await createSqliteDatabase("spider.db");
  const scanner = await db.createRawRequestScanner({});

  instance.initializeWorkersWith({
    type: "init_worker",
    jsFiles,
  });

  while (true) {
    const request = await scanner.next();
    if (request == null) {
      break;
    }
    await instance.sendToWorkers({
      type: "process_request",
      request,
    });
  }
}

function runWorker(instance: fc.Worker<never, WorkerMessage>) {
  let funcs: ((req: SpiderRequestWithResponse) => Promise<void>)[] = [];
  let inProgress = 0;
  const MAX_IN_PROGRESS = 100;

  instance.addBusyCheck(() => inProgress >= MAX_IN_PROGRESS);

  instance.handle("init_worker", async (m) => {
    funcs = await Promise.all(
      m.jsFiles.map(async (jsFile) => {
        const mod = await import(path.resolve(jsFile));
        return mod.default as (req: SpiderRequestWithResponse) => Promise<void>;
      })
    );
  });

  instance.handle("process_request", async (m) => {
    try {
      inProgress++;

      const request: SpiderRequestWithResponse = {
        ...m.request,
        url: new URL(m.request.url),
        timestamp: new Date(m.request.timestamp),
        body: await gunzip(m.request.gzippedBody),
        headers: JSON.parse(await gunzip(m.request.gzippedHeaders)),
      };

      await Promise.all(funcs.map((f) => f(request)));
    } finally {
      inProgress--;
    }
  });
}

function parseWorkerMessage(rawMessage: any): WorkerMessage | undefined {
  if (!rawMessage) {
    return;
  }

  if (rawMessage.type === "init_worker") {
    return {
      type: "init_worker",
      jsFiles: Array.isArray(rawMessage.jsFiles)
        ? rawMessage.jsFiles.map((f: any) => String(f))
        : [],
    };
  }

  if (
    rawMessage.type === "process_request" &&
    rawMessage.request &&
    typeof rawMessage.request === "object"
  ) {
    return rawMessage as ProcessRequestWorkerMessage;
  }
}
