import { readFileSync } from "node:fs";
import { pool } from "../src/db.ts";

async function main() {
  const schema = readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf-8");
  await pool.query(schema);

  const zeroVector = `[${Array(768).fill(0).join(",")}]`;
  const insert = await pool.query(
    `INSERT INTO chunks (source_type, source_id, title, text, embedding)
     VALUES ('doc', 'verify-test', 'Verify row', 'hello world', $1)
     RETURNING id`,
    [zeroVector]
  );
  const id = insert.rows[0].id;

  const read = await pool.query("SELECT id, source_type, source_id, text FROM chunks WHERE id = $1", [id]);
  console.log("Inserted and read back:", read.rows[0]);

  await pool.query("DELETE FROM chunks WHERE id = $1", [id]);
  console.log("Cleaned up test row.");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
