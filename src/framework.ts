import child from "child_process";
import cluster, { Worker as ClusterWorker } from "cluster";
import os from "os";
import options from "./config";

// This file defines a basic primary / worker architecture that gets layered
// on top of Node's `cluster` functionality.
// Primaries communicate with workers via strongly-typed message passing
// (and vice-versa).

export interface Primary<PrimaryMessageType, WorkerMessageType> {
  createUI(): UI<PrimaryMessageType>;
  dispatchNextItem(sendToWorker: (m: WorkerMessageType) => void): Promise<void>;
  handleMessage(
    worker: number,
    m: PrimaryMessageType,
    sendToWorker: (m: WorkerMessageType) => void
  ): Promise<void>;
  initializeWorker(sendToWorker: (m: WorkerMessageType) => void): Promise<void>;
  isFinished(): Promise<boolean>;
  parseMessage(m: any): PrimaryMessageType | undefined;
  /**
   * @returns {boolean} `true` if `m` is a notification saying a worker is idle.
   */
  isIdleMessage(m: PrimaryMessageType): boolean;
}

export interface UI<PrimaryMessageType> {
  render(): void;
  update(worker: number, m: PrimaryMessageType): void;
}

export interface Worker<PrimaryMessageType, WorkerMessageType> {
  parseMessage(m: any): WorkerMessageType | undefined;
  handleMessage(
    m: WorkerMessageType,
    sendToPrimary: (m: PrimaryMessageType) => void
  ): Promise<void>;
}

export type Options<PrimaryMessageType, WorkerMessageType> = {
  workerCount: number | (() => number);
  createPrimary: () => Promise<Primary<PrimaryMessageType, WorkerMessageType>>;
  createWorker: () => Promise<Worker<PrimaryMessageType, WorkerMessageType>>;
};

export async function run<
  PrimaryMessageType extends child.Serializable,
  WorkerMessageType extends child.Serializable
>({
  createPrimary,
  createWorker,
  workerCount,
}: Options<PrimaryMessageType, WorkerMessageType>): Promise<void> {
  if (cluster.isPrimary) {
    const primary = await createPrimary();
    await startPrimary(primary);
  } else if (cluster.isWorker) {
    const worker = await createWorker();
    await startWorker(worker);
  } else {
    throw new Error("Neither primary nor worker.");
  }

  async function startPrimary(
    primary: Primary<PrimaryMessageType, WorkerMessageType>
  ): Promise<void> {
    const ui = await primary.createUI();
    let workersOnline = 0;
    let interrupted = false;
    let dispatchPromise = Promise.resolve();
    let messageHandlingPromise = Promise.resolve();

    process.on("SIGINT", () => {
      if (interrupted) {
        process.exit();
        return;
      }

      interrupted = true;

      Promise.all([messageHandlingPromise, dispatchPromise]).then(() => {
        exitIfPossible();
        function exitIfPossible() {
          if (workersOnline === 0) {
            process.exit();
          } else {
            setTimeout(exitIfPossible, 100);
          }
        }
      });
    });

    // When a new worker comes online, initialize it.
    cluster.on("online", (clusterWorker) => {
      const sendToWorker = (m: WorkerMessageType) => {
        clusterWorker.send(m);
      };

      workersOnline++;

      console.error("Online: %d", clusterWorker.id);

      primary
        .initializeWorker(sendToWorker)
        .then(() => {})
        .catch((err) => {
          console.error(`Error initializing worker ${clusterWorker.id}`, err);
          clusterWorker.disconnect();
        });
    });

    // When a worker disconnects, start a new one unless we've done all the work.
    cluster.on("disconnect", (clusterWorker) => {
      workersOnline--;

      console.error("Disconnect: %d", clusterWorker.id);

      primary
        .isFinished()
        .then((finished) => {
          if (interrupted || finished) {
            return;
          }
          const workersNeeded =
            typeof workerCount === "function" ? workerCount() : workerCount;
          for (let i = workersOnline; i < workersNeeded; i++) {
            cluster.fork();
          }
        })
        .catch((err) => {
          console.error("Error establishing if work has finished.", err);
        });
    });

    // When we receive a message from a worker, process it
    cluster.on("message", (clusterWorker, rawMessage) => {
      const m = primary.parseMessage(rawMessage);
      if (!m) {
        return;
      }

      const sendToWorker = (m: WorkerMessageType) => {
        clusterWorker.send(m);
      };

      ui.update(clusterWorker.id, m);

      messageHandlingPromise = messageHandlingPromise.then(() => {
        return primary
          .handleMessage(clusterWorker.id, m, sendToWorker)
          .catch((err) => {
            console.error("Error processing message");
            console.error(m);
            console.error(err);
          })
          .then(() => {
            if (primary.isIdleMessage(m)) {
              // This worker is telling us it's idle and needs something to do.
              const workersNeeded = getWorkersNeeded();
              if (workersOnline > workersNeeded) {
                // We don't need this worker.
                clusterWorker.disconnect();
                return;
              } else {
                spawnWorkers();
              }
            }

            if (!interrupted) {
              dispatchPromise = dispatchPromise.then(() => {
                if (!interrupted) {
                  return primary.dispatchNextItem(sendToWorker).catch((err) => {
                    console.error("Error dispatching next item");
                    console.error(err);
                    clusterWorker.disconnect();
                  });
                }
              });
            }
          });
      });
    });

    // Give every CPU a job.
    spawnWorkers();

    // And start rendering
    ui.render();
    setInterval(ui.render, 1000);

    function getWorkersNeeded(): number {
      if (interrupted) {
        return 0;
      }
      return typeof workerCount === "function" ? workerCount() : workerCount;
    }

    function spawnWorkers() {
      const workersNeeded = getWorkersNeeded();
      for (let i = workersOnline; i < workersNeeded; i++) {
        cluster.fork();
      }
    }
  }

  async function startWorker(
    worker: Worker<PrimaryMessageType, WorkerMessageType>
  ): Promise<void> {
    const sendToPrimary = (m: PrimaryMessageType) => {
      const { send } = process;
      if (!send) {
        throw new Error("process.send is not available");
      }
      send.call(process, m);
    };

    process.on("message", (rawMessage) => {
      const m = worker.parseMessage(rawMessage);
      if (!m) {
        return;
      }
      worker.handleMessage(m, sendToPrimary);
    });
  }
}
