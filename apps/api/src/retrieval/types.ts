import type { ScoredChunk } from "@dev-assistant/shared-types";

export interface ChunkRow {
  id: number;
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

export type { ScoredChunk };

export interface RetrievalResult {
  question: string;
  chunks: ScoredChunk[];
}
