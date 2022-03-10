import ansi from "ansi";
import { createSqliteDatabase } from "./database";

export async function showBlob(ids: string[]) {
  const db = await createSqliteDatabase("spider.db");
  const cursor = new ansi.Cursor(process.stdout, {
    buffering: false,
    enabled: true,
  });

  await ids.reduce<Promise<unknown>>(
    (p, id) =>
      p.then(async () => {
        const idAsNumber = parseInt(id, 10);
        if (isNaN(idAsNumber)) {
          return Promise.resolve();
        }
        const blob = await db.getBlob(idAsNumber);

        if (!blob) {
          cursor.red().write(`--- #${idAsNumber} NOT FOUND ---\n`).reset();
        } else {
          cursor.bold().write(`--- #${blob.id} ---\n\n`).reset();

          (blob.content ?? "").split("\n").forEach((line) => {
            cursor.grey().write(line).write("\n").reset();
          });

          cursor.nextLine();
        }
      }),
    Promise.resolve()
  );
}
