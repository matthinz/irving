import { URL } from "url";
import { createHttpClient } from "../http";
import robotsParser from "robots-parser";

export function createRobotsChecker(): (url: URL) => Promise<boolean> {
  const httpClient = createHttpClient({
    shouldProcessContentType: () => true,
  });

  const cache: { [url: string]: string | false } = {};

  return async function canRequest(url: URL): Promise<boolean> {
    const robotsUrl = new URL("/robots.txt", url);
    const robotsUrlAsString = robotsUrl.toString();

    if (cache[robotsUrlAsString] == null) {
      try {
        const resp = await httpClient.get(robotsUrl);
        if (resp.status === 200 && resp.contentType.startsWith("text/plain")) {
          cache[robotsUrlAsString] = resp.body;
        } else {
          cache[robotsUrlAsString] = false;
        }
      } catch (err: any) {
        console.error(
          `Error fetching robots.txt at ${robotsUrl.toString()}`,
          err
        );
        return true;
      }
    }

    const robotsTxt = cache[robotsUrlAsString];

    if (!robotsTxt) {
      // No robots = we allow it
      return true;
    }

    const parser = robotsParser(robotsUrlAsString, robotsTxt);

    if (parser.isDisallowed(url.toString())) {
      return false;
    }

    return true;
  };
}
