import { open, Statement } from "sqlite";
import sqlite3 from "sqlite3";
import { getUrlPriority } from "./spider/priority";
import { QueuePriority, SpiderOptions } from "./types";
import { URL } from "url";

export async function reprioritize() {
  type Row = {
    id: number;
    url: string;
    url_id: number;
    priority: number;
  };

  const options = (await import("./config")).default as SpiderOptions;

  const db = await open({
    filename: options.databaseFile,
    driver: sqlite3.Database,
  });

  const changes: [number, QueuePriority][] = [];

  await db.each<Row>(
    "SELECT queue.id, url, priority FROM queue INNER JOIN urls ON urls.id = queue.url_id WHERE requested_at IS NULL",
    (err, row) => {
      if (err) {
        throw err;
      }

      const url = new URL(row.url);

      const newPriority = getUrlPriority(url, options);
      if (newPriority !== row.priority) {
        console.log("%s -> %s", row.url, newPriority);
        changes.push([row.id, newPriority]);
      }
    }
  );

  await db.run("BEGIN TRANSACTION");
  try {
    const statement = await db.prepare(
      "UPDATE queue SET priority = ? WHERE id = ?"
    );
    await changes.reduce<Promise<unknown>>(
      (p, [id, priority]) =>
        p.then(() => {
          console.log("write %d", id);
          return statement.run(priority, id);
        }),
      Promise.resolve()
    );

    await statement.finalize();
  } catch (err: any) {
    await db.run("ROLLBACK");
    throw err;
  }

  await db.run("COMMIT");
  await db.close();
}
