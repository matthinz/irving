import { URL } from "url";
import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import * as stream from "stream";

type Provider = {
  name: string;
  like: string;
  regex: RegExp;
  normalize: (input: string) => string | undefined;
};

const PROVIDERS: Provider[] = [
  {
    name: "Twitter",
    like: "https://www.twitter.com/%",
    regex: /^https:\/\/www\.twitter\.com\/[a-z0-9_-]+\/?$/i,
    normalize: (input) => input.replace(/\/+$/g, ""),
  },
  {
    name: "Flickr",
    like: "https://www.flickr.com/%",
    regex: /^https:\/\/www\.flickr\.com/i,
    normalize: (input) => {
      const url = new URL(input);
      url.search = "";
      url.hash = "";

      let pathElements = url.pathname.split("/").filter((x) => x !== "");
      if (pathElements.length === 0) {
        return;
      }

      const BANNED_DIRS = ["groups"];
      if (BANNED_DIRS.includes(pathElements[0])) {
        return;
      }

      if (pathElements[0] === "photos") {
        pathElements[0] = "people";
      }

      if (pathElements[0] === "people") {
        pathElements = pathElements.slice(0, 2);
      } else {
        pathElements = pathElements.slice(0, 1);
      }

      url.pathname = `/${pathElements.join("/")}`;

      return url.toString();
    },
  },
  {
    name: "Facebook",
    like: "https://www.facebook.com/%",
    regex: /^https:\/\/www\.facebook\.com/i,
    normalize: (input) => {
      const url = new URL(input);

      url.search = "";
      url.hash = "";

      let pathElements = url.pathname
        .replace(/%20/g, "")
        .split("/")
        .filter((x) => x !== "");

      if (pathElements.length === 0) {
        return;
      }

      const haveWeirdChars = pathElements.some((e) => /[^\w\d_-]/i.test(e));
      if (haveWeirdChars) {
        return;
      }

      const SPECIAL_DIRS = [
        "dialog",
        "events",
        "hashtag",
        "search",
        "sharer",
        "watch",
      ];
      if (SPECIAL_DIRS.includes(pathElements[0])) {
        return;
      }

      // Some urls are like facebook.com/12345_123123/
      if (/^[\d_]+$/.test(pathElements[0])) {
        return;
      }

      // Some urls are .php files
      if (/\.php$/.test(pathElements[0])) {
        return;
      }

      if (pathElements[0] === "pages" || pathElements[0] === "groups") {
        if (pathElements.length == 1) {
          return;
        }

        pathElements = pathElements.slice(0, 2);
      } else {
        pathElements = pathElements.slice(0, 1);
      }

      url.pathname = `/${pathElements.join("/")}/`;

      return url.toString();
    },
  },
  {
    name: "Youtube",
    like: "https://www.youtube.com/%",
    regex: /^https:\/\/www\.youtube\.com/i,
    normalize: (input) => {
      const url = new URL(input);
      url.search = "";
      url.hash = "";

      let pathElements = url.pathname.split("/").filter((x) => x !== "");

      if (pathElements.length === 0) {
        return;
      }

      switch (pathElements[0]) {
        case "watch":
        case "embed":
        case "playlist":
        case "redirect":
        case "view_play_list":
          return;

        case "c":
        case "channel":
        case "user":
          pathElements = pathElements.slice(0, 2);
          break;
      }

      if (/[^\w\d_-]/i.test(pathElements[0])) {
        return;
      }

      url.pathname = `/${pathElements.join("/")}`;

      return url.toString();
    },
  },
];

export function exportSocialMediaFeeds(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  stream: stream.Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    const criteria = PROVIDERS.map(({ like }) => "urls.url LIKE ?").join(
      " OR "
    );
    const params = PROVIDERS.map(({ like }) => like);

    const sql = `
        SELECT
            url,
            from_domains.full_name AS linked_from
        FROM
            urls
            INNER JOIN domain_links ON domain_links.to_url_id = urls.id
            INNER JOIN domains from_domains ON from_domains.id = domain_links.from_domain_id
        WHERE
            ${criteria}
        ORDER BY
          urls.url
    `;

    type SocialMediaUrl = {
      provider: string;
      url: string;
      linkedFrom: {
        [domain: string]: boolean;
      };
    };

    const urls: { [key: string]: SocialMediaUrl | undefined } = {};

    db.each<{ url: string; linked_from: string }[]>(
      sql,
      ...params,
      (err: any, row: { url: string; linked_from: string }) => {
        if (err) {
          reject(err);
          return;
        }

        const provider = PROVIDERS.find((p) => p.regex.test(row.url));
        if (!provider) {
          return;
        }

        const url = provider.normalize(row.url);
        if (!url) {
          return;
        }

        const key = url.toLowerCase();
        if (!urls[key]) {
          urls[key] = {
            provider: provider.name,
            url,
            linkedFrom: {},
          };
        }

        const item = urls[key];
        if (!item) {
          throw new Error();
        }
        item.linkedFrom[`https://${row.linked_from}`] = true;
      }
    )
      .then(() => {
        stream.write(["Provider", "URL", "Linked from"].join(","));
        stream.write("\n");

        Object.values(urls).forEach((item) => {
          if (!item) {
            return;
          }
          stream.write(
            [item.provider, item.url, ...Object.keys(item.linkedFrom)]
              .map((item) => `"${item.replace(/"/g, '""')}"`)
              .join(",")
          );
          stream.write("\n");
        });
        resolve();
      })
      .catch(reject);
  });
}
