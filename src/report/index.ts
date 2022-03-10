import fs from "fs";
import path from "path";
import { Writable } from "stream";
import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";

import { exportDomainsByPlatform } from "./platforms";
import { exportSocialMediaFeeds } from "./social";
import { exportRedirects } from "./redirects";
import { exportErrors } from "./errors";
import { SpiderOptions } from "../types";

type Exporter = (
  db: Database<sqlite3.Database, sqlite3.Statement>,
  stream: Writable
) => Promise<void>;

export async function report(args: string[]): Promise<void> {
  const options = (await import("../config")).default as SpiderOptions;
  const outDir = "report";

  fs.mkdirSync(outDir, { recursive: true });

  const db = await open({
    filename: options.databaseFile,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });

  // db.on("trace", (message: any) => console.error(message));

  const exporters: { [file: string]: Exporter } = {
    "platforms.csv": exportDomainsByPlatform.bind(null, options),
    "errors.csv": exportErrors,
    "redirects.csv": exportRedirects,
    "social.csv": exportSocialMediaFeeds,
  };

  const files = Object.keys(exporters);

  await files.reduce<Promise<unknown>>(
    (p, file) =>
      p.then(async () => {
        const fullPath = path.join(outDir, file);
        const stream = fs.createWriteStream(fullPath, "utf-8");

        stream.on("error", (err) => {
          console.error(err);
          process.exitCode = 1;
        });

        const exporter = exporters[file];

        console.log("✍️ Writing %s...", file);

        try {
          await exporter(db, stream);
        } catch (err: any) {
          console.error(`Error building ${file}`, err);
        }

        console.log("✅ Wrote %s", file);
        stream.end();
      }),
    Promise.resolve()
  );
}
