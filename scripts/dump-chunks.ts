import { readFileSync, writeFileSync } from "node:fs";
import { chunkOperations } from "../src/chunker/operations.ts";
import { chunkSchemas } from "../src/chunker/schemas.ts";
import { chunkConcepts } from "../src/chunker/concepts.ts";
import { chunkUseCases } from "../src/chunker/usecases.ts";
import { chunkDocs } from "../src/chunker/docs.ts";

const knowledge = JSON.parse(readFileSync(new URL("../knowledge.json", import.meta.url), "utf-8"));

const chunks = [
  ...chunkOperations(knowledge),
  ...chunkSchemas(knowledge),
  ...chunkConcepts(knowledge),
  ...chunkUseCases(knowledge),
  ...chunkDocs(knowledge),
];

const bySourceType = new Map<string, number>();
for (const c of chunks) bySourceType.set(c.sourceType, (bySourceType.get(c.sourceType) ?? 0) + 1);

console.log("Total chunks:", chunks.length);
console.log("By sourceType:", Object.fromEntries(bySourceType));

writeFileSync(new URL("../chunks.json", import.meta.url), JSON.stringify(chunks, null, 2));
console.log("\nWrote chunks.json");
