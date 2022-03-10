import { Readable } from "stream";
import { URL } from "url";
import { createSqliteDatabase } from "./database";
import { QueuePriority } from "./types";

/**
 * Mark a set of domain names as "ok to spider" and ensure they're in the
 * queue to be spidered.
 * If `domainNames` is empty and stdin is not a tty, domain names will be read
 * from stdin.
 */
export async function bless(domainNames: string[]) {
  const db = await createSqliteDatabase("spider.db");

  if (domainNames.length === 0 && !process.stdin.isTTY) {
    // Read domain names from line-oriented stdin
    domainNames = await readLines(process.stdin);
  }

  domainNames = domainNames
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0)
    .map((name) => {
      try {
        return new URL(name).hostname;
      } catch (err: any) {}
      return name;
    })
    .filter((name) => name != null) as string[];

  const domains = await db.getDomainsMatching(domainNames);

  const domainsToMarkOkToSpider = domains.filter((d) => d.okToSpider === false);

  console.log(
    "Marking %d domain(s) ok to spider...",
    domainsToMarkOkToSpider.length
  );

  await db.markDomainsOkToSpider(
    domainsToMarkOkToSpider.map(({ name }) => name),
    true
  );

  console.log("Queueing requests for %d domain(s)...", domains.length);

  await db.insertNewQueueItems(
    domains.map((domain) => new URL(`https://${domain.name}`)),
    QueuePriority.High
  );
}

function readLines(stream: Readable): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let remainder = "";

    stream.on("data", (chunk: Buffer) => {
      try {
        const linesInChunk = (remainder + chunk.toString("utf8")).split("\n");
        remainder = linesInChunk.pop() ?? "";
        lines.push(...linesInChunk);
      } catch (err: any) {
        reject(err);
      }
    });

    stream.on("error", reject);

    stream.on("end", () => {
      try {
        lines.push(...remainder.split("\n"));
        resolve(lines);
      } catch (err: any) {
        reject(err);
      }
    });
  });
}
