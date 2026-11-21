import type { Chunk } from "./types.ts";

// One implementation per source format (OpenAPI spec, markdown doc, Word doc, PDF, ...). Each
// chunker owns its own file I/O and format parsing internally - the registry (see index.ts) only
// ever depends on this interface, so adding a new format never requires changing existing ones.
export interface SourceChunker {
  readonly sourceName: string;
  chunk(): Chunk[] | Promise<Chunk[]>;
}
