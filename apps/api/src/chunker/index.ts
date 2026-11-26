import type { Chunk } from "./types.ts";
import type { SourceChunker } from "./sourceChunker.ts";
import { chunkOperations } from "./operations.ts";
import { chunkSchemas } from "./schemas.ts";
import { chunkMarkdownFile } from "./markdown.ts";
import { loadKnowledge } from "../knowledge/load.ts";

const DOCUMENTATION_PATH = new URL("../../corpus/Developer Portal Documentation for v1.md", import.meta.url);

// One SourceChunker per format. Adding Word/PDF/etc. later means adding another entry here, not
// touching any existing one (see sourceChunker.ts).
const openApiSourceChunker: SourceChunker = {
  sourceName: "openapi",
  chunk: () => {
    const knowledge = loadKnowledge();
    return [...chunkOperations(knowledge), ...chunkSchemas(knowledge)];
  },
};

const markdownSourceChunker: SourceChunker = {
  sourceName: "markdown",
  chunk: () => chunkMarkdownFile(DOCUMENTATION_PATH),
};

const SOURCE_CHUNKERS: SourceChunker[] = [openApiSourceChunker, markdownSourceChunker];

export async function chunkAllSources(): Promise<Chunk[]> {
  const results = await Promise.all(SOURCE_CHUNKERS.map((sourceChunker) => sourceChunker.chunk()));
  return results.flat();
}
