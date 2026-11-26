import { pool } from "../db.ts";
import type { ChunkRow } from "./types.ts";

export async function vectorSearch(queryEmbedding: number[], limit: number): Promise<ChunkRow[]> {
  const vectorString = `[${queryEmbedding.join(",")}]`;

  const { rows } = await pool.query(
    `SELECT id, source_type, source_id, title, metadata, text, 1 - (embedding <=> $1::vector) AS similarity
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [vectorString, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    text: row.text,
    metadata: row.metadata,
  }));
}
