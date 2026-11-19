import { readFileSync } from "node:fs";
import { chunkDocs } from "../src/chunker/docs.ts";

const knowledge = JSON.parse(readFileSync(new URL("../knowledge.json", import.meta.url), "utf-8"));
const chunks = chunkDocs(knowledge);

console.log("Total doc chunks:", chunks.length);

const seen = new Map<string, number>();
for (const c of chunks) seen.set(c.sourceId, (seen.get(c.sourceId) ?? 0) + 1);
const dupes = [...seen.entries()].filter(([, count]) => count > 1);
console.log("Duplicate sourceIds:", dupes.length ? dupes : "none");

for (const id of ["general", "authentication", "service-api-headers"]) {
  console.log(`\n--- ${id} ---`);
  console.log(chunks.find((c) => c.sourceId === id)?.text);
}

console.log("\n--- sample messages/workflows/search-features ---");
console.log(chunks.find((c) => c.sourceId.startsWith("messages-"))?.text);
console.log(chunks.find((c) => c.sourceId.startsWith("workflows-"))?.text);
console.log(chunks.find((c) => c.sourceId.startsWith("search-features-"))?.text);
