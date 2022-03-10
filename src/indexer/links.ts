import { URL } from "url";
import { isValidDomainName, normalizeUrl } from "../utils";

/**
 * Indexes the links present on a page.
 */
export async function indexPageLinks(
  pageUrl: URL,
  $: cheerio.Root
): Promise<string[]> {
  const links: { [url: string]: boolean } = {};

  $("a[href]").each(function (index, el) {
    const rawUrl = ($(el).attr("href") ?? "").trim();

    if (!rawUrl) {
      return;
    }

    let url: URL;

    try {
      url = new URL(rawUrl, pageUrl);
    } catch (err: any) {
      return;
    }

    url = normalizeUrl(url);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    if (!isValidDomainName(url)) {
      return;
    }

    if (url.hostname === pageUrl.hostname) {
      // We don't really care about links on the same host.
      return;
    }

    links[url.toString()] = true;
  });

  return Object.keys(links);
}
