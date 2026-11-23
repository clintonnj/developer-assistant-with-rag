import { pool } from "../db.ts";
import type { ScoredChunk } from "./types.ts";

/**
 * Pulls in directly-related chunks for any `operation`/`schema` chunk already in `chunks`, so
 * Claude sees e.g. an operation's request/response schemas even when the schema chunk itself
 * didn't rank highly on its own. There's no separate relationships table - the edges are already
 * sitting in each chunk's own `metadata` (set by chunker/operations.ts and chunker/schemas.ts):
 *   - an `operation` chunk's metadata has `requestSchemas`/`responseSchemas`: string[] of schema
 *     NAMES (match against schema chunks' `metadata.schemaName`)
 *   - a `schema` chunk's metadata has `usedByOperations`/`returnedByOperations`: string[] of
 *     operation IDs (match against operation chunks' `sourceId`)
 * `doc` chunks have no such relationships - leave them as-is.
 *
 * TODO: collect the related schema names / operation ids referenced by `chunks`, query `chunks`
 * for rows matching them that aren't already present (by `id`), and return the combined list.
 * A reasonable default score for an expanded-in chunk is 0 (ranked below anything RRF actually
 * scored) unless you'd rather weight it differently.
 */
function toScoredChunk(row: {
  id: number;
  source_type: string;
  source_id: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}): ScoredChunk {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    text: row.text,
    metadata: row.metadata,
    score: 0,
  };
}

export async function expandThroughRelationships(chunks: ScoredChunk[]): Promise<ScoredChunk[]> {
  const seenIds = new Set(chunks.map((chunk) => chunk.id));
  const schemaNames = new Set<string>();
  const operationIds = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.sourceType === "operation") {
      const requestSchemas = (chunk.metadata.requestSchemas as string[] | undefined) ?? [];
      const responseSchemas = (chunk.metadata.responseSchemas as string[] | undefined) ?? [];
      for (const name of [...requestSchemas, ...responseSchemas]) schemaNames.add(name);
    } else if (chunk.sourceType === "schema") {
      const usedByOperations = (chunk.metadata.usedByOperations as string[] | undefined) ?? [];
      const returnedByOperations = (chunk.metadata.returnedByOperations as string[] | undefined) ?? [];
      for (const id of [...usedByOperations, ...returnedByOperations]) operationIds.add(id);
    }
  }

  const expanded: ScoredChunk[] = [];

  if (schemaNames.size > 0) {
    const { rows } = await pool.query(
      `SELECT id, source_type, source_id, title, text, metadata
         FROM chunks
        WHERE source_type = 'schema' AND metadata->>'schemaName' = ANY($1::text[])`,
      [[...schemaNames]],
    );
    for (const row of rows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      expanded.push(toScoredChunk(row));
    }
  }

  if (operationIds.size > 0) {
    const { rows } = await pool.query(
      `SELECT id, source_type, source_id, title, text, metadata
         FROM chunks
        WHERE source_type = 'operation' AND source_id = ANY($1::text[])`,
      [[...operationIds]],
    );
    for (const row of rows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      expanded.push(toScoredChunk(row));
    }
  }

  return [...chunks, ...expanded];
}
