import { last } from "cheerio/lib/api/traversing";
import { Database } from "sqlite";
import sqlite3 from "sqlite3";
import * as stream from "stream";

const FRIENDLY_ERROR_MESSAGES = {
  CERT_HAS_EXPIRED: "Expired SSL certificate",
  ECONNREFUSED: "",
  ECONNRESET: "",
  EHOSTUNREACH: "Network connection issues",
  ENETUNREACH: "",
  ENOTFOUND: "Domain not found",
  EPROTO: "",
  ERR_TLS_CERT_ALTNAME_INVALID: "SSL issue",
  ESERVFAIL: "Domain not found",
  ETIMEDOUT: "",
  INVALID_CONTENT_TYPE: "",
  SELF_SIGNED_CERT_IN_CHAIN: "SSL issue",
  TIMED_OUT: "",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "SSL issue",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "SSL issue",
} as const;

const IGNORE_ERROR_CODES = (
  Object.keys(
    FRIENDLY_ERROR_MESSAGES
  ) as (keyof typeof FRIENDLY_ERROR_MESSAGES)[]
).filter((code) => {
  return (
    FRIENDLY_ERROR_MESSAGES[code] == null ||
    FRIENDLY_ERROR_MESSAGES[code] === ""
  );
});

const DNS_ERROR_CODES = ["ENOTFOUND", "ESERVFAIL"];

export async function exportErrors(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  stream: stream.Writable
): Promise<void> {
  const sql = `
    SELECT
      domains.full_name,
      error_code
    FROM
      request_errors
      INNER JOIN urls request_error_urls ON request_error_urls.id = request_errors.url_id
      INNER JOIN domains ON domains.id = request_error_urls.domain_id
    WHERE
      error_code NOT IN (${IGNORE_ERROR_CODES.map((c) => `'${c}'`).join(",")})
      AND
      NOT EXISTS (SELECT requests.id FROM requests INNER JOIN urls request_urls ON request_urls.id = requests.url_id WHERE request_urls.domain_id = domains.id)
    GROUP BY domains.full_name, error_code
    ORDER BY domains.full_name, error_code
  `;

  type Record = {
    full_name: string;
    error_code: string;
  };

  type DomainReport = {
    name: string;
    errorCodes: string[];
  };

  stream.write(["URL", "Error(s) encountered"].map((v) => `"${v}"`).join(","));
  stream.write("\n");

  let promise = Promise.resolve<DomainReport | undefined>(undefined);

  await db.each<Record>(sql, (err, row) => {
    promise = promise.then(async (current) => {
      if (err) {
        throw err;
      }

      if (current == null || row.full_name != current.name) {
        current && write(current);
        return {
          name: row.full_name,
          errorCodes: [row.error_code],
        };
      }

      current.errorCodes.push(row.error_code);
      return current;
    });
  });

  const lastRecord = await promise;
  lastRecord && write(lastRecord);

  stream.end();

  function write(report: DomainReport) {
    // Some logic:
    // - If we have DNS issues, but _also_ other errors, ignore the DNS issues

    const errorCodes = report.errorCodes.filter((error) => {
      const isDnsError = DNS_ERROR_CODES.includes(error);

      if (!isDnsError) {
        return true;
      }

      const hasNonDnsErrors = report.errorCodes.some(
        (e) => !DNS_ERROR_CODES.includes(e)
      );

      return !hasNonDnsErrors;
    });

    const errorMessages = Object.keys(
      errorCodes.reduce<{ [key: string]: boolean }>((result, code) => {
        const message =
          FRIENDLY_ERROR_MESSAGES[code as keyof typeof FRIENDLY_ERROR_MESSAGES];
        if (!message) {
          return result;
        }
        result[message] = true;
        return result;
      }, {})
    );

    if (errorMessages.length === 0) {
      return;
    }

    stream.write(
      [`https://${report.name}/`, ...errorMessages]
        .map((value) => `"${value.replace(/"/g, '""')}"`)
        .join(",")
    );
    stream.write("\n");
  }
}

function buildFriendlyErrorCodeSql(columnName: string): string {
  const codes = Object.keys(
    FRIENDLY_ERROR_MESSAGES
  ) as (keyof typeof FRIENDLY_ERROR_MESSAGES)[];

  return codes.reduce<string>((result, code) => {
    const friendlyMessage = FRIENDLY_ERROR_MESSAGES[code];
    return `IIF(${result} = '${code}', '${friendlyMessage}', ${result})`;
  }, columnName);
}
