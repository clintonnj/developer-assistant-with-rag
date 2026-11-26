import type { ChunkRow, ScoredChunk } from "./types.ts";

/**
 * Reciprocal Rank Fusion: merges several independently-ranked result lists (e.g. vector search
 * and full-text search) into one ranked list, without needing the two scoring scales (cosine
 * distance vs. ts_rank) to be comparable.
 *
 * TODO: for each list, each chunk at position `rank` (0-based) contributes `1 / (k + rank + 1)`
 * to that chunk's total score - sum contributions for a chunk appearing in multiple lists
 * (dedupe by `id`), then return every chunk sorted by total score descending.
 */
export function reciprocalRankFusion(resultLists: ChunkRow[][], k = 60): ScoredChunk[] {
  const byId = new Map<number, ScoredChunk>();

  for (const list of resultLists) {
    list.forEach((chunk, index) => {
      const rank = index + 1;
      const contribution = 1 / (k + rank);
      const existing = byId.get(chunk.id);
      if (existing) {
        existing.score += contribution;
      } else {
        byId.set(chunk.id, { ...chunk, score: contribution });
      }
    });
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}
