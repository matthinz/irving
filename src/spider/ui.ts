import ansi from "ansi";
import { SpiderQueueStatus } from "../types";
import { fitUrl, formatDuration } from "../utils";
import { SpiderPrimaryMessage } from "./messages";
import { spider } from "./spider";

export type UI = {
  update: (m: SpiderPrimaryMessage) => void;
  render: () => void;
};

type QueueItemState =
  | "unknown"
  | "request_head"
  | "request_get"
  | "request_get_error"
  | "spidering"
  | "spidered"
  | "not_spidered";

type QueueItem = {
  state: QueueItemState;
  queueItemId: number;
  url: string;
  startedAt: number;
  finishedAt?: number;
  done: boolean;
  error?: {
    code?: string | undefined;
    message: string;
  };
};

const EMOJI_BY_STATE = {
  request_head: "👀",
  request_get: "👀",
  request_get_error: "❌",
  spidered: "✅",
  spidering: "🕸",
  not_spidered: "❌",
  unknown: " ",
} as const;

const VALID_STATE_TRANSITIONS: {
  [key in QueueItemState]: QueueItemState[];
} = {
  not_spidered: [],
  request_head: ["request_get", "not_spidered"],
  request_get: ["request_get_error", "spidering"],
  request_get_error: [],
  spidered: [],
  spidering: ["spidered"],
  unknown: ["request_head", "spidering", "not_spidered"],
};

const MAX_DONE_ITEM_AGE = 5 * 60 * 1000;

export function createUI() {
  let queueStatus: SpiderQueueStatus | undefined;

  let inFlight: QueueItem[] = [];
  const messagesByQueueId: { [id: number]: SpiderPrimaryMessage[] } = {};

  return { setQueueStatus, render, update };

  function setQueueStatus(status: SpiderQueueStatus) {
    queueStatus = status;
  }

  function render() {
    const cursor = ansi(process.stdout, { buffering: false, enabled: true });

    const [width, height] = process.stdout.getWindowSize() ?? [0, 0];

    if (width === 0 || height == 0) {
      return;
    }

    for (let y = 0; y < height; y++) {
      cursor.goto(0, y).eraseLine();
    }

    const maxSectionHeight = Math.max(1, Math.floor((height - 6) / 3));

    cursor.goto(0, 0);

    const notDone = inFlight
      .filter((i) => !i.done)
      .slice()
      .reverse();

    notDone.slice(0, maxSectionHeight).forEach(renderItem);

    for (let i = notDone.length; i < maxSectionHeight; i++) {
      cursor.write("\n");
    }

    if (notDone.length > maxSectionHeight) {
      cursor
        .grey()
        .write(`+${notDone.length - maxSectionHeight} more...`)
        .reset()
        .nextLine();
    }

    cursor.write("\n");

    const spidered = inFlight
      .filter((i) => i.done && i.state === "spidered")
      .slice()
      .reverse();

    spidered.slice(0, maxSectionHeight).forEach(renderItem);

    for (let i = spidered.length; i < maxSectionHeight; i++) {
      cursor.write("\n");
    }

    if (spidered.length > maxSectionHeight) {
      cursor
        .grey()
        .write(`+${spidered.length - maxSectionHeight} more...`)
        .reset()
        .nextLine();
    }

    cursor.write("\n");

    const otherDone = inFlight
      .filter((i) => i.done && i.state !== "spidered")
      .slice()
      .reverse();

    otherDone.slice(0, maxSectionHeight).forEach(renderItem);

    for (let i = otherDone.length; i < maxSectionHeight; i++) {
      cursor.write("\n");
    }

    if (otherDone.length > maxSectionHeight) {
      cursor
        .grey()
        .write(`+${otherDone.length - maxSectionHeight} more...`)
        .reset()
        .nextLine();
    }

    cursor.write("\n");

    if (queueStatus) {
      cursor.write(
        ["high", "medium", "low", "ignore", "processed"]
          .map(
            (key: string) =>
              `${key}: ${
                queueStatus && queueStatus[key as keyof SpiderQueueStatus]
              }`
          )
          .join(", ")
      );
    }

    function renderItem(i: QueueItem) {
      const emoji =
        EMOJI_BY_STATE[i.state as keyof typeof EMOJI_BY_STATE] ?? i.state;
      const urlWidth = Math.min(50, width - 12);
      const elapsed = (i.finishedAt ?? Date.now()) - i.startedAt;

      if (!i.done && elapsed > 30 * 1000) {
        console.error(JSON.stringify(i, null, 2));
      }

      cursor
        .write(`${emoji} `)
        .write(padRight(fitUrl(i.url, urlWidth), urlWidth));

      if (i.error && i.error.code) {
        cursor
          .red()
          .write(` ${padRight(i.error.code, 20)}`)
          .reset();
      }

      cursor
        .grey()
        .write(` ${formatDuration(elapsed)}`)
        .reset()
        .nextLine();
    }
  }

  function update(m: SpiderPrimaryMessage) {
    let index = inFlight.findIndex((i) => i.queueItemId === m.queueItemId);
    let item: QueueItem | undefined;

    if (index >= 0) {
      item = inFlight[index];
      if (item.done) {
        item = undefined;
      }
    }

    if (item == null) {
      item = {
        queueItemId: m.queueItemId,
        url: m.url,
        state: "unknown",
        startedAt: Date.now(),
        done: false,
      };
      inFlight.push(item);
    }

    messagesByQueueId[m.queueItemId] = messagesByQueueId[m.queueItemId] ?? [];
    messagesByQueueId[m.queueItemId].push(m);

    switch (m.type) {
      case "making_head_request":
        setState("request_head");
        break;

      case "making_get_request":
        setState("request_get");
        break;

      case "get_request_error":
        setState("request_get_error");
        item.error = m.error;
        item.done = true;
        item.finishedAt = Date.now();
        break;

      case "spidered":
        setState("spidered");
        item.done = true;
        item.finishedAt = Date.now();
        break;

      case "spidering":
        setState("spidering");
        break;

      case "not_spidering":
        setState("not_spidered");
        item.error = m.error;
        item.done = true;
        item.finishedAt = Date.now();
        break;

      default:
        // console.error(m.queueItemId, m.type, m.url);
        break;
    }

    inFlight = inFlight.filter((item) => {
      if (!item.done) {
        return true;
      }

      const age = Date.now() - item.startedAt;
      return age < MAX_DONE_ITEM_AGE;
    });

    function setState(nextState: QueueItemState) {
      if (!item) {
        return;
      }
      const isValid = VALID_STATE_TRANSITIONS[item.state].includes(nextState);
      if (!isValid) {
        console.error(
          `INVALID STATE TRANSITION: ${item.state} -> ${nextState}`
        );
      }
      item.state = nextState;
    }
  }
}

function padRight(input: string, length: number): string {
  while (input.length < length) {
    input = `${input} `;
  }
  return input;
}
