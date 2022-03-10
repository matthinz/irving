import { URL } from "url";
import cheerio from "cheerio";
import { SpiderRequestWithResponse } from "../types";
import { indexPageLinks } from "./links";
import { indexPageSignals } from "./signals";

type IndexRequestResult = {
  links: string[];
  signals: string[];
};

/**
 * @param req
 */
export async function indexRequest(
  req: SpiderRequestWithResponse,
  $?: cheerio.Root
): Promise<IndexRequestResult> {
  $ = $ ?? cheerio.load(req.body);

  const [links, signals] = await Promise.all([
    indexPageLinks(req.url, $),
    indexPageSignals(req, $),
  ]);

  return {
    links,
    signals,
  };
}
