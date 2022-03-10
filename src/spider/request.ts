import { URL } from "url";
import { HttpClient, HttpResponse } from "../http";
import { SpiderOptions } from "../types";
import { gzip, md5 } from "../utils";
import { PrimaryMessageType, SpiderPrimaryMessage } from "./messages";
import { isContentTypeAllowed } from "./utils";

type Context = {
  queueItemId: number;
  sessionId: number;
};

export async function executeRequest(
  method: "GET" | "HEAD",
  url: URL,
  { queueItemId, sessionId }: Context,
  options: SpiderOptions,
  client: HttpClient,
  sendToPrimary: (m: SpiderPrimaryMessage) => void
) {
  const startingMessageType = `making_${method.toLowerCase()}_request` as
    | "making_head_request"
    | "making_get_request";
  const errorMessageType = `${method.toLowerCase()}_request_error` as
    | "head_request_error"
    | "get_request_error";
  const successMessageType = `${method.toLowerCase()}_request_success` as
    | "head_request_success"
    | "get_request_success";

  sendToPrimary({
    type: startingMessageType,
    url: url.toString(),
    queueItemId,
    sessionId,
  });

  try {
    let res: HttpResponse;

    if (method == "GET") {
      res = await client.get(url);
    } else if (method == "HEAD") {
      res = await client.head(url);
    } else {
      throw new Error(`Invalid method: ${method}`);
    }

    const headers = JSON.stringify(res.headers);

    if (method === "GET") {
      sendToPrimary({
        type: "get_request_success",
        queueItemId,
        sessionId,
        url: url.toString(),
        request: {
          contentType: res.contentType,
          gzippedBody: await gzip(res.body),
          bodyMd5: md5(res.body),
          gzippedHeaders: await gzip(headers),
          headersMd5: md5(headers),
          status: res.status,
          url: url.toString(),
        },
      });
    } else {
      sendToPrimary({
        type: "head_request_success",
        queueItemId,
        sessionId,
        url: url.toString(),
        request: {
          contentType: res.contentType,
          gzippedHeaders: await gzip(headers),
          headersMd5: md5(headers),
          status: res.status,
          url: url.toString(),
        },
      });
    }

    return res;
  } catch (err: any) {
    sendToPrimary({
      type: errorMessageType,
      queueItemId,
      sessionId,
      url: url.toString(),
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }
}
