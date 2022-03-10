import { Database } from "sqlite";
import sqlite3 from "sqlite3";
import * as stream from "stream";
import { URL } from "url";
import { gunzip } from "../utils";

export async function exportRedirects(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  stream: stream.Writable
) {
  type Row = {
    url: string;
    status: number;
    headers_gz: Buffer;
  };

  const rows = await db.all<Row[]>(
    `
      SELECT
        url,
        status,
        header_blobs.content_gz AS headers_gz
      FROM
        requests
        INNER JOIN urls ON urls.id = requests.url_id
        INNER JOIN domains ON domains.id = urls.domain_id
        INNER JOIN blobs header_blobs ON header_blobs.id = requests.headers_blob_id
      WHERE
        (status = 301 OR status = 302)
        AND
        url = 'https://' || domains.full_name ||'/'
    `
  );

  let promise = Promise.resolve();

  rows.forEach((row) => {
    promise = promise.then(async () => {
      const headers = JSON.parse(await gunzip(row.headers_gz)) as {
        name: string;
        value: string;
      }[];
      const location = headers.find(({ name }) => name === "location")?.value;

      if (!location) {
        return;
      }

      let from: URL;
      let to: URL;

      try {
        from = new URL(row.url);
        to = new URL(location, from);
      } catch (err: any) {
        return;
      }

      if (to.hostname === from.hostname) {
        // Redirects elsewhere on the same host are not interesting
        return;
      }

      if (to.hostname === `www.${from.hostname}`) {
        // Redirects from bare -> www. are not interesting
        return;
      }

      stream.write(
        [row.url, location, row.status]
          .map((item) => `"${String(item).replace(/"/g, '""')}"`)
          .join(",")
      );
      stream.write("\n");
    });
  });

  await promise;

  stream.end();
}
