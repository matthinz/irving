import crypto from "crypto";
import { URL } from "url";
import zlib from "zlib";

export type ProgressMonitor = {
  averageTimePer: () => number;
  completed: (ms: number) => void;
  countCompleted: () => number;
  countLeft: () => number | undefined;
  estimatedTimeLeft: () => number | undefined;
  setItemsRemaining: (remaining: number | undefined) => void;
};

export function createProgressMonitor(): ProgressMonitor {
  let remaining: number | undefined;
  let completedCount = 0;
  let timings: { [ms: number]: number } = {};
  let startTime: number | undefined;
  return {
    averageTimePer,
    completed,
    countCompleted,
    countLeft,
    estimatedTimeLeft,
    setItemsRemaining,
  };
  function averageTimePer(): number {
    if (completedCount === 0) {
      return 0;
    }

    if (startTime == null) {
      return 0;
    }

    return (Date.now() - startTime) / completedCount;
  }
  function completed(ms: number) {
    timings[ms] = timings[ms] ? timings[ms] + 1 : 1;
    completedCount++;
    startTime = startTime ?? Date.now();
  }
  function countCompleted() {
    return completedCount;
  }
  function countLeft(): number | undefined {
    return remaining;
  }
  function estimatedTimeLeft(): number | undefined {
    const left = countLeft();
    if (left == null) {
      return;
    }
    return averageTimePer() * left;
  }
  function setItemsRemaining(newItemsRemaining: number | undefined) {
    remaining = newItemsRemaining;
  }
}

export function fitUrl(url: URL | string, width: number): string {
  let result = url.toString();
  if (result.length <= width) {
    return result;
  }

  if (typeof url === "string") {
    url = new URL(url);
  }

  result = result.substring((url.protocol?.length ?? 0) + 2);
  if (result.length <= width) {
    return result;
  }

  result = result.replace(/^www\./, "");
  if (result.length <= width) {
    return result;
  }

  return result.substring(0, width - 3) + "...";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    const whole = Math.floor(minutes);
    const s = Math.round(seconds - whole * 60);
    return `${whole}m${s}s`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = hours / 24;
  return `${Math.round(days)}d`;
}

export function gunzip(blob: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(blob, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result.toString("utf8"));
    });
  });
}

export function gzip(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(text, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

export function isValidDomainName(urlOrName: string | URL): boolean {
  try {
    const result = parseDomainName(urlOrName);
    return result.length > 0;
  } catch (err: any) {
    return false;
  }
}

export function md5(data: string): string {
  const hash = crypto.createHash("md5");
  hash.update(data);
  return hash.digest().toString("hex");
}

/**
 * Given a URL, applies a few normalizations.
 * @param url
 * @returns
 */
export function normalizeUrl(url: URL | string): URL {
  const result = new URL(url.toString());

  if (result.protocol === "http:") {
    result.protocol = "https:";
  }

  if (result.pathname == "") {
    result.pathname = "/";
  }

  result.pathname = result.pathname.replace(/^\/{2,}/, "/");

  result.hash = "";

  return result;
}

export function parseDomainName(urlOrName: URL | string): string[] {
  const name = (urlOrName instanceof URL ? urlOrName.hostname : urlOrName)
    .trim()
    .toLowerCase();

  const parts = name.split(".").filter((p) => p !== "");

  const ok = parts.reduce<boolean>((result, p) => {
    if (!result) {
      return false;
    }
    if (/[^a-z0-9-]/.test(p) || /(^-|-$)/.test(p)) {
      return false;
    }
    return true;
  }, true);

  if (parts.length < 2 || !ok) {
    const err: any = new Error(`Invalid domain name: ${name}`);
    err.code = "INVALID_DOMAIN";
    throw err;
  }

  return parts;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
