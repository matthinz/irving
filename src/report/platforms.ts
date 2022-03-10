import { Database } from "sqlite";
import sqlite3 from "sqlite3";
import * as stream from "stream";
import { getUrlPriority } from "../spider/priority";
import { QueuePriority, SpiderOptions } from "../types";
import { URL } from "url";

type PlatformSelector = {
  label: string;
  signals: string[];
  specificity: number;
};

type Signal = {
  id: number;
  name: string;
  columnName: string;
};

type IdentifiedSignal = {
  name: string;
  strength: number;
};

type Row = {
  [index: string]: number | string | undefined;
  name: string;
  url: string;
};

const UNKNOWN_PLATFORM = "Unknown";

export async function exportDomainsByPlatform(
  options: SpiderOptions,
  db: Database<sqlite3.Database, sqlite3.Statement>,
  stream: stream.Writable
): Promise<void> {
  const allSignals = await getSignals(db);
  const rows = await fetchDomainsWithSignalData(db, options, allSignals);

  stream.write("URL,Platform,Addl. technologies\n");

  rows.forEach((row) => {
    const platformName = identifyPlatform(options.platforms, allSignals, row);
    const platform = options.platforms.find((p) => p.label === platformName);

    // Only report signals that weren't considered when deciding platform
    const signalsToReport = allSignals
      .map((signal) => {
        if ((platform?.signals ?? []).includes(signal.name)) {
          return;
        }
        return signal;
      })
      .map((signal) => {
        if (!signal) {
          return;
        }
        const strength = row[signal.columnName];
        return strength != null && strength > 0 ? signal.name : undefined;
      })
      .filter((x) => x) as string[];

    stream.write(
      [`https://${row.full_name}/`, platformName, ...signalsToReport]
        .map((value) => `"${value.replace(/"/g, '""')}"`)
        .join(",")
    );
    stream.write("\n");
  });

  stream.end();
}

function getSignalsForDomain(
  row: Row,
  allSignals: Signal[]
): IdentifiedSignal[] {
  return allSignals
    .filter(
      ({ columnName }) => row[columnName] != null && Number(row[columnName]) > 0
    )
    .map(({ name, columnName }) => ({
      name,
      strength: Number(row[columnName]),
    }));
}

function identifyPlatform(
  platforms: PlatformSelector[],
  signals: Signal[],
  row: Row
): string {
  type Result = {
    label?: string | undefined;
    specificity: number;
    strength: number;
  };

  const identifiedSignals = getSignalsForDomain(row, signals);

  let result: Result = { specificity: 0, strength: 0 };

  platforms.forEach((platform) => {
    const identifedPlatformSignals = identifiedSignals.filter((i) =>
      platform.signals.includes(i.name)
    );

    const allPlatformSignalsMatch =
      identifedPlatformSignals.length === platform.signals.length;
    if (!allPlatformSignalsMatch) {
      return;
    }

    const strength = identifedPlatformSignals.reduce(
      (total, s) => total + s.strength,
      0
    );

    if (platform.specificity > result.specificity) {
      // This is a more specific platform than we had before
      result = {
        ...platform,
        strength,
      };
      return;
    }

    if (
      platform.specificity === result.specificity &&
      strength > result.strength
    ) {
      // We have a conflict in specificity, so take the one with the stronger signal
      result = {
        ...platform,
        strength,
      };
      return;
    }
  });

  return result.label ?? UNKNOWN_PLATFORM;
}

/**
 *
 */
async function getAllowedDomainIds(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  options: SpiderOptions
): Promise<number[]> {
  type DomainsRow = {
    id: number;
    full_name: string;
    ok_to_spider: number;
  };

  const nextDomain = createIterator();

  const result: number[] = [];

  for (let d = await nextDomain(); d; d = await nextDomain()) {
    if (d.ok_to_spider === 0) {
      continue;
    }

    const priority = getUrlPriority(
      new URL(`https://${d.full_name}/`),
      options
    );

    if (priority === QueuePriority.Ignore) {
      continue;
    }

    if (options.canSpiderDomain(d.full_name) === false) {
      continue;
    }

    result.push(d.id);
  }

  return result;

  function createIterator(): () => Promise<DomainsRow | undefined> {
    let lastId = 0;
    let batch: DomainsRow[] = [];

    return async function next(): Promise<DomainsRow | undefined> {
      while (true) {
        let next = batch.shift();
        if (next != null) {
          lastId = next.id;
          return next;
        }
        batch = await db.all<DomainsRow[]>(
          "SELECT * FROM domains parent WHERE id > ? LIMIT 50",
          lastId
        );
        if (batch.length === 0) {
          return undefined;
        }
      }
    };
  }
}

async function fetchDomainsWithSignalData(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  options: SpiderOptions,
  signals: Signal[]
): Promise<Row[]> {
  const signalColumns = signals.map(
    ({ columnName }) =>
      `(SELECT strength FROM domain_signals WHERE domain_id = domains.id AND signal_id = ?) AS ${columnName}`
  );

  const allowedDomainIds = await getAllowedDomainIds(db, options);

  const params = [...signals.map(({ id }) => id), ...allowedDomainIds];

  const criteria = [
    `
    -- Only include domains where we've made a successful request
    EXISTS (SELECT requests.id FROM requests INNER JOIN urls ON urls.id = requests.url_id WHERE urls.domain_id = domains.id)
    `,
    `
    -- Exclude domains where a request for the root returned a 301/302
    NOT EXISTS (SELECT requests.id FROM requests INNER JOIN urls on urls.id = requests.url_id WHERE urls.domain_id = domains.id AND (requests.status = 301 OR requests.status = 302) AND urls.url = 'https://' || domains.full_name || '/')
    `,
    `
    -- Only include domains we were allowed to spider
    (domains.id IN (${allowedDomainIds.map(() => "?").join(",")}))
    `,
  ];

  const sql = `
        SELECT
            full_name,
            'https://' || full_name || '/' AS url,
            ${signalColumns.join(",\n            ")}
        FROM
            domains
        WHERE
            (${criteria.join(" AND ")})
        ORDER BY
            full_name
    `;

  return await db.all<Row[]>(sql, ...params);
}

async function getSignals(
  db: Database<sqlite3.Database, sqlite3.Statement>
): Promise<Signal[]> {
  return (
    await db.all<{ id: number; name: string }[]>("SELECT * FROM signals")
  ).map(({ id, name }) => ({
    id,
    name,
    columnName: `signal_${name.replace(/-/g, "_")}`,
  }));
}
