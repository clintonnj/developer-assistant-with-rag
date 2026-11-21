import { pool } from "./db.ts";
import { chunkAllSources } from "./chunker/index.ts";
import { embed } from "./embeddings/ollama.ts";
import type { Chunk } from "./chunker/types.ts";

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function insertChunk(chunk: Chunk, embedding: string): Promise<void> {
  await pool.query(
    `INSERT INTO chunks (source_type, source_id, title, text, metadata, embedding)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [chunk.sourceType, chunk.sourceId, chunk.title, chunk.text, JSON.stringify(chunk.metadata), embedding]
  );
}

export interface IngestResult {
  total: number;
  embedded: number;
  bySourceType: Record<string, number>;
}

/**
 * Rebuilds chunks straight from every registered source (see src/chunker/index.ts) and
 * re-populates the `chunks` table.
 * Re-runnable: deletes old rows per source_type (not a full truncate) before inserting,
 * so re-running after editing just one chunker file doesn't wipe unrelated source types.
 */
export async function runIngest(): Promise<IngestResult> {
  const chunks = await chunkAllSources();

  const sourceTypes = [...new Set(chunks.map((chunk) => chunk.sourceType))];
  for (const sourceType of sourceTypes) {
    await pool.query("DELETE FROM chunks WHERE source_type = $1", [sourceType]);
  }

  const bySourceType: Record<string, number> = {};

  for (const chunk of chunks) {
    bySourceType[chunk.sourceType] = (bySourceType[chunk.sourceType] ?? 0) + 1;
    const embedding = toVectorLiteral(await embed(chunk.text));
    await insertChunk(chunk, embedding);
  }

  return { total: chunks.length, embedded: chunks.length, bySourceType };
}
