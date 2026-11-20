import type { Chunk } from "./types.ts";
import { chunkOperations } from "./operations.ts";
import { chunkSchemas } from "./schemas.ts";

export type Knowledge = Parameters<typeof chunkOperations>[0] & Parameters<typeof chunkSchemas>[0];

export function buildAllChunks(knowledge: Knowledge): Chunk[] {
  return [...chunkOperations(knowledge), ...chunkSchemas(knowledge)];
}
