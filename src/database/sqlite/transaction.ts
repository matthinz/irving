import { Database } from "sqlite";
import sqlite3 from "sqlite3";
import { Transaction } from "../types";

export async function createTransaction(
  db: Database<sqlite3.Database>
): Promise<Transaction> {
  let active = true;

  await db.run("BEGIN TRANSACTION");

  return { commit, rollback, run };

  async function commit() {
    if (!active) {
      throw new Error("Transaction is no longer active");
    }
    active = false;
    await db.run("COMMIT");
  }

  async function rollback() {
    if (!active) {
      throw new Error("Transaction is no longer active");
    }
    active = false;
    await db.run("ROLLBACK");
  }

  async function run<T>(callback: () => Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await callback();
    } catch (err: any) {
      await rollback();
      throw err;
    }
    await commit();
    return result;
  }
}
