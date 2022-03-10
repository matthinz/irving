import ansi from "ansi";
import { createProgressMonitor, formatDuration } from "../utils";
import { IndexMessageSentToPrimary } from "./messages";

type UI = {
  update: (m: IndexMessageSentToPrimary) => void;
  render: () => void;
  startWriting: () => void;
  doneWriting: () => void;
  setItemsRemaining: (remaining: number) => void;
};

const WINDOW_SIZE = 100;

export function createUI(): UI {
  const progress = createProgressMonitor();
  const inFlight: { [id: number]: number | undefined } = {};
  const indexed: string[] = [];

  let writeStartedAt: number | undefined;
  let lastWriteTook: number | undefined;

  const cursor = new ansi.Cursor(process.stdout);

  return {
    render,
    setItemsRemaining: progress.setItemsRemaining,
    update,
    startWriting,
    doneWriting,
  };

  function startWriting() {
    writeStartedAt = Date.now();
  }

  function doneWriting() {
    if (writeStartedAt) {
      lastWriteTook = Date.now() - writeStartedAt;
    }
    writeStartedAt = undefined;
  }

  function render() {
    const [width, height] = process.stdout.getWindowSize();

    for (let y = 0; y < height; y++) {
      cursor.goto(0, y).eraseLine();
    }

    cursor.goto(0, 0);

    cursor.write(`Indexed ${progress.countCompleted()} requests`).nextLine();

    if (writeStartedAt) {
      const elapsed = Date.now() - writeStartedAt;
      cursor.write(`writing (${formatDuration(elapsed)})...`).nextLine();
    } else if (lastWriteTook) {
      cursor
        .write(`last write took ${formatDuration(lastWriteTook)}`)
        .nextLine();
    }

    const timeLeft = progress.estimatedTimeLeft();

    if (timeLeft) {
      cursor.write(
        `${progress.countLeft()} remain (~${formatDuration(timeLeft)})`
      );
    }

    cursor.nextLine();
    const linesLeft = Math.floor((height - 5) / 2);
    for (let i = 0; i < Math.min(linesLeft, indexed.length); i++) {
      cursor.nextLine().write(` - ${indexed[i]}`);
    }
  }

  function update(m: IndexMessageSentToPrimary) {
    switch (m.type) {
      case "worker_indexing": {
        inFlight[m.requestId] = Date.now();
        break;
      }
      case "worker_indexed_request": {
        const duration = inFlight[m.requestId];
        delete inFlight[m.requestId];
        if (duration) {
          progress.completed(duration);
        }
        indexed.push(m.url);
        break;
      }
    }

    while (indexed.length > WINDOW_SIZE) {
      indexed.shift();
    }
  }
}
