import { bless } from "./bless";
import { showBlob } from "./blob";
import { buildIndex } from "./indexer";
import { report } from "./report";
import { reprioritize } from "./reprioritize";
import { scanRequests } from "./scan";
import { spider } from "./spider";
import { unrequested } from "./unrequested";

const SUBCOMMANDS: { [key: string]: (args: string[]) => Promise<void> } = {
  bless,
  blob: showBlob,
  index: buildIndex,
  report: report,
  scan: scanRequests,
  spider: spider,
  reprioritize,
  unrequested,
};

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  if (err.stack) {
    console.error(err.stack);
  } else {
    console.error(err);
  }

  process.exitCode = 1;
});

async function run(args: string[]) {
  let subcommand: string | undefined;
  const filteredArgs: string[] = [];

  args.forEach((arg) => {
    if (!SUBCOMMANDS[arg]) {
      filteredArgs.push(arg);
      return;
    }

    if (subcommand) {
      throw new Error("Multiple subcommands specified");
    }

    subcommand = arg;
  });

  if (!subcommand) {
    console.log("Available subcommands:");
    Object.keys(SUBCOMMANDS).forEach((s) => console.log("\t- %s", s));
    process.exitCode = 1;
    return;
  }

  try {
    await SUBCOMMANDS[subcommand](filteredArgs);
  } catch (err: any) {
    console.error(err);
  }
}
