import { open } from "sqlite";
import sqlite3 from "sqlite3";

export async function unrequested(args: string[]) {
  const db = await open({
    filename: "spider.db",
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });

  const criteria = args.map((expr) => "full_name LIKE ?").join(" OR ");

  const params = args.map((expr) => expr.replace(/\*/g, "%"));

  const sql = `
    SELECT
      full_name
    FROM
      domains
    WHERE
      -- Domain names match
      (${criteria.length === 0 ? "1" : criteria})
      AND
      -- We've seen an URL with this domain
      EXISTS (SELECT id FROM urls WHERE domain_id = domains.id)
      AND
      -- We've _not_ seen a successful request
      NOT EXISTS (SELECT requests.id FROM requests INNER JOIN urls ON urls.id = requests.url_id WHERE requests.status = 200 AND urls.domain_id = domains.id)
      AND
      -- We've _not_ seen an error
      NOT EXISTS (SELECT request_errors.id FROM request_errors INNER JOIN urls ON urls.id = request_errors.url_id WHERE urls.domain_id = domains.id)
  `;

  const rows = await db.all<{ full_name: string }[]>(sql, ...params);

  rows.forEach((row) => {
    console.log(row.full_name);
  });
}
