export interface ChunkRow {
  id: number;
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface ScoredChunk extends ChunkRow {
  score: number;
}

export interface RetrievalResult {
  question: string;
  chunks: ScoredChunk[];
}
