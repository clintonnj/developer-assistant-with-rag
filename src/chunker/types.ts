export type SourceType = "operation" | "schema" | "concept" | "usecase" | "doc";

export interface Chunk {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}
