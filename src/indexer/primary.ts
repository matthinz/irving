import * as fc from "fustercluck";
import { createSqliteDatabase } from "../database";
import {
  IndexMessageSentToPrimary,
  IndexMessageSentToWorker,
} from "./messages";
import { IndexOptions } from "./types";
import { createUI } from "./ui";

const WRITE_BATCH_SIZE = 1000;
const INDEX_VERSION = 5;

export async function runPrimary(
  args: string[],
  options: IndexOptions,
  instance: fc.Primary<IndexMessageSentToPrimary, IndexMessageSentToWorker>
) {
  const db = await createSqliteDatabase(options.databaseFile);

  if (args.includes("--reset")) {
    console.log("Resetting index state...");
    await db.resetIndexingState();
  }

  // These batch together data to be periodically written to our backing data store.
  const savedDomainLinks: { fromDomain: string; toUrls: string[] }[] = [];
  const savedDomainSignals: { domain: string; signals: string[] }[] = [];
  const indexedRequestIds: number[] = [];

  instance.handle("save_domain_links", (m) => {
    savedDomainLinks.push(m);
  });

  instance.handle("save_domain_signals", (m) => {
    savedDomainSignals.push(m);
  });

  instance.handle("worker_indexed_request", (m) => {
    indexedRequestIds.push(m.requestId);
  });

  const ui = createUI();
  const renderInterval = setInterval(ui.render, 1000);

  instance.on("receive", (m) => ui.update(m));

  const scanner = await db.createRawRequestScanner({
    statuses: [200],
    ignoreIndexVersion: INDEX_VERSION,
  });

  await instance.loop(async () => {
    if (indexedRequestIds.length >= WRITE_BATCH_SIZE) {
      await writeToDb();
    }

    if (indexedRequestIds.length === 0 || Math.random() < 0.001) {
      ui.setItemsRemaining(await scanner.remaining());
    }

    const request = await scanner.next();
    if (!request) {
      return false;
    }

    await instance.sendToWorkers({
      type: "index_request",
      request,
    });
  });

  await writeToDb();

  instance.stop();

  clearInterval(renderInterval);

  return;

  async function writeToDb() {
    ui.startWriting();

    let domainLinksToSave: { fromDomain: string; toUrls: string[] }[] = [];
    let requestIdsToWrite: number[] = [];

    const signals = [...savedDomainSignals];
    savedDomainSignals.splice(0, savedDomainSignals.length);

    requestIdsToWrite = [...indexedRequestIds];
    indexedRequestIds.splice(0, indexedRequestIds.length);

    domainLinksToSave = [...savedDomainLinks];
    savedDomainLinks.splice(0, savedDomainLinks.length);

    const tx = await db.beginTransaction();

    await tx.run(() =>
      Promise.all([
        db.saveDomainSignals(signals, INDEX_VERSION).catch((err) => {
          console.error("Error saving domain signals (will retry)", err);
        }),
        db.saveDomainLinks(domainLinksToSave, INDEX_VERSION).catch((err) => {
          console.error("Error saving domain links (will retry)", err);
          savedDomainLinks.push(...domainLinksToSave);
        }),
        db
          .markRequestsIndexed(requestIdsToWrite, INDEX_VERSION)
          .catch((err) => {
            console.error("Error marking requests indexed (will retry)", err);
            indexedRequestIds.push(...requestIdsToWrite);
          }),
      ])
    );

    ui.doneWriting();
  }
}
